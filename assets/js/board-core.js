/* Cheese — shared board-page JS core
   Functions used identically by Analysis and Training (and any future
   board page): piece/board rendering helpers, drag-and-drop, move-tree
   rendering, sounds, promotion picker, saved-analysis storage, and PGN
   generation. Load this file AFTER the chess.js CDN script and BEFORE
   the page's own script.js — page scripts make top-level calls (e.g.
   refreshUI()) into these functions, so this file must already be
   parsed and its functions defined by the time the page script runs.

   Deliberately NOT here (stay page-local, possibly duplicated):
   playMove (training monkey-patches it after definition), GameNode,
   updateEvalBar, analyzePosition, renderBoard, refreshUI, the engine
   Worker/stub init, getDragTargetSquare/startDrag/showPromotionPicker
   (real board-flip differences in Training), and the square-click
   listener (turn-enforcement differs in Training). */

// piece image

function getPieceImage(color, type) {
  const names = {
    p: "pawn",
    r: "rook",
    n: "knight",
    b: "bishop",
    q: "queen",
    k: "king",
  };

  return `../../assets/pieces/${color}_${names[type]}_png_shadow_512px.png`;
}

// snapshot / clear board

function snapshotBoard() {
  const snap = {};
  squares.forEach((sq) => {
    const img = sq.querySelector(".piece");
    if (img) snap[sq.id] = { src: img.src, rect: sq.getBoundingClientRect() };
  });
  return snap;
}

function clearBoard() {
  squares.forEach((square) => {
    square.innerHTML = "";
  });
}

// ── Last-move highlight & king-in-check flash (shared helpers) ───────────────

const HIGHLIGHT_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// Remove every move/flash class from the board
function clearBoardHighlights() {
  squares.forEach((sq) => sq.classList.remove("last-move", "check-flash"));
}

// Tint both squares of the current node's move; nothing if there is no move
function applyLastMoveHighlight() {
  clearBoardHighlights();

  const mv = currentNode.move;
  if (!mv) return; // starting position / no moves → no highlight

  const fromSq = document.getElementById(mv.from);
  const toSq = document.getElementById(mv.to);

  if (fromSq) fromSq.classList.add("last-move");
  if (toSq) toSq.classList.add("last-move");
}

// Locate a king square for a given chess.js instance + colour ("w" | "b")
function findKingSquare(chessInstance, color) {
  const board = chessInstance.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === "k" && piece.color === color) {
        return HIGHLIGHT_FILES[c] + (8 - r);
      }
    }
  }

  return null;
}

// Flash a square red (twice) using the shared checkFlash animation, then clean up
function flashCheck(squareId) {
  if (!squareId) return;

  const el = document.getElementById(squareId);
  if (!el) return;

  el.classList.remove("check-flash");
  void el.offsetWidth; // force reflow so the animation can re-trigger
  el.classList.add("check-flash");

  el.addEventListener(
    "animationend",
    () => el.classList.remove("check-flash"),
    { once: true },
  );
}

// Flash the side-to-move's king ONLY if that side is currently in check.
// Used for rejected moves: an illegal move while in check never resolves it.
// No-op when not in check, so normal illegal moves never flash.
function flashKingIfInCheck(fen) {
  const probe = new Chess(fen);
  if (!probe.in_check()) return;
  flashCheck(findKingSquare(probe, probe.turn()));
}

// ── Move sounds ─────────────────────────────────────────────────────────────

function playSound(name) {
  const audio = moveSounds[name];
  if (!audio) return;
  try {
    audio.currentTime = 0; // restart so rapid moves always re-trigger
    const played = audio.play();
    if (played) played.catch(() => {}); // ignore autoplay-policy rejections
  } catch (e) {
    /* no-op */
  }
}

// Classify a chess.js move object into a sound name.
// Precedence: promotion > castle > capture > check > normal.
// Per spec, "check overrides normal", so check ranks directly above normal
// and below the other dedicated sounds.
function moveSoundName(move, gaveCheck) {
  if (move.promotion) return "promote";
  if (move.flags.includes("k") || move.flags.includes("q")) return "castle";
  if (move.captured) return "capture";
  if (gaveCheck) return "check";
  return "move";
}

// valid moves

function showValidMoves(squareId) {
  clearValidMoves();

  chess.load(currentNode.fen);

  const moves = chess.moves({
    square: squareId,
    verbose: true,
  });

  moves.forEach((move) => {
    const targetSquare = document.getElementById(move.to);

    targetSquare.classList.add("valid-move");
  });
}

