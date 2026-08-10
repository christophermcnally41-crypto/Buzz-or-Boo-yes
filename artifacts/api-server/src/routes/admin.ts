import { Router, type IRouter } from "express";
import { eq, desc, sql, and, ne } from "drizzle-orm";
import { db, marketsTable, predictionsTable, usersTable, marketTemplatesTable } from "@workspace/db";
import {
  AdminListMarketsResponse,
  CreateMarketBody,
  CreateMarketResponse,
  ResolveMarketParams,
  ResolveMarketBody,
  ResolveMarketResponse,
  PatchMarketParams,
  PatchMarketBody,
  PatchMarketResponse,
} from "@workspace/api-zod";
import { z } from "zod";
import { refreshLeaderboardRanks } from "../lib/rankRefresh.js";

const router: IRouter = Router();

function enrichMarket(m: typeof marketsTable.$inferSelect) {
  const total = m.yesCount + m.noCount;
  return {
    ...m,
    closesAt: m.closesAt ? m.closesAt.toISOString() : null,
    resolvedAt: m.resolvedAt ? m.resolvedAt.toISOString() : null,
    publishAt: m.publishAt ? m.publishAt.toISOString() : null,
    peakUntil: m.peakUntil ? m.peakUntil.toISOString() : null,
    expireAt: m.expireAt ? m.expireAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    yesPercent: total > 0 ? Math.round((m.yesCount / total) * 100) : 50,
    noPercent: total > 0 ? Math.round((m.noCount / total) * 100) : 50,
  };
}

router.get("/admin/markets", requireAdmin, async (_req, res): Promise<void> => {
  const markets = await db
    .select()
    .from(marketsTable)
    .orderBy(desc(marketsTable.createdAt));

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketsTable);

  res.json(AdminListMarketsResponse.parse({ markets: markets.map(enrichMarket), total: count }));
});

router.post("/admin/markets", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMarketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, question, description, category, subcategory, imageUrl, resolutionSource, sourcePrimary, sourceBackup, baselineSnapshot, formula, voidRule, geo, closesAt, marketFormat, clockType, publishAt, peakUntil, expireAt, refreshRule, seriesId } = parsed.data;

  const [market] = await db
    .insert(marketsTable)
    .values({
      title,
      question,
      description: description ?? null,
      category,
      subcategory,
      marketFormat: marketFormat ?? "STANDARD",
      imageUrl: imageUrl ?? null,
      resolutionSource: resolutionSource ?? null,
      sourcePrimary: sourcePrimary ?? null,
      sourceBackup: sourceBackup ?? null,
      baselineSnapshot: baselineSnapshot ?? null,
      formula: formula ?? null,
      voidRule: voidRule ?? null,
      geo: geo ?? null,
      closesAt: closesAt ? new Date(closesAt) : null,
      status: "OPEN",
      clockType: clockType ?? "EVERGREEN",
      publishAt: publishAt ? new Date(publishAt) : null,
      peakUntil: peakUntil ? new Date(peakUntil) : null,
      expireAt: expireAt ? new Date(expireAt) : null,
      refreshRule: refreshRule ?? null,
      seriesId: seriesId ?? null,
    })
    .returning();

  res.status(201).json(CreateMarketResponse.parse(enrichMarket(market)));
});

