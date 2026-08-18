/* Cheese — Log In page (Stage 2: real Clerk wiring)
   window.cheeseClerkReady (assets/js/clerk-client.js) resolves once Clerk
   has loaded, with the same clerk instance clerk-client.js uses for the
   nav's signed-in/out state.

   "Forgot password?" is still inert (href="#") — building the actual reset
   flow (a code emailed via signIn.create({ strategy: "reset_password_email_code" }),
   then a new-password step) is its own small addition, not part of this
   pass, which only wires the two forms + nav state. */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("liForm");
  const submitBtn = document.getElementById("liSubmitBtn");
  const errorEl = document.getElementById("liError");

  // The three bodies below live in assets/js/auth-form.js, shared with Sign
  // Up. These wrappers just bind this page's own error element once, so the
  // call sites read the same as they always did.
  const showError = (message) => showAuthError(errorEl, message);
  const clearError = () => clearAuthError(errorEl);

  window.cheeseClerkReady
    .then((clerk) => {
      // Already signed in — nothing for a login form to do here.
      if (clerk.user) {
        window.location.href = "../../index.html";
        return;
      }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearError();

        const email = document.getElementById("liEmail").value.trim();
        const password = document.getElementById("liPassword").value;

        if (!email || !password) {
          showError("Enter your email and password.");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Logging in…";

        try {
          const signIn = await clerk.client.signIn.create({
            identifier: email,
            password,
          });

          if (signIn.status === "complete") {
            await clerk.setActive({ session: signIn.createdSessionId });
            window.location.href = "../../index.html";
            return;
          }

          showError("Could not log you in. Please try again.");
        } catch (err) {
          showError(messageFromClerkError(err, "Invalid email or password."));
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Log In";
        }
      });
    })
    .catch(() => {
      showError("Could not reach the account service. Please refresh and try again.");
    });
});
