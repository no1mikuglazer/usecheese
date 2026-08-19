/* Cheese — shared board-page JS core
   Functions used identically by Analysis and Training (and any future
   board page): piece/board rendering helpers, drag-and-drop, move-tree
   rendering, sounds, promotion picker, saved-analysis storage, and PGN
   generation. Load this file AFTER the chess.js CDN script and BEFORE
   the page's own script.js — page scripts make top-level calls (e.g.
   refreshUI()) into these functions, so this file must already be
   parsed and its functions defined by the time the page script runs.

   Board orientation lives here too: `boardFlipped` is declared in this file
   and only ASSIGNED by Training and Puzzles. Every flip-aware branch below
   reads it, so Analysis — which never flips — gets the correct behaviour by
   leaving it false. Same for `dragState` and `pendingPromotion`. A page must
   not redeclare any of the three: `let` at the top level of a classic script
   binds in the shared global lexical scope, so a second declaration is a
   SyntaxError rather than a shadow.

   Deliberately NOT here (stay page-local):
   playMove (Training monkey-patches it after definition),
   updateEvalBar, analyzePosition, refreshUI, the engine Worker/stub init,
   `selectedSquare` and the square-click listener that owns it (turn
   enforcement differs per page). `root`/`currentNode` also stay page-local
   (each page builds its own root from its own `chess` instance) even though
   the GameNode class they're built from lives here.

   Two escape hatches for per-page differences, both optional:
   - `canStartDrag(square)` — a page defines it to refuse a drag (Training
     and Puzzles do; Analysis allows every legal drag). See dragAllowed().
   - renderBoard — Puzzles declares its own, which replaces this one for all
     callers because page scripts load later. That fork is intentional and
     documented at both ends. */

// game tree node
// Identical in Analysis and Training — Puzzles doesn't build a move tree, so
// this stays a two-page share rather than joining every other function here.

class GameNode {
  constructor({ move = null, fen = "", parent = null }) {
    this.id = crypto.randomUUID();

    this.move = move;

    this.fen = fen;

    this.parent = parent;

    this.children = [];

    this.engineEval = null;

    this.engineLine = [];

    this.comments = "";

    this.ply = parent ? parent.ply + 1 : 0;
  }

  addChild(node) {
    this.children.push(node);

    return node;
  }

  findChildBySAN(san) {
    return this.children.find((child) => child.move && child.move.san === san);
  }

  getPath() {
    const path = [];

    let current = this;

    while (current) {
      path.unshift(current);

      current = current.parent;
    }

    return path;
  }
}

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
// One reusable, preloaded Audio object per sound to avoid playback delay.
// Sounds are played ONLY for newly played moves (from playMove) — never
// during history navigation, PGN rebuilding, or engine analysis. Paths are
// relative to the loading PAGE (new Audio(src) resolves against the
// document, unlike CSS url()), which is safe here because every board page
// lives at the same pages/<name>/ depth.

const MOVE_SOUND_FILES = {
  move: "../../assets/sounds/move-self.mp3",
  capture: "../../assets/sounds/capture.mp3",
  castle: "../../assets/sounds/castle.mp3",
  check: "../../assets/sounds/move-check.mp3",
  promote: "../../assets/sounds/promote.mp3",
};