router.patch("/admin/markets/:id", requireAdmin, async (req, res): Promise<void> => {
  // Must come before /admin/markets/:id/resolve so Express doesn't swallow it
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = PatchMarketParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = PatchMarketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  if (existing.status !== "OPEN") {
    res.status(400).json({ error: "Only OPEN markets can be edited" });
    return;
  }

  const {
    title, question, description, subcategory, imageUrl,
    geo, closesAt, resolutionSource, sourcePrimary, sourceBackup,
    baselineSnapshot, formula, voidRule,
  } = parsed.data;

  // Guard: when patching description for a choice-keyed format, ensure that
  // no key which already has predictions cast against it is removed or reused
  // for a different option.  Removing or renumbering such a key would silently
  // re-attribute existing votes to a different contender/option.
  // A null description on a voted choice-keyed market is also rejected: it
  // would wipe the key-to-label configuration while historical predictions remain.
  if (description !== undefined) {
    const isChoiceKeyed =
      existing.marketFormat === "MULTI_CHOICE" ||
      existing.marketFormat === "THE_CALL";

    if (isChoiceKeyed) {
      const castRows = await db
        .selectDistinct({ choice: predictionsTable.choice })
        .from(predictionsTable)
        .where(eq(predictionsTable.marketId, params.data.id));

      const castChoices = castRows.map(r => r.choice).filter(Boolean) as string[];

      if (castChoices.length > 0) {
        // Explicitly block null: clearing the description on a voted market
        // removes the key-to-label mapping while historical predictions remain.
        if (description === null) {
          res.status(400).json({
            error: `Cannot clear description on a ${existing.marketFormat} market with existing votes. Rename choice labels instead.`,
          });
          return;
        }

        // description is now narrowed to string — validate key integrity.
        try {
          const newDesc: unknown = JSON.parse(description as string);
          const newKeys = new Set<string>();
          if (existing.marketFormat === "MULTI_CHOICE") {
            ((newDesc as { contenders?: Array<{ key?: string }> })?.contenders ?? []).forEach(
              (c) => c.key && newKeys.add(c.key),
            );
          } else {
            ((newDesc as { options?: Array<{ key?: string }> })?.options ?? []).forEach(
              (o) => o.key && newKeys.add(o.key),
            );
          }
          const missingKeys = castChoices.filter(k => !newKeys.has(k));
          if (missingKeys.length > 0) {
            res.status(400).json({
              error: `Cannot remove choice keys that have existing votes: ${missingKeys.join(", ")}. Rename the label instead.`,
            });
            return;
          }
        } catch {
          // Malformed JSON on a choice-keyed format with existing votes is rejected:
          // we cannot validate key integrity against non-parseable content.
          res.status(400).json({
            error: "Description must be valid JSON for MULTI_CHOICE and THE_CALL markets",
          });
          return;
        }
      }
    }
  }

  // Build update object — only include fields explicitly provided
  const update: Partial<typeof marketsTable.$inferInsert> = {};
  if (title !== undefined) update.title = title;
  if (question !== undefined) update.question = question;
  if (description !== undefined) update.description = description ?? null;
  if (subcategory !== undefined) update.subcategory = subcategory;
  if (imageUrl !== undefined) update.imageUrl = imageUrl ?? null;
  if (geo !== undefined) update.geo = geo ?? null;
  if (closesAt !== undefined) update.closesAt = closesAt ? new Date(closesAt) : null;
  if (resolutionSource !== undefined) update.resolutionSource = resolutionSource ?? null;
  if (sourcePrimary !== undefined) update.sourcePrimary = sourcePrimary ?? null;
  if (sourceBackup !== undefined) update.sourceBackup = sourceBackup ?? null;
  if (baselineSnapshot !== undefined) update.baselineSnapshot = baselineSnapshot ?? null;
  if (formula !== undefined) update.formula = formula ?? null;
  if (voidRule !== undefined) update.voidRule = voidRule ?? null;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  // Atomically update only if the market is still OPEN — prevents a
  // TOCTOU race where the market is resolved/closed between the status
  // check above and this write.
  const [updated] = await db
    .update(marketsTable)
    .set(update)
    .where(and(eq(marketsTable.id, params.data.id), eq(marketsTable.status, "OPEN")))
    .returning();

  if (!updated) {
    // The market was resolved or closed between the read and the write.
    res.status(400).json({ error: "Market is no longer OPEN and cannot be edited" });
    return;
  }

  res.json(CreateMarketResponse.parse(enrichMarket(updated)));
});