// clear valid moves

function clearValidMoves() {
  squares.forEach((square) => {
    square.classList.remove("valid-move");
  });
}

// promotion detection

function isPromotionMove(from, to) {
  chess.load(currentNode.fen);
  const piece = chess.get(from);
  if (!piece || piece.type !== "p") return false;
  const toRank = to[1];
  return (
    (piece.color === "w" && toRank === "8") ||
    (piece.color === "b" && toRank === "1")
  );
}

function outsidePromotionClick(e) {
  const popup = document.getElementById("promotion-popup");
  if (popup && !popup.contains(e.target)) {
    closePromotionPicker();
    pendingPromotion = null;
  }
}

function closePromotionPicker() {
  const popup = document.getElementById("promotion-popup");
  if (popup) popup.remove();
  document.removeEventListener("click", outsidePromotionClick);
}

// ── Motion trail ─────────────────────────────────────────────────────────────
// A soft streak along the straight line between the source and destination
// square centres, drawn behind a moving piece. Anchored at the source,
// rotated once to the direction of travel, and grown with scaleX on the same
// curve and duration as the gliding piece — so its leading edge tracks the
// piece rather than being drawn after the fact, and the orientation follows
// automatically for every direction, including the straight-line path of a
// knight's move.
//
// Only transform and opacity animate, both compositor-driven, and every
// coordinate comes from measurements the caller has already taken — no
// per-frame JavaScript and no repeated layout reads.
//
// Callers pass rects, not squares, so this works the same whether the move is
// being glided, dragged, or replayed. `flipped` must be true when the board
// itself is rotated 180deg (Training and Puzzles do this when the player is
// Black; Analysis never flips).
function drawMotionTrail(boardEl, boardRect, fromRect, toRect, flipped) {
  const sl = fromRect.left - boardRect.left;
  const st = fromRect.top - boardRect.top;
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;

  const distance = Math.hypot(dx, dy);
  if (distance <= 1) return;

  const thickness = Math.max(6, fromRect.height * 0.3);

  // The rects above are in screen coordinates, but left/top on a child of the
  // board are interpreted in the board's own coordinate space. Those coincide
  // only while the board is unrotated. When it is flipped the space is itself
  // rotated 180deg, so a screen-space anchor would land point-reflected
  // across the board. Convert the anchor into local space and pre-rotate by
  // the same 180deg, which the board's own rotation then cancels.
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let anchorX = sl + fromRect.width / 2;
  let anchorY = st + fromRect.height / 2;

  if (flipped) {
    anchorX = boardRect.width - anchorX;
    anchorY = boardRect.height - anchorY;
    angle += 180;
  }

  const trail = document.createElement("div");
  trail.className = "anim-trail";
  trail.style.cssText = `position:absolute;pointer-events:none;z-index:15;
    left:${anchorX}px;
    top:${anchorY - thickness / 2}px;
    width:${distance}px;height:${thickness}px;
    transform-origin:0 50%;
    transform:rotate(${angle}deg) scaleX(0);
    will-change:transform,opacity;`;
  boardEl.appendChild(trail);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      trail.style.transition =
        "transform 200ms cubic-bezier(0.25,0.1,0.25,1), opacity 300ms ease 160ms";
      trail.style.transform = `rotate(${angle}deg) scaleX(1)`;
      trail.style.opacity = "0";
    });
  });

  // Removed on a timer rather than transitionend: two properties animate
  // here, so whichever finished first would otherwise tear the element down
  // mid-fade.
  setTimeout(() => trail.remove(), 700);
}

// ── DRAG AND DROP (shared pieces) ────────────────────────────────────────────

function isLegalMove(from, to) {
  chess.load(currentNode.fen);
  const moves = chess.moves({ square: from, verbose: true });
  return moves.some((m) => m.to === to);
}

// Drag ghost is positioned with `transform: translate3d(...)` instead of
// left/top: transform is compositor-only (GPU), while left/top are
// layout-triggering and force a synchronous reflow on every pointer-move
// event — that reflow-per-move is what produced the jitter/stutter feel.
const DRAG_GHOST_SCALE = 1.08;

function setGhostTransform(ghost, x, y, scale) {
  ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
}

function animateSnapBack(ghost, fromRect) {
  // Piece was dropped illegally — animate ghost back to source then remove
  void ghost.getBoundingClientRect(); // flush current transform so the transition below animates from it, not jumps
  ghost.style.transition = "transform 180ms cubic-bezier(0.25,0.1,0.25,1)";
  setGhostTransform(
    ghost,
    fromRect.left + fromRect.width / 2,
    fromRect.top + fromRect.height / 2,
    DRAG_GHOST_SCALE,
  );
  ghost.addEventListener("transitionend", () => ghost.remove(), { once: true });
}