const moveSounds = {};
for (const [name, src] of Object.entries(MOVE_SOUND_FILES)) {
  const audio = new Audio(src);
  audio.preload = "auto";
  moveSounds[name] = audio;
}

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
// `.player-left` name section), center the toast in the bar's free space
// instead of the default viewport-centered position — see the id's placement
// in pages/analysis/index.html for why only that page has it. Recomputed from
// the live rendered layout on every call, so it tracks whatever the current
// board size/viewport actually is; pages without the anchor (unaffected) just
// fall through to the CSS default.
//
// The free space used to be measured against a `.player-clock` on the right.
// Those clocks were fake — a hardcoded 10:00 that never ticked — and were
// removed, so the span is now taken to the bar's own inner right edge, which
// is where the empty space actually ends. Padding is subtracted so the result
// is the centre of the visible gap rather than of the border box.
function positionToastNearPlayerBar(toast) {
  const anchor = document.getElementById("apToastAnchor");
  const left = anchor && anchor.querySelector(".player-left");
  if (!left) {
    toast.style.top = "";
    toast.style.left = "";
    return;
  }
  const leftRect = left.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const paddingRight = parseFloat(getComputedStyle(anchor).paddingRight) || 0;
  const innerRight = anchorRect.right - paddingRight;
  toast.style.left = (leftRect.right + innerRight) / 2 + "px";
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

const SAVED_ANALYSES_KEY = "cheeseSavedAnalyses";

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

// `failureMessage` lets a caller name the operation that actually failed —
// this same writer backs deleting as well as saving, and "Could not save"
// after pressing Delete describes the wrong action. Defaults to the save
// wording, so existing callers (and Training) are unchanged.
function writeSavedAnalyses(list, failureMessage) {
  try {
    localStorage.setItem(SAVED_ANALYSES_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    showToast(failureMessage || "Could not save — storage unavailable");
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
//
// Pages that load assets/js/cheese-dialogs.js (currently only Analysis; see
// that file's header) get the Cheese-styled input dialog via
// window.cheeseDialogs. Training doesn't load it, so window.cheeseDialogs
// is undefined there and this falls back to the native prompt() exactly as
// before — this function's behavior on Training is completely unchanged.
async function saveCurrentAnalysis() {
  const tip = mainlineTip();
  if (tip === root) {
    showToast("Make a move before saving");
    return;
  }

  const pgn = generatePGNFromNode(tip);
  const suggested = customPositionName || "Analysis";
  const input = window.cheeseDialogs
    ? await window.cheeseDialogs.showPrompt("Name this analysis:", {
        title: "Save analysis",
        defaultValue: suggested,
        confirmLabel: "Save",
      })
    : prompt("Name this analysis:", suggested);
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

// ── Move-tree navigation controls (Analysis + Training only — Puzzles has no
//    move tree to navigate, so this stays a two-page share) ─────────────────
// Looks up its own buttons the same way attachBoardDragListeners() looks up
// its own squares, rather than requiring each page to pass elements in.

function attachMoveNavControls() {
  const undoMoveBtn = document.getElementById("undoMoveBtn");
  const redoMoveBtn = document.getElementById("redoMoveBtn");
  const prevMoveBtn = document.getElementById("prevMoveBtn");
  const nextMoveBtn = document.getElementById("nextMoveBtn");

  undoMoveBtn.addEventListener("click", () => {
    if (currentNode.parent) {
      currentNode = currentNode.parent;

      refreshUI();
    }
  });

  redoMoveBtn.addEventListener("click", () => {
    if (currentNode.children.length) {
      currentNode = currentNode.children[0];

      refreshUI();
    }
  });

  prevMoveBtn.addEventListener("click", () => {
    currentNode = root;

    refreshUI();
  });

  nextMoveBtn.addEventListener("click", () => {
    let node = currentNode;

    while (node.children.length) {
      node = node.children[0];
    }

    currentNode = node;

    refreshUI();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      if (currentNode.parent) {
        currentNode = currentNode.parent;

        refreshUI();
      }
    }

    if (event.key === "ArrowRight") {
      if (currentNode.children.length) {
        currentNode = currentNode.children[0];

        refreshUI();
      }
    }
  });
}

// ── Rename-analysis handler (Analysis + Training) ───────────────────────────
// Training's page has no #editNameBtn element, so this is a no-op there —
// same as before this was shared, just no longer duplicated to be a no-op.

function attachRenameHandler() {
  const editNameBtn = document.getElementById("editNameBtn");
  if (!editNameBtn) return;

  editNameBtn.addEventListener("click", async () => {
    const posLabel = document.getElementById("apPositionLabel");
    const current = posLabel ? posLabel.textContent : "Starting Position";
    const newName = await cheeseDialogs.showPrompt("", {
      title: "Rename analysis",
      defaultValue: current,
      confirmLabel: "Rename",
    });
    if (newName === null) return; // cancelled
    const trimmed = newName.trim() || "Starting Position";
    customPositionName = trimmed;
    if (posLabel) posLabel.textContent = trimmed;
  });
}

// ── Board orientation ───────────────────────────────────────────────────────
// Declared HERE, not per-page, and deliberately so: `let` at the top level of
// a classic script binds in the shared global lexical scope, so a second
// `let boardFlipped` in a page script would be a hard SyntaxError, not a
// shadow. Training and Puzzles ASSIGN to this when the player is Black;
// Analysis never flips and simply leaves it false, which turns every
// flip-aware branch below into a no-op there.
let boardFlipped = false;

// ── Drag / promotion state ──────────────────────────────────────────────────
// Both are read and written only by the shared code below, so they live here
// rather than being redeclared by every page — the same `let`-in-global-scope
// rule as boardFlipped applies, so a page must NOT declare these itself.
// (`selectedSquare` stays page-local by contrast: the click-to-move handlers
// that own it are still page-specific.)
let dragState = null;
let pendingPromotion = null;

// ── Drag gating hook ────────────────────────────────────────────────────────
// The three board pages agree on how a drag *starts* but not on when one is
// allowed: Analysis permits any legal move, Training requires an active game
// on the human's turn at the tip of the line, Puzzles requires the solver's
// turn on the live position. That difference — and only that difference — is
// what used to justify three copies of startDrag.
//
// A page may define a top-level `canStartDrag(square)` returning false to
// refuse the drag; it owns any toast explaining why. Pages that define
// nothing (Analysis) allow every drag. Same optional-global pattern as
// `boardAnnotations` in resetAnalysisState().
function dragAllowed(square) {
  if (typeof canStartDrag === "undefined") return true;
  return canStartDrag(square);
}

// ── Square hit-testing ──────────────────────────────────────────────────────
// Resolves a viewport point to a square id. The board keeps its 64 squares in
// fixed a8..h1 DOM order and rotates the whole element when flipped (see
// board-annotations.js's header), so a flipped board needs the row/col pair
// point-reflected rather than the DOM re-read.
function getDragTargetSquare(clientX, clientY) {
  const boardEl = document.querySelector(".board");
  const boardRect = boardEl.getBoundingClientRect();
  const squareSize = boardRect.width / 8;
  const col = Math.floor((clientX - boardRect.left) / squareSize);
  const row = Math.floor((clientY - boardRect.top) / squareSize);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  if (boardFlipped) return files[7 - col] + (row + 1);
  return files[col] + (8 - row);
}

// ── Promotion picker ────────────────────────────────────────────────────────
// Positioned in VIEWPORT coordinates and attached to <body>, not to the board.
// Attaching it to the board would inherit the board's 180deg rotation when
// flipped and render the picker upside-down. Body-anchored + `position:fixed`
// is orientation-independent, so this one implementation is correct for all
// three pages (Analysis simply never flips).
function showPromotionPicker(from, to) {
  pendingPromotion = { from, to };
  chess.load(currentNode.fen);
  const piece = chess.get(from);
  const isWhite = piece.color === "w";
  const pieces = ["q", "r", "b", "n"];
  const orderedPieces = isWhite ? pieces : [...pieces].reverse();
  const toSquareEl = document.getElementById(to);
  const squareRect = toSquareEl.getBoundingClientRect();
  const squareSize = squareRect.width;

  const popup = document.createElement("div");
  popup.id = "promotion-popup";
  popup.className = "promotion-popup";

  orderedPieces.forEach((p) => {
    const btn = document.createElement("div");
    btn.className = "promotion-piece";
    const img = document.createElement("img");
    img.src = getPieceImage(isWhite ? "w" : "b", p);
    img.className = "piece";
    img.style.width = "80%";
    img.style.height = "80%";
    btn.appendChild(img);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Captured before closePromotionPicker so the move still has its
      // squares if anything clears pendingPromotion on the way out.
      const promo = pendingPromotion;
      closePromotionPicker();
      pendingPromotion = null;
      if (promo) playMove({ from: promo.from, to: promo.to, promotion: p });
    });
    popup.appendChild(btn);
  });

  popup.style.position = "fixed";
  let pxTop = squareRect.top;
  if (pxTop + squareSize * 4 > window.innerHeight) {
    pxTop = squareRect.bottom - squareSize * 4;
  }
  popup.style.left =
    Math.max(8, Math.min(squareRect.left, window.innerWidth - squareSize - 8)) + "px";
  popup.style.top = Math.max(8, pxTop) + "px";
  popup.style.width = squareSize + "px";
  document.body.appendChild(popup);

  // Deferred a tick so the click that opened the picker doesn't immediately
  // close it via the outside-click listener.
  setTimeout(() => document.addEventListener("click", outsidePromotionClick), 0);
}

// ── Drag start ──────────────────────────────────────────────────────────────
function startDrag(e, square) {
  const pieceEl = square.querySelector(".piece");
  if (!pieceEl) return;

  // Loaded BEFORE the gate, not after: Training's condition is expressed in
  // terms of chess.turn(), so the hook has to see the current position.
  chess.load(currentNode.fen);
  if (!dragAllowed(square)) return;

  const pieceColor = pieceEl.src.includes("/w_") ? "w" : "b";
  if (pieceColor !== chess.turn()) return;

  e.preventDefault();

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const boardEl = document.querySelector(".board");
  const squareSize = boardEl.getBoundingClientRect().width / 8;

  const ghost = document.createElement("img");
  ghost.src = pieceEl.src;
  ghost.className = "piece drag-ghost";
  ghost.style.cssText = `
    position:fixed;pointer-events:none;z-index:1000;
    left:0;top:0;
    width:${squareSize}px;height:${squareSize}px;
    will-change:transform;
  `;
  setGhostTransform(ghost, clientX, clientY, DRAG_GHOST_SCALE);
  document.body.appendChild(ghost);

  pieceEl.style.opacity = "0.25";
  square.style.outline = "3px solid rgba(255,255,255,0.4)";
  showValidMoves(square.id);

  if (selectedSquare && selectedSquare !== square) {
    selectedSquare.style.outline = "none";
    selectedSquare = null;
  }

  dragState = {
    pieceEl,
    ghost,
    fromSquare: square,
    fromRect: square.getBoundingClientRect(),
  };
}

// Wires the board's own pointer listeners. Call once from a page script,
// after the board element exists. `mousedown` ignores every button but the
// left one so a right-mousedown starting an annotation arrow cannot also
// start a piece drag underneath it.
function attachBoardDragListeners() {
  const boardElForDrag = document.querySelector(".board");
  if (!boardElForDrag) return;

  boardElForDrag.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const square = e.target.closest(".square");
    if (square) startDrag(e, square);
  });

  boardElForDrag.addEventListener(
    "touchstart",
    (e) => {
      const square = e.target.closest(".square");
      if (square) startDrag(e, square);
    },
    { passive: false },
  );

  document.addEventListener("mousemove", onDragMove, { passive: true });
  document.addEventListener("touchmove", onDragMove, { passive: true });
  document.addEventListener("mouseup", onDragEnd);
  document.addEventListener("touchend", onDragEnd);
}

