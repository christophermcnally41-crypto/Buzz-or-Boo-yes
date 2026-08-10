/**
 * rankRefresh — recompute and persist leaderboard ranks for all eligible users.
 *
 * Called after any market resolution so the `rank` column on the users table
 * stays in sync with the leaderboard order computed by GET /leaderboard.
 *
 * Eligibility: totalResolved > 0 (same predicate used by GET /leaderboard).
 *
 * Ordering contract: COALESCE(buzz_score, 0) DESC, id ASC.
 *   - Primary key: buzz_score descending (same as the leaderboard route).
 *   - Tiebreaker: id ascending — deterministic, never changes, mirrors the
 *     stable sub-order the database uses when the leaderboard page is small
 *     enough to fetch all rows in one shot.
 *
 * Rank function: ROW_NUMBER() — assigns a distinct sequential integer to every
 * user, exactly like the leaderboard route's `entries.map((u, i) => ({ rank: i + 1 }))`.
 * Tied users get different rank numbers, matching what the leaderboard displays.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

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
            ORDER BY COALESCE(buzz_score, 0) DESC, id ASC
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