router.patch("/admin/markets/:id/resolve", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ResolveMarketParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ResolveMarketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { outcome } = parsed.data;
  const marketId = params.data.id;

  // Fetch market to validate it exists and to check contender keys for MULTI_CHOICE
  const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, marketId));
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  // For MULTI_CHOICE, validate outcome is one of the declared contender keys
  if (market.marketFormat === "MULTI_CHOICE") {
    let validKeys: string[] = [];
    try {
      const desc = market.description ? JSON.parse(market.description) : null;
      if (Array.isArray(desc?.contenders)) {
        validKeys = desc.contenders.map((c: { key: string }) => c.key);
      }
    } catch { /* fall through — validKeys stays empty */ }

    if (validKeys.length === 0) {
      res.status(400).json({ error: "Market has no valid contenders to resolve against" });
      return;
    }
    if (!validKeys.includes(outcome)) {
      res.status(400).json({ error: `Invalid outcome. Must be one of: ${validKeys.join(", ")}` });
      return;
    }
  }

  // For THE_CALL, validate outcome is one of the declared option keys
  if (market.marketFormat === "THE_CALL") {
    let validKeys: string[] = [];
    try {
      const desc = market.description ? JSON.parse(market.description) : null;
      if (Array.isArray(desc?.options)) {
        validKeys = desc.options.map((o: { key: string }) => o.key);
      }
    } catch { /* fall through — validKeys stays empty */ }

    if (validKeys.length === 0) {
      res.status(400).json({ error: "Market has no valid options to resolve against" });
      return;
    }
    if (!validKeys.includes(outcome)) {
      res.status(400).json({ error: `Invalid outcome. Must be one of: ${validKeys.join(", ")}` });
      return;
    }
  }

  // Atomically resolve + award + auto-cycle inside a transaction.
  // The UPDATE WHERE status != RESOLVED acts as a compare-and-swap: only the first
  // concurrent request transitions the row; subsequent ones return 0 rows and bail.
  const REWARD_MULTIPLIER = 1.8;

  let resolved: typeof marketsTable.$inferSelect;

  try {
    resolved = await db.transaction(async (tx) => {
      // Conditional update — only succeeds if the market is not yet resolved
      const rows = await tx
        .update(marketsTable)
        .set({ status: "RESOLVED", resolvedOutcome: outcome, resolvedAt: new Date() })
        .where(and(eq(marketsTable.id, marketId), ne(marketsTable.status, "RESOLVED")))
        .returning();

      if (rows.length === 0) {
        throw new Error("ALREADY_RESOLVED");
      }

      const resolvedMarket = rows[0];

      // BUZZ_OR_BOO and THE_CALL markets are crowd snapshots — no win/loss, no token redistribution,
      // no accuracy updates. Just lock the current split/verdict and return.
      if (resolvedMarket.marketFormat !== "BUZZ_OR_BOO" && resolvedMarket.marketFormat !== "THE_CALL") {
        // Award tokens to correct predictors and update user stats
        const allPredictions = await tx
          .select()
          .from(predictionsTable)
          .where(eq(predictionsTable.marketId, marketId));

        for (const pred of allPredictions) {
          const isCorrect = pred.choice === outcome;
          const tokensEarned = isCorrect ? Math.round(pred.amount * REWARD_MULTIPLIER) : 0;

          await tx
            .update(predictionsTable)
            .set({ isCorrect, tokensEarned })
            .where(eq(predictionsTable.id, pred.id));

          const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, pred.userId));
          if (user) {
            const newResolved = user.totalResolved + 1;
            const newCorrect = user.totalCorrect + (isCorrect ? 1 : 0);
            const newAccuracy = newResolved > 0 ? Math.round((newCorrect / newResolved) * 100) / 100 : null;
            // BuzzScore: Brier-style 0–100 integer. For binary YES/NO predictions
            // without explicit confidence, Brier reduces to accuracy. Stored as an
            // integer so it displays cleanly as "73" rather than "0.73%".
            const newBuzzScore = newResolved > 0 ? Math.round((newCorrect / newResolved) * 100) : null;

            await tx
              .update(usersTable)
              .set({
                tokenBalance: user.tokenBalance + tokensEarned,
                totalResolved: newResolved,
                totalCorrect: newCorrect,
                overallAccuracy: newAccuracy,
                buzzScore: newBuzzScore,
              })
              .where(eq(usersTable.id, pred.userId));
          }
        }
      }

      // Monthly auto-cycle for recurring MULTI_CHOICE flagships
      if (market.marketFormat === "MULTI_CHOICE") {
        try {
          const desc = market.description ? JSON.parse(market.description) : null;
          if (desc?.recurring === true && Array.isArray(desc.contenders)) {
            // Check (inside the same tx) whether a successor already exists
            const [alreadyOpen] = await tx
              .select({ id: marketsTable.id })
              .from(marketsTable)
              .where(and(eq(marketsTable.title, market.title), eq(marketsTable.status, "OPEN")));

            if (!alreadyOpen) {
              // Derive successor period from the resolved edition's closesAt
              const resolvedCloses = market.closesAt ?? resolvedMarket.resolvedAt ?? new Date();
              const nextStart = new Date(Date.UTC(
                resolvedCloses.getUTCFullYear(),
                resolvedCloses.getUTCMonth() + 1,
                1,
              ));
              const nextMonthName = nextStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
              const nextPeriod = `${nextMonthName} ${nextStart.getUTCFullYear()}`;
              const nextCloses = new Date(Date.UTC(
                nextStart.getUTCFullYear(), nextStart.getUTCMonth() + 1, 0, 23, 59, 59,
              ));

              await tx.insert(marketsTable).values({
                title: market.title,
                question: market.question,
                description: JSON.stringify({ ...desc, period: nextPeriod }),
                category: market.category,
                subcategory: market.subcategory,
                marketFormat: "MULTI_CHOICE",
                imageUrl: market.imageUrl ?? null,
                resolutionSource: market.resolutionSource ?? null,
                status: "OPEN",
                closesAt: nextCloses,
              });
            }
          }
        } catch (cycleErr) {
          console.error("[auto-cycle] Failed to spawn next edition:", cycleErr);
          // Re-throw so the transaction rolls back rather than silently losing the cycle
          throw cycleErr;
        }
      }

      return resolvedMarket;
    });
  } catch (err: any) {
    if (err?.message === "ALREADY_RESOLVED") {
      res.status(400).json({ error: "Market is already resolved" });
      return;
    }
    throw err; // Let Express error handler deal with unexpected errors
  }

  // Refresh all users' stored rank after stats have been updated.
  // Fire-and-forget: rank staleness for a few ms is acceptable; the response
  // does not need to wait for it.
  refreshLeaderboardRanks().catch(() => {
    // already logged inside refreshLeaderboardRanks
  });

  res.json(ResolveMarketResponse.parse(enrichMarket(resolved)));
});

