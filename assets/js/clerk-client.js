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
   or other users' data. It's a development-instance key (pk_test_…) for
   now; swap in a production key (on every page's script tag, plus here)
   when actually deploying.
*/

window.cheeseClerk = window.Clerk;
window.cheeseClerkReady = window.Clerk.load().then(() => window.Clerk);

// ── Nav auth block ──────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function initNavAuthState(clerkInstance) {
  const container = document.querySelector(".left-nav-auth");
  if (!container) return; // Signup/Login pages have no sidebar

  // The signed-out markup is already correct (real Sign Up/Log In links) —
  // captured once so a later Sign Out can restore it exactly, rather than
  // this file re-generating it (and needing to guess this page's relative
  // path depth to pages/signup//pages/login/).
  const signedOutHTML = container.innerHTML;

  // The container starts at opacity:0 (assets/css/nav.css /
  // style.css — .left-nav-auth) so that on EVERY page load, whatever the
  // real auth state turns out to be, it is never painted as the wrong
  // state first. Clerk.load() takes a real, if usually brief, network
  // round trip; without this a signed-in user would see the signed-out
  // Sign Up/Log In buttons flash on every navigation, since each page is a
  // full reload of static HTML that starts out signed-out by default.
  function reveal() {
    container.classList.add("left-nav-auth-ready");
  }

  function render() {
    const user = clerkInstance.user;

    if (!user) {
      container.innerHTML = signedOutHTML;
      reveal();
      return;
    }

    const name = user.username || (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) || "Account";

    // width/height attributes (not just the CSS rule) so the avatar is
    // correctly sized even on a stale cached stylesheet from before this
    // was added — HTML sizing attributes apply before any CSS is parsed.
    // Not a link yet — there is no profile page to send it to until Stage 5.
    container.innerHTML = `
      <div class="left-nav-account">
        <img class="left-nav-account-avatar" width="24" height="24" src="${escapeHtml(user.imageUrl)}" alt="" />
        <span class="left-nav-account-name">${escapeHtml(name)}</span>
      </div>
      <button type="button" class="left-nav-auth-btn left-nav-auth-btn-ghost left-nav-signout-btn">Sign Out</button>
    `;

    const signOutBtn = container.querySelector(".left-nav-signout-btn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", () => clerkInstance.signOut());
    }

    reveal();
  }

  render();
  clerkInstance.addListener(render);
}

window.cheeseClerkReady
  .then((clerkInstance) => initNavAuthState(clerkInstance))
  .catch((err) => {
    // Nav's baked-in HTML is already the safe signed-out default, so there
    // is nothing to undo here — just don't let a Clerk outage look like a
    // silent, unexplained failure in the console. Still reveal the
    // container: initNavAuthState() never got to run its own reveal(), and
    // .left-nav-auth starts at opacity:0 (see nav.css / style.css), so a
    // Clerk outage would otherwise leave the nav's bottom permanently
    // blank instead of falling back to the buttons already sitting there.
    console.error("Clerk failed to load:", err);
    const container = document.querySelector(".left-nav-auth");
    if (container) container.classList.add("left-nav-auth-ready");
  });
