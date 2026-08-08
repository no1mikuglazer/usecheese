/* Per-route auth gate.
 *
 * @clerk/express's own requireAuth() is documented as deprecated and, more
 * importantly, wrong for this API even if it weren't: it responds to an
 * unauthenticated request by REDIRECTING, which is built for full-stack
 * apps with a sign-in page — not a JSON API. Everything else in this
 * codebase fails through ApiError -> errorHandler as `{ error, details? }`;
 * this is that same shape for "no valid session", not a special case.
 *
 * clerkMiddleware() is mounted globally in app.js, so getAuth(req) is
 * available on every request, whether or not a route actually requires it.
 */

import { getAuth } from "@clerk/express";
import { ApiError } from "../lib/ApiError.js";

export function requireAuth(req, res, next) {
  const { userId } = getAuth(req);

  if (!userId) {
    return next(ApiError.unauthorized("authentication_required"));
  }

  next();
}