// ── Board render + move animation ───────────────────────────────────────────
// Paints the position for `currentNode`, then animates the move that produced
// it: a motion trail always, plus a capture fade and a gliding piece clone
// unless suppressed.
//
// Used as-is by Analysis and Training. PUZZLES DELIBERATELY OVERRIDES THIS —
// its own `function renderBoard` is declared later (page scripts load after
// this file), which replaces the binding for every caller. That version is a
// genuine fork, not a stale copy: it takes an explicit `node`, reuses a
// decoded-image cache, clears clones still in flight when a puzzle changes,
// counter-rotates its clones so glides work on a flipped board, and routes
// its timers through the page's cancellable scheduleStep so a scripted
// opponent reply can be aborted mid-puzzle. Folding all of that in here
// would drag puzzle lifecycle state into shared code, so it stays forked.
//
// `suppressGlide` is true when a drag already put the piece where it belongs
// — re-animating it would replay a movement the user just performed.
function renderBoard(suppressGlide) {
  const boardEl = document.querySelector(".board");
  const before = snapshotBoard();

  chess.load(currentNode.fen);
  clearBoard();

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  chess.board().forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (!piece) return;
      const square = document.getElementById(files[colIndex] + (8 - rowIndex));
      const img = document.createElement("img");
      img.classList.add("piece");
      img.src = getPieceImage(piece.color, piece.type);
      square.appendChild(img);
    });
  });

  // Runs on every render, so it updates after each move and when navigating
  // forward/backward through move history and variations.
  applyLastMoveHighlight();
  if (chess.in_check()) {
    flashCheck(findKingSquare(chess, chess.turn()));
  }

  if (!currentNode.move) return;

  const move = currentNode.move;
  const fromData = before[move.from];
  if (!fromData) return;

  const toSquareEl = document.getElementById(move.to);
  if (!toSquareEl) return;

  const boardRect = boardEl.getBoundingClientRect();
  const toRect = toSquareEl.getBoundingClientRect();

  // Drawn ahead of the glide's own conditions below, so it also appears for a
  // dragged piece and on a flipped board. Unlike the piece clone, a symmetric
  // gradient has no orientation, so it simply rotates with the board (it is
  // told about the flip so its anchor can be converted into the board's own,
  // rotated coordinate space).
  drawMotionTrail(boardEl, boardRect, fromData.rect, toRect, boardFlipped);

  // When the board is flipped the glide clones would render mirrored and
  // un-rotated, causing a per-move orientation flicker, so skip them. (On
  // Analysis boardFlipped is always false, so only suppressGlide applies.)
  if (suppressGlide || boardFlipped) return;

  // Fade out any captured piece
  if (before[move.to]) {
    const cap = document.createElement("img");
    cap.src = before[move.to].src;
    cap.className = "piece anim-capture";
    // The transition is declared up front and the value changed two frames
    // later. Setting both together lets the browser collapse them into one
    // style resolution, in which case no transition runs — and the element,
    // whose removal was hooked to transitionend, then lingers invisibly at
    // opacity 0 and inflates the board's piece count.
    cap.style.cssText = `position:absolute;pointer-events:none;z-index:10;
      width:${before[move.to].rect.width}px;height:${before[move.to].rect.height}px;
      left:${before[move.to].rect.left - boardRect.left}px;
      top:${before[move.to].rect.top - boardRect.top}px;
      transition:opacity 150ms ease;opacity:1;`;
    boardEl.appendChild(cap);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cap.style.opacity = "0";
      });
    });

    // Removal is scheduled rather than left to transitionend alone, so a
    // transition that never fires cannot strand the element.
    setTimeout(() => cap.remove(), 400);
  }

  // Glide the piece
  const toEl = toSquareEl.querySelector(".piece");
  if (toEl) toEl.style.opacity = "0";

  const fly = document.createElement("img");
  fly.src = fromData.src;
  fly.className = "piece anim-fly";
  const sl = fromData.rect.left - boardRect.left;
  const st = fromData.rect.top - boardRect.top;
  const el = toRect.left - boardRect.left;
  const et = toRect.top - boardRect.top;
  fly.style.cssText = `position:absolute;pointer-events:none;z-index:20;
    width:${fromData.rect.width}px;height:${fromData.rect.height}px;
    left:${sl}px;top:${st}px;will-change:transform;
    transition:transform 200ms cubic-bezier(0.25,0.1,0.25,1);transform:translate(0,0);`;
  boardEl.appendChild(fly);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fly.style.transform = `translate(${el - sl}px,${et - st}px)`;
    });
  });

  // The destination piece is hidden while the clone flies over it, so this
  // must run even if the transition never fires — otherwise that piece would
  // stay invisible until the next render. Scheduled as well as hooked to
  // transitionend, and written to be safe to run twice.
  const finishGlide = () => {
    fly.remove();
    if (toEl) toEl.style.opacity = "1";
  };

  fly.addEventListener("transitionend", finishGlide, { once: true });
  setTimeout(finishGlide, 450);
}