// ─── Admin auth guard ────────────────────────────────────────────────────────
// All /admin/* routes require an authenticated admin session.
// The authMiddleware (app.ts) has already resolved req.user from the session
// by this point; isAdmin must be true on the platform user record.

async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    // Re-check isAdmin from the authoritative DB record on every admin request.
    // This ensures that a demoted administrator loses access immediately rather
    // than retaining it for the remainder of their session lifetime.
    const platformId = parseInt(req.user?.id, 10);
    if (isNaN(platformId)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const [freshUser] = await db
      .select({ isAdmin: usersTable.isAdmin })
      .from(usersTable)
      .where(eq(usersTable.id, platformId));
    if (!freshUser?.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}


// ─── Template CRUD ──────────────────────────────────────────────────────────

const CreateTemplateBody = z.object({
  franchiseName: z.string().min(2),
  engine: z.enum(["STANDARD", "HOT_OR_NOT", "HEAD_TO_HEAD", "MULTI_CHOICE", "BUZZ_OR_BOO", "THE_CALL"]),
  templateQuestion: z.string().min(10),
  clockType: z.enum(["EVERGREEN", "SEASONAL", "NOW", "EVENT_DRIVEN", "ROLLING_FORECAST", "RECURRING_PULSE"]),
  category: z.enum(["STYLE", "HOME", "CITY", "REAL_ESTATE", "WEATHER", "CULTURE", "LOCAL_PULSE", "BEAUTY", "ACCESSORIES", "MOVIES"]),
  defaultDurationDays: z.number().int().positive(),
  description: z.string().optional(),
});

const CreateMarketFromTemplateBody = z.object({
  title: z.string().min(5),
  filledQuestion: z.string().min(10),
  subcategory: z.string().min(2),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  closesAt: z.string().optional(),
  clockType: z.enum(["EVERGREEN", "SEASONAL", "NOW", "EVENT_DRIVEN", "ROLLING_FORECAST", "RECURRING_PULSE"]).optional(),
  publishAt: z.string().optional(),
  peakUntil: z.string().optional(),
  expireAt: z.string().optional(),
  refreshRule: z.string().optional(),
  geo: z.string().optional(),
  seriesId: z.number().optional(),
});

function serializeTemplate(t: typeof marketTemplatesTable.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/admin/templates", requireAdmin, async (_req, res): Promise<void> => {
  const templates = await db
    .select()
    .from(marketTemplatesTable)
    .orderBy(marketTemplatesTable.franchiseName);
  res.json({ templates: templates.map(serializeTemplate) });
});

router.post("/admin/templates", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [template] = await db
    .insert(marketTemplatesTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(serializeTemplate(template));
});

router.post("/admin/templates/:id/create-market", requireAdmin, async (req, res): Promise<void> => {
  const templateId = Number(req.params.id);
  if (isNaN(templateId)) {
    res.status(400).json({ error: "Invalid template id" });
    return;
  }

  const [template] = await db
    .select()
    .from(marketTemplatesTable)
    .where(eq(marketTemplatesTable.id, templateId));

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const parsed = CreateMarketFromTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    title, filledQuestion, subcategory, description, imageUrl,
    closesAt, clockType, publishAt, peakUntil, expireAt, refreshRule, geo, seriesId,
  } = parsed.data;

  // Compute closesAt from template default duration if not provided
  const resolvedClosesAt = closesAt
    ? new Date(closesAt)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + template.defaultDurationDays);
        return d;
      })();

  const [market] = await db
    .insert(marketsTable)
    .values({
      title,
      question: filledQuestion,
      description: description ?? null,
      category: template.category,
      subcategory,
      marketFormat: template.engine as any,
      imageUrl: imageUrl ?? null,
      closesAt: resolvedClosesAt,
      status: "OPEN",
      clockType: clockType ?? template.clockType,
      publishAt: publishAt ? new Date(publishAt) : null,
      peakUntil: peakUntil ? new Date(peakUntil) : null,
      expireAt: expireAt ? new Date(expireAt) : null,
      refreshRule: refreshRule ?? null,
      geo: geo ?? null,
      seriesId: seriesId ?? null,
      templateId,
    })
    .returning();

  res.status(201).json(enrichMarket(market));
});

export default router;
