/* Rate limiting for /api.
 *
 * Generous by design: a puzzle trainer fetches roughly one puzzle every
 * 10-30 seconds per user, so this has plenty of headroom for normal use while
 * still slowing down bulk scraping of the puzzle table.
 */

import rateLimit from "express-rate-limit";

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limit_exceeded" },
});

// A second, tighter limiter layered on top of the one above (not a
// replacement) for the write endpoints that actually change stored data:
// submitting a puzzle result and editing a profile. 120/min is fine for
// read-heavy browsing; it's far too generous for "how many times can a
// script hammer my own account's rating/stats/username." 30/min is still
// well above any real solving pace or edit-panel usage (rapid puzzle
// solving tops out around one every few seconds) while meaningfully
// capping scripted abuse. Keyed by IP, same as the global limiter — these
// routes already require a valid Clerk session, so this is on top of auth,
// not instead of it.
export const userMutationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limit_exceeded" },
});
