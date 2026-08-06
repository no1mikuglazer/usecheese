/* Cheese — shared dialog system, replacing native alert()/confirm()/prompt().
   Currently only linked from pages/analysis/index.html (see that page's
   script.js and assets/js/board-core.js's saveCurrentAnalysis() for the
   call sites) — kept in assets/js/ rather than pages/analysis/ so it can be
   linked from other pages later with no changes to this file.

   Public API, all Promise-based (mirrors the native functions' return
   contracts so callers migrate with minimal changes):
     cheeseDialogs.showAlert(message, { title, okLabel })       -> Promise<true>
     cheeseDialogs.showConfirm(message, { title, confirmLabel,
                                           cancelLabel, danger }) -> Promise<boolean>
     cheeseDialogs.showPrompt(message, { title, defaultValue,
                                          confirmLabel, cancelLabel }) -> Promise<string|null>

   ── Lifecycle ────────────────────────────────────────────────────────────
   The overlay/dialog DOM is built once, lazily, on the first call, then
   reused for every subsequent dialog (content is replaced per call) — same
   pattern as showToast()'s #ap-toast in board-core.js. There is at most one
   dialog open at a time: calling any show*() while another is still open
   resolves the earlier one as cancelled first, rather than stacking a
   second overlay on top.

   ── Keyboard / focus ─────────────────────────────────────────────────────
   The keydown listener is attached to the DIALOG element itself, not
   document — so it only ever sees keys while focus is inside the dialog,
   and calling stopPropagation() there is what keeps Escape/Enter/arrow keys
   from ever reaching Analysis's own document-level shortcut listeners (move
   navigation, the PGN modal's Escape handler) while a blocking dialog is
   open. Escape cancels, Enter in the text input confirms, Tab wraps focus
   within the dialog's own buttons/input, and focus returns to whatever was
   focused before the dialog opened once it closes. */

(function () {
  "use strict";

  let els = null;
  let current = null;

  function build() {
    if (els) return els;

    const overlay = document.createElement("div");
    overlay.className = "cheese-dialog-overlay";

    const dialog = document.createElement("div");
    dialog.className = "cheese-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");

    const titleEl = document.createElement("div");
    titleEl.className = "cheese-dialog-title";
    titleEl.id = "cheeseDialogTitle";

    const messageEl = document.createElement("div");
    messageEl.className = "cheese-dialog-message";
    messageEl.id = "cheeseDialogMessage";

    const inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.className = "cheese-dialog-input";
    inputEl.autocomplete = "off";

    const actionsEl = document.createElement("div");
    actionsEl.className = "cheese-dialog-actions";

    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(inputEl);
    dialog.appendChild(actionsEl);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Click on the backdrop itself (not the dialog box) cancels — same
    // convention as the existing PGN import modal.
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay && current) current.cancel();
    });

    dialog.addEventListener("keydown", (e) => {
      if (!current) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        current.cancel();
        return;
      }

      if (e.key === "Enter") {
        // Buttons already activate on Enter natively; only the text input
        // needs help, since there is no <form> here to submit it.
        if (e.target === inputEl) {
          e.preventDefault();
          current.confirmDefault();
        }
        e.stopPropagation();
        return;
      }

      if (e.key === "Tab") {
        const focusable = [...dialog.querySelectorAll("button, input")].filter(
          (el) => el.offsetParent !== null
        );
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        e.stopPropagation();
        return;
      }

      // Anything else (letters, arrow keys while editing the input, etc.)
      // stays local to the dialog instead of reaching board shortcuts.
      e.stopPropagation();
    });

    els = { overlay, dialog, titleEl, messageEl, inputEl, actionsEl };
    return els;
  }

  function open(config) {
    const { overlay, dialog, titleEl, messageEl, inputEl, actionsEl } = build();

    // A dialog already open (e.g. a double-triggered action) is resolved as
    // cancelled rather than left stacked underneath the new one.
    if (current) current.forceCancel();

    const lastFocused = document.activeElement;

    titleEl.textContent = config.title || "";
    titleEl.style.display = config.title ? "" : "none";
    messageEl.textContent = config.message || "";
    messageEl.style.display = config.message ? "" : "none";
    inputEl.style.display = config.showInput ? "" : "none";
    inputEl.value = config.showInput ? config.defaultValue || "" : "";

    actionsEl.textContent = "";
    let defaultBtn = null;

    return new Promise((resolve) => {
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        overlay.classList.remove("cheese-dialog-open");
        current = null;
        if (lastFocused && typeof lastFocused.focus === "function") {
          lastFocused.focus();
        }
        resolve(value);
      }

      config.buttons.forEach((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cheese-dialog-btn cheese-dialog-btn-" + (b.variant || "ghost");
        btn.textContent = b.label;
        btn.addEventListener("click", () => {
          finish(b.returnsInput ? inputEl.value : b.value);
        });
        actionsEl.appendChild(btn);
        if (b.isDefault) defaultBtn = btn;
      });

      const cancelValue = config.showInput ? null : false;
      current = {
        cancel: () => finish(cancelValue),
        forceCancel: () => finish(cancelValue),
        confirmDefault: () => {
          if (defaultBtn) defaultBtn.click();
        },
      };

      overlay.classList.add("cheese-dialog-open");
      requestAnimationFrame(() => {
        const toFocus = config.showInput ? inputEl : defaultBtn || actionsEl.firstElementChild;
        if (toFocus) toFocus.focus();
        if (config.showInput && inputEl.value) inputEl.select();
      });
    });
  }

  function showAlert(message, opts) {
    opts = opts || {};
    return open({
      title: opts.title || "",
      message: message || "",
      showInput: false,
      buttons: [{ label: opts.okLabel || "OK", value: true, variant: "primary", isDefault: true }],
    });
  }

  function showConfirm(message, opts) {
    opts = opts || {};
    return open({
      title: opts.title || "",
      message: message || "",
      showInput: false,
      buttons: [
        { label: opts.cancelLabel || "Cancel", value: false, variant: "ghost" },
        {
          label: opts.confirmLabel || "Confirm",
          value: true,
          variant: opts.danger ? "danger" : "primary",
          isDefault: true,
        },
      ],
    });
  }

  function showPrompt(message, opts) {
    opts = opts || {};
    return open({
      title: opts.title || "",
      message: message || "",
      showInput: true,
      defaultValue: opts.defaultValue || "",
      buttons: [
        { label: opts.cancelLabel || "Cancel", value: null, variant: "ghost" },
        { label: opts.confirmLabel || "OK", returnsInput: true, variant: "primary", isDefault: true },
      ],
    });
  }

  window.cheeseDialogs = { showAlert, showConfirm, showPrompt };
})();
