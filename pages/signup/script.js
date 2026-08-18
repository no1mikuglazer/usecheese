/* Cheese — Sign Up page (Stage 2: real Clerk wiring)
   window.cheeseClerkReady (assets/js/clerk-client.js) resolves once Clerk
   has loaded, with the same clerk instance clerk-client.js uses for the
   nav's signed-in/out state.

   Flow: clerk.client.signUp.create({ emailAddress, password, username }).
   If the Clerk dashboard has "Verify at sign-up" on for email, status comes
   back "missing_requirements" instead of "complete" — the code below then
   requests a code, reveals #suVerify in place of the form, and completes
   the account on a correct code. If verification is off, signUp completes
   in one step and this extra screen is never shown. Either way works
   without needing to know which the dashboard is set to. */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("suForm");
  const submitBtn = document.getElementById("suSubmitBtn");
  const errorEl = document.getElementById("suError");
  const subtitleEl = document.getElementById("suSubtitle");
  const verifyBlock = document.getElementById("suVerify");
  const verifyBtn = document.getElementById("suVerifyBtn");
  const codeInput = document.getElementById("suCode");

  let pendingSignUp = null; // the in-progress SignUp resource while a code is outstanding

  // The three bodies below live in assets/js/auth-form.js, shared with Log
  // In. These wrappers just bind this page's own error element once, so the
  // call sites read the same as they always did.
  const showError = (message) => showAuthError(errorEl, message);
  const clearError = () => clearAuthError(errorEl);

  function setBusy(button, busy, busyLabel, restLabel) {
    button.disabled = busy;
    button.textContent = busy ? busyLabel : restLabel;
  }

  window.cheeseClerkReady
    .then((clerk) => {
      // Already signed in — a signup form has nothing to offer here.
      if (clerk.user) {
        window.location.href = "../../index.html";
        return;
      }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearError();

        const username = document.getElementById("suUsername").value.trim();
        const email = document.getElementById("suEmail").value.trim();
        const password = document.getElementById("suPassword").value;
        const confirmPassword = document.getElementById("suConfirmPassword").value;

        if (!username || !email || !password) {
          showError("Fill in every field.");
          return;
        }
        if (password !== confirmPassword) {
          showError("Passwords don't match.");
          return;
        }

        setBusy(submitBtn, true, "Creating…", "Create Account");

        try {
          const signUp = await clerk.client.signUp.create({
            emailAddress: email,
            password,
            username,
          });

          if (signUp.status === "complete") {
            await clerk.setActive({ session: signUp.createdSessionId });
            window.location.href = "../../index.html";
            return;
          }

          if (signUp.status === "missing_requirements") {
            pendingSignUp = signUp;
            await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
            form.hidden = true;
            subtitleEl.textContent = `We emailed a code to ${email}. Enter it below to finish.`;
            verifyBlock.hidden = false;
            codeInput.focus();
            return;
          }

          showError("Could not create your account. Please try again.");
        } catch (err) {
          showError(messageFromClerkError(err, "Something went wrong. Please try again."));
        } finally {
          setBusy(submitBtn, false, "Creating…", "Create Account");
        }
      });

      verifyBtn.addEventListener("click", async () => {
        if (!pendingSignUp) return;
        clearError();

        const code = codeInput.value.trim();
        if (!code) {
          showError("Enter the code from your email.");
          return;
        }

        setBusy(verifyBtn, true, "Verifying…", "Verify & Create Account");

        try {
          const result = await pendingSignUp.attemptEmailAddressVerification({ code });

          if (result.status === "complete") {
            await clerk.setActive({ session: result.createdSessionId });
            window.location.href = "../../index.html";
            return;
          }

          showError("That code didn't work. Check your email and try again.");
        } catch (err) {
          showError(messageFromClerkError(err, "Verification failed. Please try again."));
        } finally {
          setBusy(verifyBtn, false, "Verifying…", "Verify & Create Account");
        }
      });
    })
    .catch(() => {
      showError("Could not reach the account service. Please refresh and try again.");
    });
});
