import { Router, type IRouter } from "express";
import { desc, sql, gt } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { GetLeaderboardQueryParams, GetLeaderboardResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res): Promise<void> => {
  const query = GetLeaderboardQueryParams.safeParse(req.query);
  const { category, limit = 20 } = query.success ? query.data : {};

  // Select the correct accuracy column based on category
  const accuracyCol = () => {
    switch (category) {
      case "STYLE": return usersTable.styleAccuracy;
      case "HOME": return usersTable.homeAccuracy;
      case "CITY": return usersTable.cityAccuracy;
      case "REAL_ESTATE": return usersTable.realEstateAccuracy;
      case "WEATHER": return usersTable.weatherAccuracy;
      case "CULTURE": return usersTable.cultureAccuracy;
      default: return usersTable.overallAccuracy;
    }
  };

  const col = accuracyCol();

  const users = await db
    .select()
    .from(usersTable)
    .where(gt(usersTable.totalResolved, 0))
    .orderBy(desc(col))
    .limit(limit ?? 20);

  const entries = users.map((u, i) => ({
    rank: i + 1,
    user: { ...u, createdAt: u.createdAt.toISOString() },
    accuracy: (category
      ? (category === "STYLE" ? u.styleAccuracy
        : category === "HOME" ? u.homeAccuracy
        : category === "CITY" ? u.cityAccuracy
        : category === "REAL_ESTATE" ? u.realEstateAccuracy
        : category === "WEATHER" ? u.weatherAccuracy
        : category === "CULTURE" ? u.cultureAccuracy
        : u.overallAccuracy)
      : u.overallAccuracy) ?? 0,
    totalPredictions: u.totalPredictions,
    totalCorrect: u.totalCorrect,
    tokensEarned: u.tokenBalance,
  }));

  res.json(GetLeaderboardResponse.parse(entries));
});

export default router;