// Pointer/touch events can fire faster than the display refreshes; only the
// most recent point matters, so coalesce them into one ghost update per
// animation frame instead of writing styles on every single event.
let dragMoveRAF = null;
let pendingDragPoint = null;

function onDragMove(e) {
  if (!dragState) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  pendingDragPoint = { x: clientX, y: clientY };

  if (dragMoveRAF) return; // an update is already queued for this frame

  dragMoveRAF = requestAnimationFrame(() => {
    dragMoveRAF = null;
    if (!dragState || !pendingDragPoint) return;
    setGhostTransform(dragState.ghost, pendingDragPoint.x, pendingDragPoint.y, DRAG_GHOST_SCALE);
  });
}

function onDragEnd(e) {
  if (!dragState) return;

  if (dragMoveRAF) {
    cancelAnimationFrame(dragMoveRAF);
    dragMoveRAF = null;
  }
  pendingDragPoint = null;

  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

  const { ghost, fromSquare, pieceEl, fromRect } = dragState;
  dragState = null;

  fromSquare.style.outline = "none";
  clearValidMoves();
  selectedSquare = null;

  const toId = getDragTargetSquare(clientX, clientY);

  // Illegal drop: no square, same square, or illegal move
  if (!toId || toId === fromSquare.id || !isLegalMove(fromSquare.id, toId)) {
    // Restore piece opacity
    pieceEl.style.opacity = "1";
    // Animate ghost back to source
    animateSnapBack(ghost, fromRect);
    // Real illegal move attempt while in check → flash the king.
    // Skip for off-board / same-square drops (not a move attempt).
    if (toId && toId !== fromSquare.id) {
      flashKingIfInCheck(currentNode.fen);
    }
    return;
  }

  // Legal drop: remove ghost immediately (piece is already visually there),
  // then execute the move with suppressGlide=true so renderBoard doesn't
  // re-animate what the drag already showed.
  ghost.remove();
  pieceEl.style.opacity = "1";

  const from = fromSquare.id;
  const to = toId;

  if (isPromotionMove(from, to)) {
    showPromotionPicker(from, to);
  } else {
    playMove({ from, to }, true); // true = suppressGlide
  }
}

// render move tree

function renderMoveTree() {
  moveTreeContainer.innerHTML = "";

  // update position label
  const posLabel = document.getElementById("apPositionLabel");
  if (posLabel) {
    if (!currentNode.move) {
      posLabel.textContent = customPositionName || "Starting Position";
    } else {
      const moveNum = Math.ceil(currentNode.ply / 2);
      posLabel.textContent =
        customPositionName ||
        moveNum +
          (currentNode.move.color === "w" ? "." : "...") +
          " " +
          currentNode.move.san;
    }
  }

  if (root.children.length) {
    renderNodeRecursive(root, 1);
  }

  addMoveTreeClickEvents();
}

function renderNodeRecursive(node, moveNumber) {
  if (!node || !node.children || !node.children.length) {
    return;
  }

  const mainChild = node.children[0];

  if (!mainChild || !mainChild.move) {
    return;
  }

  // row

  const row = document.createElement("div");

  row.className = "move-row";

  let html = "";

  // numbering

  if (mainChild.move.color === "w") {
    html += `<span class="move-number">${moveNumber}.</span>`;
  } else {
    html += `<span class="move-number">${moveNumber}...</span>`;
  }

  // main move

  html += `<span class="move clickable-move ${mainChild === currentNode ? "current-selected-move" : ""}" data-node="${mainChild.id}">${mainChild.move.san}</span>`;

  // black reply — first child of mainChild that is black's move

  let blackReply = null;

  if (
    mainChild.children.length &&
    mainChild.children[0].move &&
    mainChild.children[0].move.color === "b"
  ) {
    blackReply = mainChild.children[0];
  }

  // render black reply inline

  if (blackReply) {
    html += `<span class="move clickable-move ${blackReply === currentNode ? "current-selected-move" : ""}" data-node="${blackReply.id}">${blackReply.move.san}</span>`;
  }

  row.innerHTML = html;

  moveTreeContainer.appendChild(row);

  // render white variations (siblings of mainChild)

  for (let i = 1; i < node.children.length; i++) {
    renderVariationLine(node.children[i]);
  }

  // render black variations (siblings of blackReply)

  if (blackReply) {
    for (let i = 1; i < mainChild.children.length; i++) {
      renderVariationLine(mainChild.children[i]);
    }
  }

  // continue recursion — next pair starts from blackReply (if exists) or mainChild

  if (blackReply) {
    renderNodeRecursive(blackReply, moveNumber + 1);
  } else {
    renderNodeRecursive(mainChild, moveNumber);
  }
}

