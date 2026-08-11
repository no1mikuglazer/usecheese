/* User route handlers — translate authenticated requests into service
 * calls. requireAuth.js has already rejected anything without a valid
 * session by the time these run, so getAuth(req).userId is always present.
 */

import { getAuth } from "@clerk/express";
import * as usersService from "./users.service.js";
import { BANNERS, OPENINGS } from "../../lib/profileOptions.js";

export async function me(req, res) {
  const { userId } = getAuth(req);
  const user = await usersService.getOrCreateUser(userId);
  res.json(user);
}

export async function submitPuzzleResult(req, res) {
  const { userId } = getAuth(req);
  const { puzzleId, failed, usedHint } = req.validated.body;
  const result = await usersService.recordPuzzleResult(userId, puzzleId, failed, usedHint);
  res.json(result);
}

export async function publicProfile(req, res) {
  const { username } = req.validated.params;
  const profile = await usersService.getPublicProfile(username);
  res.json(profile);
}

export async function updateProfile(req, res) {
  const { userId } = getAuth(req);
  const updated = await usersService.updateProfile(userId, req.validated.body);
  res.json(updated);
}

export function profileOptions(req, res) {
  res.json({ banners: BANNERS, openings: OPENINGS });
}
