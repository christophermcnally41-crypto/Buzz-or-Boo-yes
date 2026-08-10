import { Router, type IRouter } from "express";
import { sql, gt, and } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { GetLeaderboardQueryParams, GetLeaderboardResponse, GetMyLeaderboardEntryQueryParams, GetMyLeaderboardEntryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/** Helper: pick the right accuracy column for a category string */
function getAccuracyCol(category: string | undefined) {
  switch (category) {
    case "STYLE": return usersTable.styleAccuracy;
    case "HOME": return usersTable.homeAccuracy;
    case "CITY": return usersTable.cityAccuracy;
    case "REAL_ESTATE": return usersTable.realEstateAccuracy;
    case "WEATHER": return usersTable.weatherAccuracy;
    case "CULTURE": return usersTable.cultureAccuracy;
    default: return usersTable.buzzScore;
  }
}

/** Helper: read accuracy value from a user row for a category */
function getAccuracyValue(u: typeof usersTable.$inferSelect, category: string | undefined): number {
  switch (category) {
    case "STYLE": return u.styleAccuracy ?? 0;
    case "HOME": return u.homeAccuracy ?? 0;
    case "CITY": return u.cityAccuracy ?? 0;
    case "REAL_ESTATE": return u.realEstateAccuracy ?? 0;
    case "WEATHER": return u.weatherAccuracy ?? 0;
    case "CULTURE": return u.cultureAccuracy ?? 0;
    default: return u.overallAccuracy ?? 0;
  }
}

/**
 * Normalize a raw score value to a 0–100 integer.
 *
 * Guards against schema drift where a value that should be 0–100 is instead
 * stored as a 0–1 decimal fraction (e.g. 0.82 instead of 82). Values that
 * are strictly between 0 and 1 exclusive are treated as fractions and scaled;
 * all other values are clamped to [0, 100] and rounded.
 */
function normalizeTo100(raw: number): number {
  const scaled = raw > 0 && raw < 1 ? raw * 100 : raw;
  return Math.round(Math.min(100, Math.max(0, scaled)));
}

/**
 * Clamp a raw accuracy value to the documented 0–1 range.
 * Guards against values accidentally written as percentages (e.g. 75 instead of 0.75).
 */
function normalizeAccuracy(raw: number): number {
  // If the value is > 1, treat as an already-scaled percentage and convert back.
  const fraction = raw > 1 ? raw / 100 : raw;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * Compute a 0–100 BuzzScore for display given a user row and category.
 * - Overall: use the stored buzzScore integer directly (normalized).
 * - Category: convert the stored fraction (0–1) to 0–100.
 */
function getBuzzScore(u: typeof usersTable.$inferSelect, category: string | undefined): number {
  if (!category || category === "OVERALL") {
    return normalizeTo100(u.buzzScore ?? 0);
  }
  // Category accuracy stored as fraction 0–1; scale to 0–100
  return normalizeTo100(getAccuracyValue(u, category));
}

/**
 * SQL expression that applies the same normalization as the JS helpers
 * (`normalizeTo100` / `normalizeAccuracy`) so that SQL ordering and rank-count
 * comparisons are consistent with the values emitted in the response.
 *
 * For OVERALL (buzz_score, integer 0–100):
 *   A value strictly between 0 and 1 is treated as a 0–1 fraction and scaled
 *   to 0–100 — mirrors `normalizeTo100`.
 *
 * For category accuracy columns (real 0–1 fraction):
 *   A value > 1 is treated as an accidentally-stored percentage and divided by
 *   100 — mirrors `normalizeAccuracy`. Ordering by the normalized fraction is
 *   then correct (higher fraction = higher rank).
 */
function normalizedScoreSql(col: ReturnType<typeof getAccuracyCol>, isOverall: boolean) {
  if (!isOverall) {
    // Category accuracy: normalize percentage drift (e.g. 75 → 0.75) so that
    // ordering matches the displayed/response value from normalizeAccuracy().
    return sql`
      CASE
        WHEN ${col} > 1 THEN ${col} / 100.0
        ELSE LEAST(1, GREATEST(0, COALESCE(${col}, 0)))
      END
    `;
  }
  // Overall buzz_score: normalize fraction drift before ordering.
  return sql`
    CASE
      WHEN ${col} > 0 AND ${col} < 1 THEN ROUND(${col} * 100)
      ELSE LEAST(100, GREATEST(0, COALESCE(${col}, 0)))
    END
  `;
}

/**
 * Shared ordering contract for all rank computations:
 *   PRIMARY:   normalizedScore DESC
 *   TIEBREAKER: id ASC  (lower id wins ties — stable, never changes)
 *
 * rankRefresh.ts uses the same order via ROW_NUMBER() so stored `rank` values
 * always agree with what these endpoints compute on-the-fly.
 */

/** GET /leaderboard/me — authenticated user's own rank, independent of the list limit.
 *
 * Uses the same eligibility predicate as GET /leaderboard (totalResolved > 0).
 * Rank = count of eligible users who sort BEFORE the current user under the
 * shared contract: normalizedScore strictly higher, OR same score with a lower id.
 */
router.get("/leaderboard/me", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const query = GetMyLeaderboardEntryQueryParams.safeParse(req.query);
  const { category } = query.success ? query.data : {};

  const isOverall = !category || category === "OVERALL";
  const col = getAccuracyCol(category);
  const scoreSql = normalizedScoreSql(col, isOverall);
  const platformUserId = parseInt(req.user.id, 10);

  // Fetch the authenticated user's own row
  const [me] = await db
    .select()
    .from(usersTable)
    .where(sql`${usersTable.id} = ${platformUserId}`)
    .limit(1);

  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // 204 only when the user has zero resolved predictions (not on the board at all)
  if (me.totalResolved === 0) {
    res.status(204).send();
    return;
  }

  const myBuzzScore = getBuzzScore(me, category);
  const myAccuracy = normalizeAccuracy(getAccuracyValue(me, category));

  // Use the same normalized score for rank comparison so fractional stored
  // values are treated consistently with how they appear in the response.
  const myScore = isOverall ? myBuzzScore : myAccuracy;

  // Count eligible users who sort BEFORE this user under the shared contract:
  //   normalizedScore strictly higher  OR  (same AND lower id — tiebreaker)
  const [{ higherCount }] = await db
    .select({ higherCount: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(and(
      gt(usersTable.totalResolved, 0),
      sql`(
        (${scoreSql}) > ${myScore}
        OR ((${scoreSql}) = ${myScore} AND ${usersTable.id} < ${platformUserId})
      )`
    ));

  const rank = (higherCount ?? 0) + 1;

  const entry = {
    rank,
    user: { ...me, createdAt: me.createdAt.toISOString() },
    accuracy: myAccuracy,
    buzzScore: myBuzzScore,
    totalPredictions: me.totalPredictions,
    totalCorrect: me.totalCorrect,
    tokensEarned: me.tokenBalance,
  };

  res.json(GetMyLeaderboardEntryResponse.parse(entry));
});

router.get("/leaderboard", async (req, res): Promise<void> => {
  const query = GetLeaderboardQueryParams.safeParse(req.query);
  const { category, limit = 20 } = query.success ? query.data : {};

  const isOverall = !category || category === "OVERALL";
  const col = getAccuracyCol(category);
  const scoreSql = normalizedScoreSql(col, isOverall);

  const users = await db
    .select()
    .from(usersTable)
    .where(gt(usersTable.totalResolved, 0))
    .orderBy(sql`(${scoreSql}) DESC, ${usersTable.id} ASC`)
    .limit(limit ?? 20);

  const entries = users.map((u, i) => ({
    rank: i + 1,
    user: { ...u, createdAt: u.createdAt.toISOString() },
    accuracy: normalizeAccuracy(getAccuracyValue(u, category)),
    buzzScore: getBuzzScore(u, category),
    totalPredictions: u.totalPredictions,
    totalCorrect: u.totalCorrect,
    tokensEarned: u.tokenBalance,
  }));

  res.json(GetLeaderboardResponse.parse(entries));
});

export default router;
