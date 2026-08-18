/* Cheese — shared helpers for the Log In and Sign Up forms.

   Both pages present the same thing: one form, one error line under it, and
   Clerk as the thing that can fail. These three helpers were byte-identical
   in each page's script.js. Load this file BEFORE the page's own script.js.

   Everything else about the two flows genuinely differs — sign-up has a
   username, a password confirmation and an optional email-verification step —
   so only these stay here. */

/* Shows a message in the page's error line. `errorEl` is the page's own
   element (#liError / #suError); both use the same .auth-error-visible class
   from assets/css/auth.css. */
function showAuthError(errorEl, message) {
  errorEl.textContent = message;
  errorEl.classList.add("auth-error-visible");
}

function clearAuthError(errorEl) {
  errorEl.textContent = "";
  errorEl.classList.remove("auth-error-visible");
}

/* Clerk reports failures as an `errors` array, most specific first, with
   `longMessage` being the human-readable form ("Password must be at least 8
   characters") and `message` the terse one. Prefer the long form, fall back
   to the caller's own wording when Clerk gave nothing usable — a network
   failure, for instance, has no `errors` at all. */
function messageFromClerkError(err, fallback) {
  const first = err && err.errors && err.errors[0];
  return (first && (first.longMessage || first.message)) || fallback;
}
