/* User account records — synced from Clerk on first sight.
 *
 * getAuth(req) (session verification, in requireAuth.js) only ever returns
 * IDs — it never carries profile fields like username. Those live on
 * Clerk's full user object, a separate network call
 * (clerkClient.users.getUser). That call only happens once, the first time
 * a given clerk_user_id is seen here: once the local row exists, every
 * later request is a single SQLite read with no Clerk round trip.
 */

import { clerkClient } from "@clerk/express";
import { getUsersDb } from "../../db/usersConnection.js";
import { getPuzzleById } from "../puzzles/puzzles.service.js";
import { computeRatingDelta } from "../../lib/puzzleRating.js";

let statements = null;

function getStatements() {
  if (statements) return statements;

  const db = getUsersDb();
  statements = {
    byClerkId: db.prepare("SELECT * FROM users WHERE clerk_user_id = ?"),
    insertUser: db.prepare("INSERT INTO users (clerk_user_id, username) VALUES (?, ?)"),
    statsByClerkId: db.prepare("SELECT * FROM puzzle_stats WHERE clerk_user_id = ?"),
    insertStats: db.prepare("INSERT INTO puzzle_stats (clerk_user_id) VALUES (?)"),
    updateStats: db.prepare(`
      UPDATE puzzle_stats
      SET rating = ?, solved = ?, attempted = ?, best_streak = ?, current_streak = ?,
          last_solved_at = COALESCE(?, last_solved_at)
      WHERE clerk_user_id = ?
    `),
    insertAttempt: db.prepare(`
      INSERT INTO puzzle_attempts
        (clerk_user_id, puzzle_id, puzzle_rating, themes, failed, used_hint, rating_delta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
  };
  return statements;
}

function toApiShape(userRow, statsRow) {
  return {
    clerkUserId: userRow.clerk_user_id,
    username: userRow.username,
    createdAt: userRow.created_at,
    puzzleStats: {
      rating: statsRow.rating,
      solved: statsRow.solved,
      attempted: statsRow.attempted,
      currentStreak: statsRow.current_streak,
      bestStreak: statsRow.best_streak,
    },
  };
}

export async function getOrCreateUser(clerkUserId) {
  const stmts = getStatements();

  const existing = stmts.byClerkId.get(clerkUserId);
  if (existing) {
    // An account created before this pass only had a `users` row — Stage 3
    // never inserted into puzzle_stats. Backfill it here rather than
    // crashing on a missing row for every account that predates rating.
    const stats = stmts.statsByClerkId.get(clerkUserId) ?? backfillStats(clerkUserId);
    return toApiShape(existing, stats);
  }

  // First time this account has hit the API — pull the profile fields
  // getAuth() doesn't carry, and create the local rows.
  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const username = clerkUser.username;

  if (!username) {
    // Shouldn't happen — Signup requires a username — but the column is
    // NOT NULL, so fail loudly here rather than let SQLite throw an opaque
    // constraint error instead. Same "should be unreachable" pattern as
    // puzzles.service.js's contiguous-range check.
    throw new Error(`Clerk user ${clerkUserId} has no username set`);
  }

  const db = getUsersDb();
  const createUserAndStats = db.transaction(() => {
    stmts.insertUser.run(clerkUserId, username);
    stmts.insertStats.run(clerkUserId);
  });
  createUserAndStats();

  return toApiShape(stmts.byClerkId.get(clerkUserId), stmts.statsByClerkId.get(clerkUserId));
}

function backfillStats(clerkUserId) {
  const stmts = getStatements();
  stmts.insertStats.run(clerkUserId);
  return stmts.statsByClerkId.get(clerkUserId);
}

/* Scores a completed puzzle attempt and persists the result. `failed`/
 * `usedHint` are self-reported by the client — the server independently
 * looks up the puzzle's own rating (never trusting a client-supplied
 * number) but has no way to verify the attempt itself actually happened as
 * described. Accepted as a soft, bypassable limitation for now, same
 * posture as the anonymous puzzle-count gate elsewhere in this app: real
 * server-side move verification is only worth building if this is actually
 * abused.
 */
export async function recordPuzzleResult(clerkUserId, puzzleId, failed, usedHint) {
  // Guarantees both rows exist before puzzle_stats is touched below.
  await getOrCreateUser(clerkUserId);

  const puzzle = getPuzzleById(puzzleId);

  const correct = !failed && !usedHint;
  const delta = computeRatingDelta(puzzle.rating, correct);

  const stmts = getStatements();
  const db = getUsersDb();

  const applyResult = db.transaction(() => {
    const stats = stmts.statsByClerkId.get(clerkUserId);
    const rating = Math.max(0, stats.rating + delta);
    const solved = stats.solved + (correct ? 1 : 0);
    const attempted = stats.attempted + 1;
    const currentStreak = correct ? stats.current_streak + 1 : 0;
    const bestStreak = Math.max(stats.best_streak, currentStreak);
    const lastSolvedAt = correct ? new Date().toISOString() : null;

    stmts.updateStats.run(
      rating,
      solved,
      attempted,
      bestStreak,
      currentStreak,
      lastSolvedAt,
      clerkUserId,
    );

    // Pure data collection for a future stats/improvement-areas feature —
    // nothing reads this table yet. Themes stored space-separated, matching
    // how the puzzles table itself already stores them (puzzles.service.js).
    stmts.insertAttempt.run(
      clerkUserId,
      puzzle.id,
      puzzle.rating,
      puzzle.themes.join(" "),
      failed ? 1 : 0,
      usedHint ? 1 : 0,
      delta,
    );

    return stmts.statsByClerkId.get(clerkUserId);
  });

  const updatedStats = applyResult();

  return {
    delta,
    puzzleStats: {
      rating: updatedStats.rating,
      solved: updatedStats.solved,
      attempted: updatedStats.attempted,
      currentStreak: updatedStats.current_streak,
      bestStreak: updatedStats.best_streak,
    },
  };
}
