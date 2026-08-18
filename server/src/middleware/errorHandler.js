/* Central error handler — every failed request leaves through here with the
 * same JSON shape: { error, details? }.
 *
 * Stack traces are logged server-side but never sent to the client.
 */

import { ApiError } from "../lib/ApiError.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: "route_not_found" });
}

// Express identifies error middleware by arity — `next` must stay declared
// even though it is unused. (eslint.config.mjs sets `args: "none"`, so no
// per-line disable is needed for it.)
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    const body = { error: err.code };
    if (err.details !== undefined) body.details = err.details;
    return res.status(err.status).json(body);
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: "internal_server_error" });
}