function renderVariationLine(node) {
  // safety

  if (!node || !node.move) {
    return;
  }

  const line = document.createElement("div");

  line.className = "variation-line";

  let current = node;

  let html = "";

  // ply 1 = white's first move (move number 1)
  // ply 2 = black's first move (move number 1)
  // ply 3 = white's second move (move number 2) etc.
  let moveNumber = Math.ceil(node.ply / 2);

  let safety = 0;

  while (current && current.move && safety < 120) {
    // always show move number for white, or for the very first move if black

    if (current.move.color === "w") {
      html += `<span class="move-number">${moveNumber}.</span>`;
    } else if (current === node) {
      html += `<span class="move-number">${moveNumber}...</span>`;
    }

    // move span

    html += `<span class="variation-move clickable-move ${current === currentNode ? "current-selected-move" : ""}" data-node="${current.id}">${current.move.san}</span>`;

    // increment after black

    if (current.move.color === "b") {
      moveNumber++;
    }

    // continue line (only main continuation, sub-variations dropped for brevity in variation display)

    current =
      current.children && current.children.length ? current.children[0] : null;

    safety++;
  }

  // apply

  line.innerHTML = html;

  moveTreeContainer.appendChild(line);
}

// find node

function findNodeById(node, id) {
  if (node.id === id) return node;

  for (const child of node.children) {
    const result = findNodeById(child, id);

    if (result) return result;
  }

  return null;
}

// move tree clicks

function addMoveTreeClickEvents() {
  const moves = document.querySelectorAll(".clickable-move");

  moves.forEach((move) => {
    move.addEventListener("click", () => {
      const nodeId = move.dataset.node;

      const node = findNodeById(root, nodeId);

      if (!node) return;

      currentNode = node;

      refreshUI();
    });
  });
}

// engine continuation

function createEngineContinuation(uptoIndex) {
  let node = currentNode;

  for (let i = 0; i <= uptoIndex; i++) {
    const uci = latestEngineUCILine[i];

    if (!uci) break;

    chess.load(node.fen);

    const move = chess.move({
      from: uci.slice(0, 2),

      to: uci.slice(2, 4),

      promotion: "q",
    });

    if (!move) break;

    let existingChild = node.findChildBySAN(move.san);

    if (existingChild) {
      node = existingChild;
    } else {
      const newNode = new GameNode({
        move: move,

        fen: chess.fen(),

        parent: node,
      });

      node.addChild(newNode);

      node = newNode;
    }
  }

  currentNode = node;

  refreshUI();
}

// engine clicks

function addEngineLineClickEvents() {
  const engineMoves = document.querySelectorAll(".engine-line-move");

  engineMoves.forEach((move) => {
    move.addEventListener("click", () => {
      const index = parseInt(move.dataset.index);

      createEngineContinuation(index);
    });
  });
}

// generate pgn

function generatePGNFromNode(node) {
  const path = node.getPath().slice(1);

  const tempChess = new Chess();

  let pgn = "";

  path.forEach((node, index) => {
    const move = tempChess.move(node.move.san);

    if (move.color === "w") {
      pgn += `${Math.floor(index / 2) + 1}. `;
    }

    pgn += move.san + " ";
  });

  return pgn.trim();
}

// toast notification

function showToast(msg) {
  let toast = document.getElementById("ap-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ap-toast";
    toast.className = "ap-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  positionToastNearPlayerBar(toast);
  toast.classList.add("ap-toast-visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("ap-toast-visible");
  }, 2200);
}

// If the page has a #apToastAnchor player bar (a `.player` with the usual
// `.player-left` name section and `.player-clock`), center the toast in the
// gap between them instead of the default viewport-centered position — see
// the id's placement in pages/analysis/index.html for why only that page
// has it. Recomputed from the live rendered layout on every call, so it
// tracks whatever the current board size/viewport actually is; pages
// without the anchor (unaffected) just fall through to the CSS default.
function positionToastNearPlayerBar(toast) {
  const anchor = document.getElementById("apToastAnchor");
  const left = anchor && anchor.querySelector(".player-left");
  const clock = anchor && anchor.querySelector(".player-clock");
  if (!left || !clock) {
    toast.style.top = "";
    toast.style.left = "";
    return;
  }
  const leftRect = left.getBoundingClientRect();
  const clockRect = clock.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  toast.style.left = (leftRect.right + clockRect.left) / 2 + "px";
  toast.style.top = anchorRect.top + anchorRect.height / 2 + "px";
}

