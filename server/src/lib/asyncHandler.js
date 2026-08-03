/* Wraps an async route handler so a rejected promise reaches the error
 * middleware instead of hanging the request. Express 4 does not forward
 * async rejections on its own.
 */

export function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
