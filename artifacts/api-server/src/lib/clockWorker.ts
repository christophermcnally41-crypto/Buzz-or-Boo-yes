/**
 * Clock Worker — Market Bible v0.5 §40
 *
 * Runs on a regular interval inside the API server process.
 *
 * Responsibilities:
 *  1. Archive expired markets (expire_at < NOW() AND status = 'OPEN')
 *  2. For RECURRING_PULSE markets, spawn the next edition after archiving
 *  3. Recompute freshness_score for every OPEN market
 *  4. Auto-hide scheduled markets that have not yet reached their publish_at
 *
 * The worker is intentionally simple — no external queue, no separate process.
 * If the server restarts it catches up on the next tick.
 */

import { db, marketsTable } from "@workspace/db";
import { and, eq, lt, isNotNull, isNull, or, sql, ne } from "drizzle-orm";
import { logger } from "./logger";

const TICK_MS = 5 * 60 * 1000; // run every 5 minutes

/** Recompute a 0–100 freshness score.
 *  100 = at or before the start of the active window (publishAt) / no expiry.
 *  0   = at or past expire_at.
 *
 * The window baseline is `publishAt` (when the market becomes public), not
 * `createdAt` (when it was inserted). This prevents a market that is scheduled
 * in advance from appearing stale the moment it goes live.
 * Recurring successors created before their next publishAt therefore start at 100.
 */
function computeFreshness(
  publishAt: Date | null,
  createdAt: Date,
  expireAt: Date | null,
  peakUntil: Date | null,
  now: Date,
): number {
  if (!expireAt) return 100; // EVERGREEN — always fresh

  // If the market hasn't been published yet, score = 100 (not decaying before launch)
  const windowStart = publishAt ?? createdAt;
  if (now < windowStart) return 100;

  const totalMs = expireAt.getTime() - windowStart.getTime();
  if (totalMs <= 0) return 0;

  const remainingMs = expireAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;

  // Boost score while within the peak window
  if (peakUntil && now < peakUntil) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round((remainingMs / totalMs) * 100)));
}

/** Derive the next recurrence window dates from the current market.
 *  For MONTHLY cadence, the next edition opens on the 1st of the next month.
 */
function nextRecurrenceDates(
  market: typeof marketsTable.$inferSelect,
  now: Date,
): { publishAt: Date; peakUntil: Date | null; expireAt: Date | null } | null {
  const rule = (market.refreshRule ?? "").toUpperCase();

  if (rule === "MONTHLY" || rule === "") {
    const base = market.expireAt ?? market.closesAt ?? now;
    const nextStart = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1),
    );
    const nextEnd = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 2, 0, 23, 59, 59),
    );
    return { publishAt: nextStart, peakUntil: null, expireAt: nextEnd };
  }

  if (rule === "WEEKLY") {
    const base = market.expireAt ?? now;
    const nextStart = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextEnd = new Date(nextStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { publishAt: nextStart, peakUntil: null, expireAt: nextEnd };
  }

  return null; // unknown rule — don't recur automatically
}

export interface TickResult {
  archived: number;
  rolledForward: number;
  scored: number;
}

