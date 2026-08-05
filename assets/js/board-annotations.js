/* Cheese — shared board annotation system (right-click circles/arrows).
   Used identically by Analysis, Training and Puzzles. One module, one
   implementation — pages attach it to their own `.board` element and get
   Lichess-style drawing for a couple of lines of integration code.

   ── Why this needs no "orientation" / "flipped" parameter ──────────────────
   Every board page rotates the WHOLE `.board` element 180deg via CSS
   (`.board-area.flipped .board { transform: rotate(180deg); }`) rather than
   reordering the 64 `.square` divs — they stay in fixed a8..h1 DOM/grid
   order regardless of orientation (pieces get an explicit counter-rotation
   because piece artwork has a visual "up"; see board-layout.css). This
   module's SVG overlay is inserted as a CHILD of `.board`, drawn entirely in
   that same fixed, unflipped grid space (file 0=a..7=h, row 0=rank8..7=rank1,
   matching the DOM order exactly) — so the board's own CSS rotation flips the
   overlay for free, identically to how it already flips the piece grid.
   Nothing in this file ever branches on orientation.

   For the same reason, hit-testing during a right-click drag uses
   `document.elementFromPoint()` rather than manual boardRect/8 math: it
   resolves the square actually under the cursor on the real, rendered
   (already-rotated) page, so it is correct in both orientations without any
   flip-aware arithmetic here either.

   ── Coordinates ─────────────────────────────────────────────────────────────
   Annotations are stored as chess squares ("e4") and square pairs
   ("e2-e4") — never pixels. The SVG's viewBox is a fixed 8x8 grid (one unit
   per square), so resizing the board is handled entirely by the browser
   scaling that viewBox; this module only recomputes pixel geometry when an
   annotation is actually added, removed, or cleared. */

