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
 * Compute a 0–100 BuzzScore for display given a user row and category.
 * - Overall: use the stored buzzScore integer directly.
 * - Category: convert the stored fraction (0–1) to 0–100.
 */
function getBuzzScore(u: typeof usersTable.$inferSelect, category: string | undefined): number {
  if (!category || category === "OVERALL") {
    return u.buzzScore ?? 0;
  }
  // Category accuracy stored as fraction 0–1; scale to 0–100
  return Math.round((getAccuracyValue(u, category)) * 100);
}

/** GET /leaderboard/me — authenticated user's own rank, independent of the list limit.
 *
 * Uses the same eligibility predicate as GET /leaderboard (totalResolved > 0).
 * Rank = count of eligible users whose sort column strictly exceeds the
 * current user's, using COALESCE(col, 0) so null and zero are treated equally.
 */
router.get("/leaderboard/me", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const query = GetMyLeaderboardEntryQueryParams.safeParse(req.query);
  const { category } = query.success ? query.data : {};

  const col = getAccuracyCol(category);
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
  const myAccuracy = getAccuracyValue(me, category);

  // Count eligible users whose COALESCE(col, 0) strictly exceeds the current user's
  const [{ higherCount }] = await db
    .select({ higherCount: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(and(
      gt(usersTable.totalResolved, 0),
      sql`COALESCE(${col}, 0) > ${!category || category === "OVERALL" ? myBuzzScore : myAccuracy}`
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

  const col = getAccuracyCol(category);

  const users = await db
    .select()
    .from(usersTable)
    .where(gt(usersTable.totalResolved, 0))
    .orderBy(sql`COALESCE(${col}, 0) DESC`)
    .limit(limit ?? 20);

  const entries = users.map((u, i) => ({
    rank: i + 1,
    user: { ...u, createdAt: u.createdAt.toISOString() },
    accuracy: getAccuracyValue(u, category),
    buzzScore: getBuzzScore(u, category),
    totalPredictions: u.totalPredictions,
    totalCorrect: u.totalCorrect,
    tokensEarned: u.tokenBalance,
  }));

  res.json(GetLeaderboardResponse.parse(entries));
});

export default router;
