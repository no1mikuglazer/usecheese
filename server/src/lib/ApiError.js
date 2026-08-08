/* A thrown error that carries an HTTP status and a stable machine-readable
 * code. Anything else that reaches the error handler is treated as a 500.
 */

export class ApiError extends Error {
  constructor(status, code, details) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, details) {
    return new ApiError(400, code, details);
  }

  static notFound(code, details) {
    return new ApiError(404, code, details);
  }

  static unauthorized(code, details) {
    return new ApiError(401, code, details);
  }
}
