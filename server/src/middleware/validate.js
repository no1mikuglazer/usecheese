/* Request validation via zod.
 *
 * Validates one part of the request (`query` or `params`) and replaces it with
 * the parsed/coerced result, so handlers receive clean typed values instead of
 * raw strings. Validation failures become 400s through the error handler.
 */

import { ApiError } from "../lib/ApiError.js";

export function validate(schema, source = "query") {
  return function (req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return next(ApiError.badRequest("invalid_request", details));
    }

    // req.query is a getter-only property in Express 5; attach the parsed
    // values separately rather than assigning over it.
    req.validated = { ...(req.validated || {}), [source]: result.data };
    next();
  };
}