// ── Opening Explorer → Analysis integration (shared parsing) ────────────────

function parseOpeningMoves(movesStr) {
  // Strip move numbers ("1.", "12.", "1...") and result markers, leaving SAN.
  return movesStr
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

function loadOpeningFromStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem("selectedOpening");
  } catch (e) {
    return; // storage unavailable → behave as a normal Analysis load
  }

  if (!raw) return; // no opening selected → normal behavior, change nothing

  let opening = null;
  try {
    opening = JSON.parse(raw);
  } catch (e) {
    try { localStorage.removeItem("selectedOpening"); } catch (_) {}
    return;
  }

  if (!opening || !opening.moves) {
    try { localStorage.removeItem("selectedOpening"); } catch (_) {}
    return;
  }

  // Start from the initial position, then replay every move.
  currentNode = root;

  const sanMoves = parseOpeningMoves(opening.moves);
  for (const san of sanMoves) {
    // suppressGlide = true (no per-move flight), suppressSound = true (no burst)
    const ok = playMove(san, true, true);
    if (!ok) break; // stop on any move that doesn't apply; keep what loaded
  }

  // Set the position label: "Opening Name (ECO)" via the existing mechanism.
  if (opening.name) {
    const ecoPart = opening.eco ? ` (${opening.eco})` : "";
    customPositionName = `${opening.name}${ecoPart}`;
  }

  // Final refresh so label + tree + eval reflect the loaded position,
  // and Stockfish analyses it (analyzePosition runs inside refreshUI).
  refreshUI();

  // Clear so the opening doesn't auto-load again next time Analysis opens.
  try {
    localStorage.removeItem("selectedOpening");
  } catch (e) {
    /* no-op */
  }
}

// ── Save System (localStorage) — shared read/write/format helpers ──────────

function readSavedAnalyses() {
  try {
    const raw = localStorage.getItem(SAVED_ANALYSES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function writeSavedAnalyses(list) {
  try {
    localStorage.setItem(SAVED_ANALYSES_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    showToast("Could not save — storage unavailable");
    return false;
  }
}

// Deepest node along the main line (root -> children[0] -> ...)
function mainlineTip() {
  let node = root;
  while (node.children.length) node = node.children[0];
  return node;
}

// Restore the player-name headers to their defaults. PGN import overwrites them
// via applyPGNMetadata, so every reset must put them back or the previous game's
// players linger over a fresh board. Missing ids are skipped (Training has only
// the two board panels).
function resetPlayerNames() {
  const defaults = {
    apWhiteName: "White",
    apBlackName: "Black",
    whitePlayerName: "White",
    blackPlayerName: "Black",
  };
  for (const [id, text] of Object.entries(defaults)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// Reset board + tree to an empty game (mirrors the New/Delete reset)
function resetAnalysisState() {
  customPositionName = null;
  resetPlayerNames();
  chess.reset();
  root.children = [];
  root.engineLine = [];
  root.engineEval = null;
  root.fen = chess.fen();
  currentNode = root;
  latestEngineUCILine = [];

  // A brand-new game/position should not carry over hand-drawn circles and
  // arrows from whatever was previously on the board. `boardAnnotations` is
  // the page-level global a page gets back from attachBoardAnnotations() —
  // guarded so this is a no-op on a page that has not set one up.
  if (typeof boardAnnotations !== "undefined" && boardAnnotations) {
    boardAnnotations.clear();
  }
}

function formatSavedDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

// Save the current analysis: prompt for a name, append, never overwrite.
function saveCurrentAnalysis() {
  const tip = mainlineTip();
  if (tip === root) {
    showToast("Make a move before saving");
    return;
  }

  const pgn = generatePGNFromNode(tip);
  const suggested = customPositionName || "Analysis";
  const input = prompt("Name this analysis:", suggested);
  if (input === null) return; // cancelled
  const name = input.trim() || suggested;

  const list = readSavedAnalyses();
  list.push({
    id: crypto.randomUUID(),
    name: name,
    pgn: pgn,
    created: new Date().toISOString(),
  });

  if (writeSavedAnalyses(list)) showToast('Saved "' + name + '"');
}
