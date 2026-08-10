/**
 * rankRefresh — recompute and persist leaderboard ranks for all eligible users.
 *
 * Called after any market resolution so the `rank` column on the users table
 * stays in sync with the leaderboard order computed by GET /leaderboard.
 *
 * Eligibility: totalResolved > 0 (same predicate used by GET /leaderboard).
 *
 * Ordering contract: normalized_buzz_score DESC, id ASC.
 *   - Primary key: buzz_score descending, with fraction-drift normalization:
 *     a value strictly between 0 and 1 is treated as a 0–1 fraction and scaled
 *     to 0–100 before ordering.  This keeps stored ranks consistent with the
 *     live leaderboard endpoints which apply the same normalization.
 *   - Tiebreaker: id ascending — deterministic, never changes.
 *
 * Rank function: ROW_NUMBER() — assigns a distinct sequential integer to every
 * user, exactly like the leaderboard route's `entries.map((u, i) => ({ rank: i + 1 }))`.
 * Tied users get different rank numbers, matching what the leaderboard displays.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/** Shared SQL normalization for buzz_score — mirrors normalizedScoreSql() in
 *  leaderboard.ts so that all three rank surfaces (stored rank, list order,
 *  /leaderboard/me) agree when buzz_score is stored as a decimal fraction. */
const NORMALIZED_BUZZ_SCORE_SQL = sql.raw(`
  CASE
    WHEN buzz_score > 0 AND buzz_score < 1 THEN ROUND(buzz_score * 100)
    ELSE LEAST(100, GREATEST(0, COALESCE(buzz_score, 0)))
  END
`);

export async function refreshLeaderboardRanks(): Promise<void> {
  try {
    // Single SQL UPDATE … FROM (subquery) to assign ranks in one round-trip.
    // ROW_NUMBER() matches the leaderboard's sequential i+1 assignment.
    await db.execute(sql`
      UPDATE users
      SET rank = ranked.new_rank
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY ${NORMALIZED_BUZZ_SCORE_SQL} DESC, id ASC
          ) AS new_rank
        FROM users
        WHERE total_resolved > 0
      ) AS ranked
      WHERE users.id = ranked.id
    `);

    logger.info("[rankRefresh] leaderboard ranks refreshed");
  } catch (err) {
    // Non-fatal: a rank refresh failure must never bubble up to the caller.
    // The next resolution will trigger another attempt.
    logger.error({ err }, "[rankRefresh] failed to refresh leaderboard ranks");
  }
}