export async function tick(): Promise<TickResult> {
  const now = new Date();
  let rolledForward = 0;

  // ─── 1. Archive expired OPEN markets ────────────────────────────────────────
  const expired = await db
    .select()
    .from(marketsTable)
    .where(
      and(
        eq(marketsTable.status, "OPEN"),
        isNotNull(marketsTable.expireAt),
        lt(marketsTable.expireAt, now),
      ),
    );

  for (const market of expired) {
    // ─── ROLLING_FORECAST: advance the window instead of archiving ──────────
    if (market.clockType === "ROLLING_FORECAST" && market.expireAt) {
      const windowStart = market.publishAt ?? market.createdAt;
      const windowMs = market.expireAt.getTime() - windowStart.getTime();
      if (windowMs > 0) {
        const newPublishAt = market.expireAt;
        const newExpireAt = new Date(market.expireAt.getTime() + windowMs);
        const newPeakUntil = market.peakUntil
          ? new Date(market.peakUntil.getTime() + windowMs)
          : null;

        await db
          .update(marketsTable)
          .set({
            publishAt: newPublishAt,
            peakUntil: newPeakUntil,
            expireAt: newExpireAt,
            freshnessScore: 100, // fully fresh — window just rolled
          })
          .where(eq(marketsTable.id, market.id));

        rolledForward += 1;
        logger.info(
          { marketId: market.id, newExpireAt },
          "[clockWorker] advanced ROLLING_FORECAST window",
        );
        continue; // do NOT archive — market stays OPEN
      }
    }

    await db
      .update(marketsTable)
      .set({ status: "ARCHIVED", freshnessScore: 0 })
      .where(eq(marketsTable.id, market.id));

    logger.info({ marketId: market.id, title: market.title }, "[clockWorker] archived expired market");

    // ─── 2. Spawn next edition for RECURRING_PULSE markets ──────────────────
    if (market.clockType === "RECURRING_PULSE") {
      try {
        const nextDates = nextRecurrenceDates(market, now);
        if (!nextDates) continue;

        // Guard: skip if a CLOSED successor exists (manually closed — do not reopen).
        // The OPEN case is handled atomically by the ON CONFLICT clause below.
        const [closedSuccessor] = await db
          .select({ id: marketsTable.id })
          .from(marketsTable)
          .where(
            and(
              eq(marketsTable.title, market.title),
              eq(marketsTable.status, "CLOSED"),
            ),
          );

        if (closedSuccessor) {
          logger.info({ marketId: market.id }, "[clockWorker] closed successor exists, skipping spawn");
          continue;
        }

        const rootSeriesId = market.seriesId ?? market.id;

        // ON CONFLICT (title) WHERE status='OPEN' DO NOTHING targets the partial
        // unique index markets_open_title_unique and triggers PostgreSQL's speculative
        // insertion.  Concurrent tick() calls that both try to spawn a successor for
        // the same title will block on each other at the index level — only one
        // INSERT succeeds, the other silently skips — no duplicate, no error.
        await db.execute(sql`
          INSERT INTO markets
            (title, question, description, category, subcategory,
             market_format, image_url, resolution_source, source_primary,
             source_backup, formula, void_rule, geo,
             status, clock_type, publish_at, peak_until,
             expire_at, refresh_rule, closes_at, series_id)
          VALUES
            (${market.title}, ${market.question}, ${market.description},
             ${market.category}, ${market.subcategory},
             ${market.marketFormat}, ${market.imageUrl}, ${market.resolutionSource},
             ${market.sourcePrimary}, ${market.sourceBackup},
             ${market.formula}, ${market.voidRule}, ${market.geo},
             ${'OPEN'}, ${'RECURRING_PULSE'}, ${nextDates.publishAt}, ${nextDates.peakUntil},
             ${nextDates.expireAt}, ${market.refreshRule}, ${nextDates.expireAt}, ${rootSeriesId})
          ON CONFLICT (title) WHERE status = 'OPEN' DO NOTHING
        `);

        logger.info(
          { parentId: market.id, seriesId: rootSeriesId },
          "[clockWorker] spawned recurring successor",
        );
      } catch (err) {
        logger.error({ err, marketId: market.id }, "[clockWorker] failed to spawn successor");
      }
    }
  }

  // ─── 3. Recompute freshness_score for all OPEN markets with an expiry ───────
  const openWithExpiry = await db
    .select()
    .from(marketsTable)
    .where(and(eq(marketsTable.status, "OPEN"), isNotNull(marketsTable.expireAt)));

  for (const market of openWithExpiry) {
    const score = computeFreshness(
      market.publishAt,
      market.createdAt,
      market.expireAt,
      market.peakUntil,
      now,
    );
    if (market.freshnessScore !== score) {
      await db
        .update(marketsTable)
        .set({ freshnessScore: score })
        .where(eq(marketsTable.id, market.id));
    }
  }

  const archived = expired.length - rolledForward;
  if (archived > 0 || rolledForward > 0 || openWithExpiry.length > 0) {
    logger.info(
      { archived, rolledForward, scored: openWithExpiry.length },
      "[clockWorker] tick complete",
    );
  }

  return { archived, rolledForward, scored: openWithExpiry.length };
}

let _interval: ReturnType<typeof setInterval> | null = null;

export function startClockWorker(): void {
  if (_interval) return; // already running

  // Run once immediately on startup to catch up any markets that expired
  // while the server was down, then schedule regular ticks.
  tick()
    .then((result) => {
      if (result.archived > 0 || result.rolledForward > 0) {
        logger.warn(
          { caught_up_archived: result.archived, caught_up_rolled: result.rolledForward },
          "[clockWorker] startup catch-up: processed markets that expired during downtime",
        );
      } else {
        logger.info("[clockWorker] startup catch-up: no missed markets");
      }
    })
    .catch((err) => logger.error({ err }, "[clockWorker] initial tick failed"));

  _interval = setInterval(() => {
    tick().catch((err) => logger.error({ err }, "[clockWorker] tick failed"));
  }, TICK_MS);
  logger.info({ intervalMs: TICK_MS }, "[clockWorker] started");
}

export function stopClockWorker(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
    logger.info("[clockWorker] stopped");
  }
}
