/* Cheese — shared Clerk client.
   Loaded after the Clerk CDN <script> tag and before the page's own
   script.js, on every page — see each page's own script tags for the exact
   order, matching how chess.js + board-core.js are already loaded.

   The CDN script tag carries a `data-clerk-publishable-key` attribute —
   that's what turns on the global `window.Clerk` SINGLETON used below
   (`Clerk.load()`, not `new Clerk(key)`). Without that attribute the bundle
   throws "Missing publishableKey" during its own load and never exposes a
   usable Clerk, which silently breaks everything downstream — confirmed by
   actually hitting that failure while building this, not assumed from docs.

   Two jobs:
   1. Expose the loaded singleton as `window.cheeseClerk` / a ready-promise
      `window.cheeseClerkReady`, so pages/signup/script.js and
      pages/login/script.js can call clerk.client.signUp / clerk.client.signIn
      once it's actually loaded.
   2. Swap the nav's .left-nav-auth block between signed-out (already baked
      into every page's HTML — the real, live buttons from the previous
      stage) and signed-in (built here) based on the real session. Pages
      with no sidebar (Signup, Login) simply have no .left-nav-auth element,
      so this is a safe no-op there.

   The key on the script tag is a PUBLISHABLE key, meant to be public —
   Clerk's own docs embed it directly in HTML. It identifies which Clerk
   application frontend requests belong to; it grants no access to secrets
   or other users' data. This is now the PRODUCTION key (pk_live_…), served
   from clerk.usecheese.xyz rather than Clerk's shared *.clerk.accounts.dev
   subdomain — that domain is a CNAME onto Clerk's infrastructure, set up
   and DNS-verified 2026-08-07. Development-instance accounts (pk_test_…,
   used while building this) do NOT carry over; this is a separate, empty
   user pool that starts fresh from here.
*/

window.cheeseClerk = window.Clerk;
window.cheeseClerkReady = window.Clerk.load().then(() => window.Clerk);

// ── Nav auth block ──────────────────────────────────────────────────────
// This is a multi-page static site with no client-side routing, so every
// navigation is a full reload of static HTML that starts out signed-out by
// default. Clerk.load() is a real, network-bound wait, so simply hiding
// the block until it resolves (the previous version of this file) still
// means every single page load pays that wait before showing anything.
//
// The fix is a last-known-result cache in localStorage: on every real
// render, remember what was shown. On the NEXT page load, read that
// synchronously (no network, no waiting) and paint it immediately, before
// Clerk has even started resolving — then silently correct it once Clerk's
// real answer comes in, which only produces a visible change on the rare
// occasion the cached guess was stale (session expired, signed out in
// another tab). First-ever visit has no cached guess yet, so it falls back
// to the plain hidden-until-known behaviour.
//
// This is a display hint only, not a credential — it stores the same
// name/avatar URL already rendered in the page every time someone is
// signed in. It grants no access; Clerk's own session check below is what
// actually decides and is always the final word.

const AUTH_HINT_KEY = "cheeseAuthHint";

function readAuthHint() {
  try {
    const raw = localStorage.getItem(AUTH_HINT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeAuthHint(hint) {
  try {
    localStorage.setItem(AUTH_HINT_KEY, JSON.stringify(hint));
  } catch (e) {
    // Private mode / quota exceeded — falls back to the plain
    // hidden-until-Clerk-resolves path on the next load, same as before
    // this existed.
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const navAuthContainer = document.querySelector(".left-nav-auth");

if (navAuthContainer) {
  // The real, live signed-out markup baked into this page's HTML —
  // captured immediately, before anything below touches the container.
  const signedOutHTML = navAuthContainer.innerHTML;

  // Clerk's own `imageUrl` is never empty — when a user hasn't uploaded a
  // photo (or one wasn't copied from OAuth), it points at a Clerk-generated
  // placeholder image (a colourful gradient tile with an icon baked into
  // the pixels), not a blank. `hasImage` is what distinguishes "real photo"
  // from "Clerk's own placeholder" — false means Clerk is currently serving
  // its own generated image, which is what we replace here with a plain
  // initial-letter glass tile matching the site's own look instead.
  function avatarMarkup(name, avatar) {
    if (avatar && avatar.hasImage) {
      return `<img class="left-nav-account-avatar" width="24" height="24" src="${escapeHtml(avatar.imageUrl)}" alt="" />`;
    }
    const initial = escapeHtml((name || "?").trim().charAt(0).toUpperCase() || "?");
    return `<div class="left-nav-account-avatar left-nav-account-avatar-default" aria-hidden="true">${initial}</div>`;
  }

  // width/height attributes on the <img> case (not just the CSS rule) so
  // the avatar is correctly sized even against a stale cached stylesheet
  // from before .left-nav-account-avatar existed — HTML sizing attributes
  // apply before any CSS is parsed.
  // Not a link yet — there is no profile page to send it to until Stage 5.
  function buildSignedInHTML(name, avatar) {
    return `
      <div class="left-nav-account">
        ${avatarMarkup(name, avatar)}
        <span class="left-nav-account-name">${escapeHtml(name)}</span>
      </div>
      <button type="button" class="left-nav-auth-btn left-nav-auth-btn-ghost left-nav-signout-btn">Sign Out</button>
    `;
  }

  function wireSignOutButton(clerkInstance) {
    const btn = navAuthContainer.querySelector(".left-nav-signout-btn");
    if (btn) btn.addEventListener("click", () => clerkInstance.signOut());
  }

  function reveal() {
    navAuthContainer.classList.add("left-nav-auth-ready");
  }

  // ── Optimistic paint from the cached hint — synchronous, so this runs
  // before Clerk.load() below has any chance to resolve.
  const hint = readAuthHint();
  if (hint) {
    navAuthContainer.innerHTML = hint.signedIn
      ? buildSignedInHTML(hint.name, { hasImage: hint.hasImage, imageUrl: hint.imageUrl })
      : signedOutHTML;
    // Not wired to Sign Out yet on this optimistic pass — clicking it
    // before Clerk has loaded would call signOut() on nothing. The real
    // render() below (which always runs, even when the hint matches)
    // rewires it as part of producing the confirmed state.
    reveal();
  }

  window.cheeseClerkReady
    .then((clerkInstance) => {
      function render() {
        const user = clerkInstance.user;

        if (!user) {
          navAuthContainer.innerHTML = signedOutHTML;
          writeAuthHint({ signedIn: false });
          reveal();
          return;
        }

        const name = user.username || (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) || "Account";
        navAuthContainer.innerHTML = buildSignedInHTML(name, { hasImage: user.hasImage, imageUrl: user.imageUrl });
        wireSignOutButton(clerkInstance);
        writeAuthHint({ signedIn: true, name, hasImage: user.hasImage, imageUrl: user.imageUrl });
        reveal();
      }

      render();
      clerkInstance.addListener(render);
    })
    .catch((err) => {
      // Whatever is currently shown — the cached-hint guess, or the
      // original signed-out HTML if there was no hint — is already the
      // safe fallback, so there is nothing to undo. Just don't let a
      // Clerk outage look like a silent, unexplained failure, and make
      // sure the block isn't left permanently invisible if it never got
      // this far (no hint existed, so reveal() was never called above).
      console.error("Clerk failed to load:", err);
      reveal();
    });
}