(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  // Local, unflipped grid-space center of a square, in viewBox units (0..8).
  // Matches the fixed a8-top-left DOM/grid order every board page uses.
  function squareCenter(squareId) {
    const file = FILES.indexOf(squareId[0]);
    const rank = parseInt(squareId[1], 10);
    if (file === -1 || Number.isNaN(rank)) return null;
    return { x: file + 0.5, y: 8 - rank + 0.5 };
  }

  function parseArrowKey(key) {
    const [from, to] = key.split("-");
    return { from, to };
  }

  let instanceCounter = 0;

  /* attachBoardAnnotations(boardEl, options?) -> { clear, destroy }
   *
   * boardEl: the `.board` element (position:relative, the 64 .square grid).
   * options.color: CSS color for both arrows and circles. Defaults to the
   *   shared --board-annotation-color custom property (board-layout.css),
   *   so the default look stays defined in one place. A future per-call
   *   override (e.g. an engine-suggestion arrow in a different color) can
   *   already pass its own `color` here without any change to this file.
   */
  function attachBoardAnnotations(boardEl, options) {
    if (!boardEl) throw new Error("attachBoardAnnotations: boardEl is required");

    const opts = options || {};
    const instanceId = ++instanceCounter;
    const arrowheadId = "board-annotation-arrowhead-" + instanceId;

    // ── State — closure-scoped, not global. Two boards on one page (were
    // that ever needed) would each get their own independent set. ──────────
    const circles = new Set(); // Set<squareId>
    const arrows = new Set(); // Set<"from-to">

    // ── Overlay SVG ──────────────────────────────────────────────────────────
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "board-annotations");
    svg.setAttribute("viewBox", "0 0 8 8");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    // pointer-events:none (also set in CSS, repeated here so this file has no
    // hidden dependency on board-layout.css having loaded first) — the
    // overlay must never intercept clicks/drags meant for pieces or squares.
    svg.style.pointerEvents = "none";

    const defs = document.createElementNS(svg.namespaceURI, "defs");
    const marker = document.createElementNS(svg.namespaceURI, "marker");
    marker.setAttribute("id", arrowheadId);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8.2");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "4.2");
    marker.setAttribute("markerHeight", "4.2");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrowheadPath = document.createElementNS(svg.namespaceURI, "path");
    arrowheadPath.setAttribute("d", "M0,0 L10,5 L0,10 z");
    arrowheadPath.setAttribute("class", "board-annotation-arrowhead-fill");
    marker.appendChild(arrowheadPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const arrowsGroup = document.createElementNS(svg.namespaceURI, "g");
    arrowsGroup.setAttribute("class", "board-annotation-arrows");
    const circlesGroup = document.createElementNS(svg.namespaceURI, "g");
    circlesGroup.setAttribute("class", "board-annotation-circles");
    svg.appendChild(arrowsGroup);
    svg.appendChild(circlesGroup);

    boardEl.appendChild(svg);

    if (opts.color) {
      svg.style.setProperty("--board-annotation-color", opts.color);
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    // Arrow endpoints are inset from the square centers: the tail so it does
    // not appear to originate from inside the piece artwork, the head so the
    // marker's own triangle lands just short of the destination square's
    // center rather than overlapping it. HEAD_INSET is the inset of the raw
    // line endpoint; the marker (viewBox 0 0 10 10, refX 8.2, markerWidth 4.2,
    // rendered at the 0.11 stroke width) then draws its own tip a further
    // ~0.083 units beyond that point, so the visible arrowhead tip actually
    // lands about (HEAD_INSET - 0.083) units short of the destination center.
    const TAIL_INSET = 0.28;
    const HEAD_INSET = 0.22;

    function buildArrowLine(fromId, toId) {
      const from = squareCenter(fromId);
      const to = squareCenter(toId);
      if (!from || !to) return null;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) return null;
      const ux = dx / dist;
      const uy = dy / dist;

      return {
        x1: from.x + ux * TAIL_INSET,
        y1: from.y + uy * TAIL_INSET,
        x2: from.x + dx - ux * HEAD_INSET,
        y2: from.y + dy - uy * HEAD_INSET,
      };
    }

    function renderArrow(fromId, toId, extraClass) {
      const line = buildArrowLine(fromId, toId);
      if (!line) return null;
      const el = document.createElementNS(svg.namespaceURI, "line");
      el.setAttribute("class", "board-annotation-arrow" + (extraClass ? " " + extraClass : ""));
      el.setAttribute("x1", line.x1);
      el.setAttribute("y1", line.y1);
      el.setAttribute("x2", line.x2);
      el.setAttribute("y2", line.y2);
      el.setAttribute("marker-end", "url(#" + arrowheadId + ")");
      arrowsGroup.appendChild(el);
      return el;
    }

    function renderCircle(squareId) {
      const c = squareCenter(squareId);
      if (!c) return null;
      const el = document.createElementNS(svg.namespaceURI, "circle");
      el.setAttribute("class", "board-annotation-circle");
      el.setAttribute("cx", c.x);
      el.setAttribute("cy", c.y);
      el.setAttribute("r", "0.36");
      circlesGroup.appendChild(el);
      return el;
    }

    function redraw() {
      arrowsGroup.textContent = "";
      circlesGroup.textContent = "";
      circles.forEach((sq) => renderCircle(sq));
      arrows.forEach((key) => {
        const { from, to } = parseArrowKey(key);
        renderArrow(from, to);
      });
    }

    // ── Public mutators ──────────────────────────────────────────────────────

    function toggleCircle(squareId) {
      if (circles.has(squareId)) circles.delete(squareId);
      else circles.add(squareId);
      redraw();
    }

    function toggleArrow(fromId, toId) {
      const key = fromId + "-" + toId;
      if (arrows.has(key)) arrows.delete(key);
      else arrows.add(key);
      redraw();
    }

    function clear() {
      if (circles.size === 0 && arrows.size === 0) return; // avoid a no-op redraw
      circles.clear();
      arrows.clear();
      redraw();
    }

    // ── Input: right-click (circle) / right-drag (arrow) ────────────────────
    // A single element-level state machine, reset on every mouseup — no
    // dangling state can survive between gestures.
    const DRAG_THRESHOLD_PX = 8;
    let gesture = null; // { startSquareId, startX, startY, previewEl }
    let previewRAF = null;
    let pendingPreviewPoint = null;

    function squareIdAt(clientX, clientY) {
      const el = document.elementFromPoint(clientX, clientY);
      const square = el && el.closest ? el.closest(".square") : null;
      return square ? square.id : null;
    }

    function boardLocalPoint(clientX, clientY) {
      const rect = boardEl.getBoundingClientRect();
      // The overlay's own viewBox is 0..8 regardless of screen size, so a
      // fractional (not integer-snapped) live-preview point is just the
      // pointer's position within the board scaled into that space. This is
      // screen-space math for a LIVE preview only — never stored — so it
      // does not need the flip-awareness the trail/glide code requires
      // elsewhere; getBoundingClientRect already reflects the board's actual
      // on-screen (post-rotation) box, and drawing a line to "wherever the
      // mouse currently is on screen" is correct in that space either way.
      return {
        x: ((clientX - rect.left) / rect.width) * 8,
        y: ((clientY - rect.top) / rect.height) * 8,
      };
    }

    function updatePreview(clientX, clientY) {
      if (!gesture) return;
      pendingPreviewPoint = { x: clientX, y: clientY };
      if (previewRAF) return;
      previewRAF = requestAnimationFrame(() => {
        previewRAF = null;
        if (!gesture || !pendingPreviewPoint) return;
        const from = squareCenter(gesture.startSquareId);
        const pt = boardLocalPoint(pendingPreviewPoint.x, pendingPreviewPoint.y);
        if (!gesture.previewEl) {
          gesture.previewEl = document.createElementNS(svg.namespaceURI, "line");
          gesture.previewEl.setAttribute("class", "board-annotation-arrow board-annotation-arrow-preview");
          gesture.previewEl.setAttribute("marker-end", "url(#" + arrowheadId + ")");
          arrowsGroup.appendChild(gesture.previewEl);
        }
        gesture.previewEl.setAttribute("x1", from.x);
        gesture.previewEl.setAttribute("y1", from.y);
        gesture.previewEl.setAttribute("x2", pt.x);
        gesture.previewEl.setAttribute("y2", pt.y);
      });
    }

    function endGesture() {
      if (!gesture) return null;
      if (previewRAF) {
        cancelAnimationFrame(previewRAF);
        previewRAF = null;
      }
      pendingPreviewPoint = null;
      if (gesture.previewEl) gesture.previewEl.remove();
      const g = gesture;
      gesture = null;
      return g;
    }

    function onContextMenu(e) {
      // Only ever prevented within the board — the rest of the site keeps
      // its normal browser context menu.
      e.preventDefault();
    }

    function onMouseDown(e) {
      if (e.button === 0) {
        // Lichess-style: any ordinary left click/drag on the board clears
        // drawn shapes. This listener only ever reads its own Sets and
        // redraws the overlay — it never calls preventDefault or
        // stopPropagation, so the page's own click-to-move and
        // piece-drag-start listeners on the same element fire completely
        // unaffected, in whatever order they happen to be registered.
        clear();
        return;
      }

      if (e.button !== 2) return;

      // A left-button piece drag already in progress takes priority; do not
      // start layering an annotation gesture on top of it. `dragState` is
      // the page-level global the existing drag code already defines —
      // reading it here follows the same convention board-core.js itself
      // uses (see its file header), and the check is skipped harmlessly if
      // a page happens not to define it.
      if (typeof dragState !== "undefined" && dragState) return;

      const squareId = squareIdAt(e.clientX, e.clientY);
      if (!squareId) return;

      e.preventDefault();
      gesture = {
        startSquareId: squareId,
        startX: e.clientX,
        startY: e.clientY,
        previewEl: null,
      };
    }

    function onMouseMove(e) {
      if (!gesture) return;
      updatePreview(e.clientX, e.clientY);
    }

    function onMouseUp(e) {
      if (!gesture || e.button !== 2) return;
      const g = endGesture();

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const movedFar = Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;

      const endSquareId = squareIdAt(e.clientX, e.clientY);

      if (!movedFar || !endSquareId || endSquareId === g.startSquareId) {
        toggleCircle(g.startSquareId);
      } else {
        toggleArrow(g.startSquareId, endSquareId);
      }
    }

    // mousemove/mouseup are attached at the document level, matching the
    // existing piece-drag pattern in board-core.js (onDragMove/onDragEnd) —
    // a drag gesture must keep tracking even if the pointer leaves the board
    // mid-gesture, and both handlers are cheap no-ops while idle.
    boardEl.addEventListener("contextmenu", onContextMenu);
    boardEl.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseup", onMouseUp);

    function destroy() {
      boardEl.removeEventListener("contextmenu", onContextMenu);
      boardEl.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      endGesture();
      svg.remove();
      circles.clear();
      arrows.clear();
    }

    return { clear, destroy };
  }

  window.attachBoardAnnotations = attachBoardAnnotations;
})();
