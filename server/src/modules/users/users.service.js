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

let statements = null;

function getStatements() {
  if (statements) return statements;

  const db = getUsersDb();
  statements = {
    byClerkId: db.prepare("SELECT * FROM users WHERE clerk_user_id = ?"),
    insert: db.prepare("INSERT INTO users (clerk_user_id, username) VALUES (?, ?)"),
  };
  return statements;
}

function toApiShape(row) {
  return {
    clerkUserId: row.clerk_user_id,
    username: row.username,
    createdAt: row.created_at,
  };
}

export async function getOrCreateUser(clerkUserId) {
  const stmts = getStatements();

  const existing = stmts.byClerkId.get(clerkUserId);
  if (existing) return toApiShape(existing);

  // First time this account has hit the API — pull the profile fields
  // getAuth() doesn't carry, and create the local row.
  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const username = clerkUser.username;

  if (!username) {
    // Shouldn't happen — Signup requires a username — but the column is
    // NOT NULL, so fail loudly here rather than let SQLite throw an opaque
    // constraint error instead. Same "should be unreachable" pattern as
    // puzzles.service.js's contiguous-range check.
    throw new Error(`Clerk user ${clerkUserId} has no username set`);
  }

  stmts.insert.run(clerkUserId, username);
  return toApiShape(stmts.byClerkId.get(clerkUserId));
}
