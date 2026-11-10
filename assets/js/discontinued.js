/* Site retirement notice. Loaded at the start of each normal page's body,
 * before page scripts or third-party services. A tab's sessionStorage keeps
 * the acknowledgement across navigation/reloads, but not future visits.
 * Error pages deliberately do not load this script. */
(function () {
  "use strict";

  const seenKey = "cheeseDiscontinuedSeen:2026-11-10";
  try {
    if (sessionStorage.getItem(seenKey) === "1") return;
  } catch (_) {
    // Storage restrictions must never prevent the notice or access to the site.
  }

  const dialog = document.createElement("dialog");
  dialog.className = "retirement-notice";
  dialog.setAttribute("aria-labelledby", "retirementTitle");
  dialog.setAttribute("aria-describedby", "retirementMessage retirementThanks");
  dialog.innerHTML = `
    <div class="retirement-brand" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)"/>
        <path d="M10 24 L10 21 C10 21 8 19 8 16 C8 12 11 9 13 8 C13 8 12 10 13 11 C14 10 15 8 17 8 C20 8 22 10 22 13 C22 16 20 18 19 19 L19 24 Z" fill="currentColor"/>
        <rect x="9" y="23.5" width="14" height="2" rx="1" fill="currentColor"/>
      </svg>
      <span>Cheese</span>
    </div>
    <p class="retirement-eyebrow">A final update <span aria-hidden="true">&middot;</span> <time datetime="2026-11-10">November 10, 2026</time></p>
    <h1 id="retirementTitle">Cheese has been discontinued</h1>
    <div id="retirementMessage" class="retirement-message">
      <p>Development of Cheese has ended as of November 10, 2026. The site will remain available for chess analysis, opening exploration, browsing master games, and playing against Stockfish, but it will no longer receive updates or support.</p>
      <p>The Puzzle Trainer is no longer supported.</p>
    </div>
    <p id="retirementThanks" class="retirement-thanks">Thank you to everyone who spent time studying and playing with Cheese.</p>
    <form method="dialog">
      <button class="retirement-continue" autofocus>Continue to Cheese <span aria-hidden="true">&rarr;</span></button>
    </form>
  `;

  // Native modal behavior makes the underlying page inert and contains focus.
  // Stop board shortcuts while the notice is open, including on Escape.
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Tab") {
      event.preventDefault();
      dialog.querySelector("button").focus();
    }
  });
  dialog.addEventListener("close", () => {
    try {
      sessionStorage.setItem(seenKey, "1");
    } catch (_) {
      // Without storage the notice can reappear on the next page, but closes normally.
    }
    dialog.remove();
  }, { once: true });

  document.body.appendChild(dialog);
  dialog.showModal();
})();
