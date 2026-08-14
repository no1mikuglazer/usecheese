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
import { BANNER_KEYS, OPENING_NAMES } from "../../lib/profileOptions.js";
import { ApiError } from "../../lib/ApiError.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_ACTIVITY_LIMIT = 15;
const MIN_THEME_ATTEMPTS = 5;

// Lichess mixes game-phase, length, and evaluation descriptors in with real
// tactical motifs — none of these describe a *skill*, so "weak at short
// puzzles" or "weak at middlegame" would be meaningless noise in the
// strengths/weaknesses breakdown. Deliberately does NOT exclude "mate"/
// "mateIn2" etc. — finding forced mates is a real, trackable skill.
const NON_MOTIF_THEMES = new Set([
  "short", "long", "oneMove", "veryLong",
  "advantage", "crushing", "equality",
  "middlegame", "endgame", "opening",
  "master", "masterVsMaster", "superGM",
]);

let statements = null;

function getStatements() {
  if (statements) return statements;

  const db = getUsersDb();
  statements = {
    byClerkId: db.prepare("SELECT * FROM users WHERE clerk_user_id = ?"),
    byUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
    insertUser: db.prepare("INSERT INTO users (clerk_user_id, username) VALUES (?, ?)"),
    updateUsername: db.prepare(
      "UPDATE users SET username = ?, username_changed_at = ? WHERE clerk_user_id = ?",
    ),
    updateCustomization: db.prepare(
      "UPDATE users SET banner = ?, favorite_opening = ? WHERE clerk_user_id = ?",
    ),
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
        (clerk_user_id, puzzle_id, puzzle_rating, themes, failed, used_hint, rating_delta,
         rating_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    recentAttempts: db.prepare(`
      SELECT puzzle_id, puzzle_rating, themes, failed, used_hint, rating_delta, attempted_at
      FROM puzzle_attempts
      WHERE clerk_user_id = ?
      ORDER BY attempted_at DESC, id DESC
      LIMIT ?
    `),
    ratingHistory: db.prepare(`
      SELECT rating_after, attempted_at
      FROM puzzle_attempts
      WHERE clerk_user_id = ? AND rating_after IS NOT NULL
      ORDER BY attempted_at ASC, id ASC
    `),
    allThemeAttempts: db.prepare(
      "SELECT themes, failed, used_hint FROM puzzle_attempts WHERE clerk_user_id = ?",
    ),
  };
  return statements;
}

function toApiShape(userRow, statsRow) {
  return {
    clerkUserId: userRow.clerk_user_id,
    username: userRow.username,
    createdAt: userRow.created_at,
    banner: userRow.banner || "default",
    favoriteOpening: userRow.favorite_opening,
    puzzleStats: {
      rating: statsRow.rating,
      solved: statsRow.solved,
      attempted: statsRow.attempted,
      currentStreak: statsRow.current_streak,
      bestStreak: statsRow.best_streak,
    },
  };
}

function toActivityShape(row) {
  return {
    puzzleId: row.puzzle_id,
    puzzleRating: row.puzzle_rating,
    themes: row.themes ? row.themes.split(" ").filter(Boolean) : [],
    correct: !row.failed && !row.used_hint,
    delta: row.rating_delta,
    attemptedAt: row.attempted_at,
  };
}

// Tallies attempts/solves per real tactical theme, requires MIN_THEME_ATTEMPTS
// before a theme qualifies (so a single miss can't read as a "weakness"),
// then takes the extremes by solve rate. Math.max(3, length - 3) as the
// strengths start index guarantees it can never overlap with the first 3
// (weaknesses) even when there are fewer than 6 qualifying themes total —
// it just yields a shorter strengths list instead of double-counting.
//
// `inProgress` surfaces the themes that haven't hit the threshold yet, each
// with how many more attempts are needed — the "N more puzzles to unlock
// this" counter on the profile page. Sorted closest-to-unlocking first,
// capped at 6 so a puzzle history with dozens of rare themes doesn't turn
// this into a wall of near-zero-progress rows.
function computeThemeBreakdown(rows) {
  const tally = new Map();

  for (const row of rows) {
    if (!row.themes) continue;
    const correct = !row.failed && !row.used_hint;

    for (const theme of row.themes.split(" ")) {
      if (!theme || NON_MOTIF_THEMES.has(theme)) continue;
      const entry = tally.get(theme) || { theme, attempts: 0, solved: 0 };
      entry.attempts += 1;
      if (correct) entry.solved += 1;
      tally.set(theme, entry);
    }
  }

  const all = [...tally.values()];

  const qualifying = all
    .filter((t) => t.attempts >= MIN_THEME_ATTEMPTS)
    .map((t) => ({ ...t, solveRate: t.solved / t.attempts }))
    .sort((a, b) => a.solveRate - b.solveRate);

  const inProgress = all
    .filter((t) => t.attempts < MIN_THEME_ATTEMPTS)
    .map((t) => ({ theme: t.theme, attempts: t.attempts, remaining: MIN_THEME_ATTEMPTS - t.attempts }))
    .sort((a, b) => a.remaining - b.remaining || b.attempts - a.attempts)
    .slice(0, 6);

  return {
    weaknesses: qualifying.slice(0, 3),
    strengths: qualifying.slice(Math.max(3, qualifying.length - 3)).reverse(),
    inProgress,
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

    // Themes stored space-separated, matching how the puzzles table itself
    // already stores them (puzzles.service.js). rating_after is the rating
    // resulting from THIS attempt — the profile page's rating chart plots
    // these directly rather than replaying deltas.
    stmts.insertAttempt.run(
      clerkUserId,
      puzzle.id,
      puzzle.rating,
      puzzle.themes.join(" "),
      failed ? 1 : 0,
      usedHint ? 1 : 0,
      delta,
      rating,
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

/* Public profile — no auth required, viewable by anyone via username.
 * Assembles identity, customization, stats, and the three derived
 * insight sections (recent activity, rating history, theme breakdown)
 * in one response so the profile page needs exactly one fetch.
 */
export async function getPublicProfile(username) {
  const stmts = getStatements();

  const user = stmts.byUsername.get(username);
  if (!user) {
    throw ApiError.notFound("user_not_found");
  }

  const stats = stmts.statsByClerkId.get(user.clerk_user_id) ?? backfillStats(user.clerk_user_id);

  // Clerk owns the avatar — one call per profile view, same as
  // getOrCreateUser's first-sight lookup.
  const clerkUser = await clerkClient.users.getUser(user.clerk_user_id);

  const recentActivity = stmts.recentAttempts
    .all(user.clerk_user_id, RECENT_ACTIVITY_LIMIT)
    .map(toActivityShape);

  const ratingHistory = stmts.ratingHistory
    .all(user.clerk_user_id)
    .map((row) => ({ rating: row.rating_after, attemptedAt: row.attempted_at }));

  const themeBreakdown = computeThemeBreakdown(stmts.allThemeAttempts.all(user.clerk_user_id));

  return {
    username: user.username,
    memberSince: user.created_at,
    banner: user.banner || "default",
    favoriteOpening: user.favorite_opening,
    imageUrl: clerkUser.hasImage ? clerkUser.imageUrl : null,
    puzzleStats: {
      rating: stats.rating,
      solved: stats.solved,
      attempted: stats.attempted,
      currentStreak: stats.current_streak,
      bestStreak: stats.best_streak,
    },
    recentActivity,
    ratingHistory,
    themeBreakdown,
  };
}

/* Applies any of username/banner/favoriteOpening. Username changes hit
 * Clerk FIRST — it owns uniqueness, and the sidebar/nav read the name from
 * Clerk's own session, so a local-only change would desync the UI from
 * what Clerk still thinks is true. Only after Clerk confirms does the local
 * row (and the 14-day timestamp) update.
 */
export async function updateProfile(clerkUserId, patch) {
  const stmts = getStatements();
  await getOrCreateUser(clerkUserId); // guarantees both rows exist

  if (patch.banner !== undefined && !BANNER_KEYS.has(patch.banner)) {
    throw ApiError.badRequest("invalid_banner");
  }
  if (
    patch.favoriteOpening !== undefined &&
    patch.favoriteOpening !== null &&
    !OPENING_NAMES.has(patch.favoriteOpening)
  ) {
    throw ApiError.badRequest("invalid_opening");
  }

  if (patch.username !== undefined) {
    const current = stmts.byClerkId.get(clerkUserId);

    if (current.username_changed_at) {
      const availableAt = new Date(current.username_changed_at).getTime() + FOURTEEN_DAYS_MS;
      if (Date.now() < availableAt) {
        throw ApiError.badRequest("username_change_too_soon", {
          availableAt: new Date(availableAt).toISOString(),
        });
      }
    }

    try {
      await clerkClient.users.updateUser(clerkUserId, { username: patch.username });
    } catch (err) {
      // Clerk owns uniqueness/format validation — surface its own message
      // (e.g. "that username is taken") rather than a generic failure.
      const message = err?.errors?.[0]?.message || "Could not update username";
      throw ApiError.badRequest("username_update_failed", { message });
    }

    stmts.updateUsername.run(patch.username, new Date().toISOString(), clerkUserId);
  }

  if (patch.banner !== undefined || patch.favoriteOpening !== undefined) {
    const current = stmts.byClerkId.get(clerkUserId);
    stmts.updateCustomization.run(
      patch.banner !== undefined ? patch.banner : current.banner,
      patch.favoriteOpening !== undefined ? patch.favoriteOpening : current.favorite_opening,
      clerkUserId,
    );
  }

  return toApiShape(stmts.byClerkId.get(clerkUserId), stmts.statsByClerkId.get(clerkUserId));
}
