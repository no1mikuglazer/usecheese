/* Cheese — backend API client.
   Shared by any page that talks to the Cheese server. Load this file BEFORE
   the page's own script.js.

   The site has no build step, so there is nothing to inject an environment
   variable at deploy time — the base URL is chosen at runtime from the
   hostname instead. Opening the site from localhost talks to a locally
   running server; anywhere else talks to production. */

/* A page may have set this already in its <head> so it can start a request
   before the scripts finish loading (the Puzzles page does this). Reuse that
   value when present so both agree on a single base URL at runtime; otherwise
   derive it here as normal. */
const CHEESE_API_BASE =
  window.CHEESE_API_BASE ||
  (function () {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "") {
      return "http://localhost:3001/api";
    }
    return "https://api.usecheese.xyz/api";
  })();

/* Thrown for any non-2xx response. `code` carries the server's stable error
   code (e.g. "no_puzzles_in_range") so callers can branch on it instead of
   matching on message text. */
class CheeseApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `Request failed (${status})`);
    this.name = "CheeseApiError";
    this.status = status;
    this.code = code;
  }
}

async function cheeseApiRequest(path, options = {}) {
  let response;

  const { body: requestBody, ...rest } = options;

  try {
    // credentials: 'include' — without it, the browser never attaches
    // Clerk's session cookie on this cross-subdomain request (usecheese.xyz
    // calling api.usecheese.xyz), and every request looks signed-out no
    // matter what the server's CORS config allows. Harmless on endpoints
    // that don't care who's signed in; there just isn't a cookie to send
    // before anyone has signed in at all.
    response = await fetch(CHEESE_API_BASE + path, {
      credentials: "include",
      ...rest,
      ...(requestBody !== undefined
        ? {
            headers: { "Content-Type": "application/json", ...rest.headers },
            body: JSON.stringify(requestBody),
          }
        : {}),
    });
  } catch (networkError) {
    // fetch() only rejects on network-level failures — the server being down,
    // DNS failure, or CORS blocking the request.
    throw new CheeseApiError(0, "network_error", "Could not reach the server");
  }

  let body = null;
  try {
    body = await response.json();
  } catch (parseError) {
    body = null;
  }

  if (!response.ok) {
    throw new CheeseApiError(
      response.status,
      body && body.error ? body.error : "request_failed",
    );
  }

  return body;
}

/* Random puzzle within an inclusive rating range. */
function fetchRandomPuzzle(minRating, maxRating) {
  const params = new URLSearchParams({
    minRating: String(minRating),
    maxRating: String(maxRating),
  });
  return cheeseApiRequest("/puzzles/random?" + params.toString());
}

/* A specific puzzle by its Lichess id. */
function fetchPuzzleById(id) {
  return cheeseApiRequest("/puzzles/" + encodeURIComponent(id));
}

/* Total number of puzzles available. */
function fetchPuzzleStats() {
  return cheeseApiRequest("/puzzles/stats");
}

/* The signed-in user's profile, including persisted puzzle stats/rating.
   Requires a real Clerk session cookie — 401s otherwise. */
function fetchMyPuzzleProfile() {
  return cheeseApiRequest("/users/me");
}

/* Scores a completed puzzle attempt and persists the result. The server
   looks up the puzzle's own rating itself rather than trusting one from the
   client — see server/src/modules/users/users.service.js. */
function submitPuzzleResult(puzzleId, failed, usedHint) {
  return cheeseApiRequest("/users/me/puzzle-result", {
    method: "POST",
    body: { puzzleId, failed, usedHint },
  });
}
