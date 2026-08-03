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
