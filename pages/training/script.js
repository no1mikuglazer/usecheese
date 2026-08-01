/* Cheese — Training page */
// engine

let analysisTimeout = null;

const STOCKFISH_VERSION = "Stockfish 18 Lite";

// Training has no engine yet — a stub so every engine.* call is a harmless
// no-op. Real Stockfish integration is added in a later step.
const engine = { postMessage() {}, onmessage: null, terminate() {} };

// chess

const chess = new Chess();

// dom

const squares = document.querySelectorAll(".square");

const moveTreeContainer = document.getElementById("moveTree");

const evalScore = document.getElementById("evalScore");

const engineDepth = document.getElementById("engineDepth");

const bestMoveText = document.getElementById("bestMove");

const evalFill = document.getElementById("evalFill");

const evalText = document.getElementById("evalText");

const newGameBtn = document.getElementById("newGameBtn");

const deleteGameBtn = document.getElementById("deleteGameBtn");

const exportPgnBtn = document.getElementById("exportPgnBtn");

const loadPgnBtn = document.getElementById("loadPgnBtn");

const undoMoveBtn = document.getElementById("undoMoveBtn");

const redoMoveBtn = document.getElementById("redoMoveBtn");

const prevMoveBtn = document.getElementById("prevMoveBtn");

const nextMoveBtn = document.getElementById("nextMoveBtn");

// node class

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

// root

const root = new GameNode({
  fen: chess.fen(),
});

let currentNode = root;

// state

let selectedSquare = null;

let latestEngineUCILine = [];

// refresh

function refreshUI(suppressGlide) {
  renderBoard(suppressGlide);

  renderMoveTree();

  analyzePosition();
}

// analyze

function analyzePosition() {
  // Training does not analyse positions — the engine is disabled here.
}

// eval bar

function updateEvalBar(evalValue) {
  // Game is already over
  if (chess.in_checkmate()) {
    if (chess.turn() === "b") {
      // Black is checkmated
      evalFill.style.height = "100%";
      evalText.textContent = "1-0";
    } else {
      // White is checkmated
      evalFill.style.height = "0%";
      evalText.textContent = "0-1";
    }
    return;
  }

  // Mate handling
  if (typeof evalValue === "string" && evalValue.includes("M")) {
    const mateValue = parseInt(evalValue.replace("M", ""));

    if (mateValue > 0) {
      evalFill.style.height = "100%";
      evalText.textContent = evalValue;
    } else {
      evalFill.style.height = "0%";
      evalText.textContent = evalValue;
    }

    return;
  }

  // Normal centipawn evaluation
  let evalNum = parseFloat(evalValue);

  if (isNaN(evalNum)) {
    evalNum = 0;
  }

  evalNum = Math.max(-10, Math.min(10, evalNum));

  const percent = ((evalNum + 10) / 20) * 100;

  evalFill.style.height = `${percent}%`;
  evalText.textContent =
    evalNum > 0 ? `+${evalNum.toFixed(1)}` : evalNum.toFixed(1);

  // normal eval

  let numericEval = parseFloat(evalValue);

  if (isNaN(numericEval)) {
    numericEval = 0;
  }

  // clamp

  numericEval = Math.max(-10, Math.min(10, numericEval));

  // convert

  const percentage = 50 + numericEval * 5;

  // apply

  evalFill.style.height = `${percentage}%`;

  // text

  if (numericEval > 0) {
    evalText.textContent = "+" + numericEval.toFixed(1);
  } else {
    evalText.textContent = numericEval.toFixed(1);
  }
}

// render board

function snapshotBoard() {
  const snap = {};
  squares.forEach((sq) => {
    const img = sq.querySelector(".piece");
    if (img) snap[sq.id] = { src: img.src, rect: sq.getBoundingClientRect() };
  });
  return snap;
}

function renderBoard(suppressGlide) {
  // suppressGlide = true when drag already positioned the piece visually
  const boardEl = document.querySelector(".board");
  const before = snapshotBoard();

  chess.load(currentNode.fen);
  clearBoard();

  chess.board().forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (!piece) return;

      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

      const squareId = files[colIndex] + (8 - rowIndex);

      const square = document.getElementById(squareId);

      const img = document.createElement("img");

      img.classList.add("piece");

      img.src = getPieceImage(piece.color, piece.type);

      square.appendChild(img);
    });
  });

  // ── Last-move highlight + king-in-check flash ──────────────────────────────
  // Runs on every render, so it updates after each move and when navigating
  // forward/backward through move history and variations.
  applyLastMoveHighlight();
  if (chess.in_check()) {
    flashCheck(findKingSquare(chess, chess.turn()));
  }

  // When the board is flipped (player is Black) the glide clones would render
  // mirrored/un-rotated and cause a per-move orientation flicker, so skip them.
  if (suppressGlide || boardFlipped || !currentNode.move) return;

  // ── Glide animation for click-to-move ──────────────────────────────────────
  const move = currentNode.move;
  const fromData = before[move.from];
  if (!fromData) return;

  const toSquareEl = document.getElementById(move.to);
  if (!toSquareEl) return;

  const boardRect = boardEl.getBoundingClientRect();
  const toRect = toSquareEl.getBoundingClientRect();

  // Fade out any captured piece
  if (before[move.to]) {
    const cap = document.createElement("img");
    cap.src = before[move.to].src;
    cap.className = "piece anim-capture";
    cap.style.cssText = `position:absolute;pointer-events:none;z-index:10;
      width:${before[move.to].rect.width}px;height:${before[move.to].rect.height}px;
      left:${before[move.to].rect.left - boardRect.left}px;
      top:${before[move.to].rect.top - boardRect.top}px;`;
    boardEl.appendChild(cap);
    requestAnimationFrame(() => {
      cap.style.transition = "opacity 150ms ease";
      cap.style.opacity = "0";
      cap.addEventListener("transitionend", () => cap.remove(), { once: true });
    });
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

  fly.addEventListener(
    "transitionend",
    () => {
      fly.remove();
      if (toEl) toEl.style.opacity = "1";
    },
    { once: true },
  );
}

// clear board

function clearBoard() {
  squares.forEach((square) => {
    square.innerHTML = "";
  });
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
// Sounds are played ONLY for newly played moves (from playMove) — never during
// history navigation, PGN rebuilding, or engine analysis.

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

// play move
// suppressSound = true skips audio (used for bulk auto-loading an opening so
// we don't fire a burst of move sounds).

function playMove(moveInput, suppressGlide, suppressSound) {
  chess.load(currentNode.fen);

  const move = chess.move(moveInput);

  if (!move) {
    // Illegal move attempt — if the mover is in check, flash the king
    flashKingIfInCheck(currentNode.fen);
    return false;
  }

  // Position in `chess` is now post-move; true if this move checks the opponent.
  const gaveCheck = chess.in_check();

  let existingChild = currentNode.findChildBySAN(move.san);

  if (existingChild) {
    currentNode = existingChild;
  } else {
    const newNode = new GameNode({
      move: move,

      fen: chess.fen(),

      parent: currentNode,
    });

    currentNode.addChild(newNode);

    currentNode = newNode;
  }

  // Newly played move only (history navigation never calls playMove)
  if (!suppressSound) {
    playSound(moveSoundName(move, gaveCheck));
  }

  refreshUI(suppressGlide);

  return true;
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

// square clicks

squares.forEach((square) => {
  square.addEventListener("click", () => {
    chess.load(currentNode.fen);

    // Turn enforcement: only the human's colour, only on the human's turn.
    if (!trGameActive || chess.turn() !== trPlayerColor) return;

    // Linear game: never branch. Must be on the latest move to play.
    if (currentNode !== mainlineTip()) {
      showToast("Go to the latest move to continue");
      return;
    }

    if (!selectedSquare) {
      const piece = square.querySelector(".piece");

      if (!piece) return;

      const pieceColor = piece.src.includes("/w_") ? "w" : "b";

      if (pieceColor !== chess.turn()) return;

      selectedSquare = square;

      square.style.outline = "3px solid rgba(255,255,255,0.4)";

      showValidMoves(square.id);
    } else {
      // clicking the same square deselects
      if (square === selectedSquare) {
        clearValidMoves();
        selectedSquare.style.outline = "none";
        selectedSquare = null;
        return;
      }

      // clicking another own piece re-selects
      const piece = square.querySelector(".piece");
      if (piece) {
        const pieceColor = piece.src.includes("/w_") ? "w" : "b";
        if (pieceColor === chess.turn()) {
          clearValidMoves();
          selectedSquare.style.outline = "none";
          selectedSquare = square;
          square.style.outline = "3px solid rgba(255,255,255,0.4)";
          showValidMoves(square.id);
          return;
        }
      }

      const from = selectedSquare.id;

      const to = square.id;

      clearValidMoves();

      selectedSquare.style.outline = "none";

      selectedSquare = null;

      if (isPromotionMove(from, to)) {
        showPromotionPicker(from, to);
      } else {
        playMove({ from, to });
      }
    }
  });
});

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

// promotion picker

let pendingPromotion = null;

function showPromotionPicker(from, to) {
  pendingPromotion = { from, to };
  chess.load(currentNode.fen);
  const piece = chess.get(from);
  const isWhite = piece.color === "w";
  const pieces = ["q", "r", "b", "n"];
  const orderedPieces = isWhite ? pieces : [...pieces].reverse();
  const toSquareEl = document.getElementById(to);
  const boardEl = document.querySelector(".board");
  const boardRect = boardEl.getBoundingClientRect();
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
      closePromotionPicker();
      playMove({
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: p,
      });
      pendingPromotion = null;
    });
    popup.appendChild(btn);
  });
  // Position in viewport coordinates and attach to <body> so the picker is
  // never rotated with the board (works when playing as Black / flipped).
  popup.style.position = "fixed";
  let pxLeft = squareRect.left;
  let pxTop = squareRect.top;
  if (pxTop + squareSize * 4 > window.innerHeight) {
    pxTop = squareRect.bottom - squareSize * 4;
  }
  popup.style.left = Math.max(8, Math.min(pxLeft, window.innerWidth - squareSize - 8)) + "px";
  popup.style.top = Math.max(8, pxTop) + "px";
  popup.style.width = squareSize + "px";
  document.body.appendChild(popup);
  setTimeout(() => {
    document.addEventListener("click", outsidePromotionClick);
  }, 0);
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

// ── DRAG AND DROP ────────────────────────────────────────────────────────────

let boardFlipped = false;

// Training play-vs-bot state (set when a game starts)
let trGameActive = false;
let trPlayerColor = "w"; // colour the human plays
let trEngineColor = "b"; // colour Stockfish plays

let dragState = null;

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

function isLegalMove(from, to) {
  chess.load(currentNode.fen);
  const moves = chess.moves({ square: from, verbose: true });
  return moves.some((m) => m.to === to);
}

function animateSnapBack(ghost, toRect, fromRect) {
  // Piece was dropped illegally — animate ghost back to source then remove
  ghost.style.transition =
    "left 180ms cubic-bezier(0.25,0.1,0.25,1), top 180ms cubic-bezier(0.25,0.1,0.25,1)";
  ghost.style.left = fromRect.left + fromRect.width / 2 + "px";
  ghost.style.top = fromRect.top + fromRect.height / 2 + "px";
  ghost.addEventListener("transitionend", () => ghost.remove(), { once: true });
}

function startDrag(e, square) {
  const pieceEl = square.querySelector(".piece");
  if (!pieceEl) return;
  chess.load(currentNode.fen);
  // Turn enforcement: the human may only drag their own colour, on their turn.
  if (!trGameActive || chess.turn() !== trPlayerColor) return;
  // Linear game: block dragging while reviewing an earlier position.
  if (currentNode !== mainlineTip()) {
    showToast("Go to the latest move to continue");
    return;
  }
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
    width:${squareSize}px;height:${squareSize}px;
    transform:translate(-50%,-50%) scale(1.08);
    left:${clientX}px;top:${clientY}px;
    will-change:left,top;
  `;
  document.body.appendChild(ghost);

  pieceEl.style.opacity = "0.25";
  square.style.outline = "3px solid rgba(255,255,255,0.4)";
  showValidMoves(square.id);

  if (selectedSquare && selectedSquare !== square) {
    selectedSquare.style.outline = "none";
    selectedSquare = null;
  }

  const fromRect = square.getBoundingClientRect();
  dragState = { pieceEl, ghost, fromSquare: square, fromRect };
}

function onDragMove(e) {
  if (!dragState) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  dragState.ghost.style.left = clientX + "px";
  dragState.ghost.style.top = clientY + "px";
}

function onDragEnd(e) {
  if (!dragState) return;

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
    const toRect = ghost.getBoundingClientRect();
    animateSnapBack(ghost, toRect, fromRect);
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

const boardElForDrag = document.querySelector(".board");
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
document.addEventListener("mousemove", onDragMove);
document.addEventListener("touchmove", onDragMove, { passive: true });
document.addEventListener("mouseup", onDragEnd);
document.addEventListener("touchend", onDragEnd);

// ── END DRAG AND DROP ────────────────────────────────────────────────────────

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

// engine output

engine.onmessage = function (event) {
  const line = event.data;

  if (line.includes("depth")) {
    const depthMatch = line.match(/depth (\d+)/);

    if (depthMatch) {
      engineDepth.textContent =
        "depth=" + depthMatch[1] + " | " + STOCKFISH_VERSION;
    }
  }

  // evaluation

  if (line.includes("score cp")) {
    const scoreMatch = line.match(/score cp (-?\d+)/);

    if (scoreMatch) {
      let score = parseInt(scoreMatch[1]);

      // Stockfish reports score from the side to move; convert to white-relative
      const tempChessEval = new Chess(currentNode.fen);
      if (tempChessEval.turn() === "b") score = -score;

      score = (score / 100).toFixed(1);

      currentNode.engineEval = score;

      // show sign
      const displayScore = parseFloat(score) > 0 ? "+" + score : score;

      evalScore.textContent = displayScore;

      updateEvalBar(score);
    }
  }

  // mate

  if (line.includes("score mate")) {
    const mateMatch = line.match(/score mate (-?\d+)/);

    if (mateMatch) {
      let mateNum = parseInt(mateMatch[1]);

      // flip for black's turn
      const tempChessMate = new Chess(currentNode.fen);
      if (tempChessMate.turn() === "b") mateNum = -mateNum;

      const mateStr = "M" + mateNum;

      evalScore.textContent = mateStr;

      updateEvalBar(mateStr);
    }
  }

  // pv

  if (line.includes(" pv ")) {
    const pv = line.split(" pv ")[1];

    if (!pv) return;

    const uciMoves = pv.trim().split(" ");

    latestEngineUCILine = uciMoves;

    currentNode.engineLine = uciMoves;

    const tempChess = new Chess(currentNode.fen);

    let html = "";

    let currentMoveNumber = Math.floor(currentNode.ply / 2) + 1;

    let startsWithBlack = currentNode.ply % 2 === 1;

    // 5 FULL MOVES

    const moveLimit = 10;

    for (let i = 0; i < Math.min(uciMoves.length, moveLimit); i++) {
      const uci = uciMoves[i];

      const move = tempChess.move({
        from: uci.slice(0, 2),

        to: uci.slice(2, 4),

        promotion: "q",
      });

      if (!move) continue;

      if (move.color === "w") {
        html += `${currentMoveNumber}. `;
      } else if (i === 0 && startsWithBlack) {
        html += `${currentMoveNumber}... `;
      }

      html += `

            <span class="
            engine-line-move"

            data-index="${i}">

                ${move.san}

            </span>

            `;

      if (move.color === "b") {
        currentMoveNumber++;
      }
    }

    bestMoveText.innerHTML = html;

    addEngineLineClickEvents();
  }
};

// undo

undoMoveBtn.addEventListener("click", () => {
  if (currentNode.parent) {
    currentNode = currentNode.parent;

    refreshUI();
  }
});

// redo

redoMoveBtn.addEventListener("click", () => {
  if (currentNode.children.length) {
    currentNode = currentNode.children[0];

    refreshUI();
  }
});

// first move

prevMoveBtn.addEventListener("click", () => {
  currentNode = root;

  refreshUI();
});

// last move

nextMoveBtn.addEventListener("click", () => {
  let node = currentNode;

  while (node.children.length) {
    node = node.children[0];
  }

  currentNode = node;

  refreshUI();
});

// arrow keys

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

// export pgn

// Save handler lives in the "Save System" block at the end of this file.

// Review (Import PGN) handler lives in the "Review" block at the end of this file.

// new game

newGameBtn.addEventListener("click", () => {
  if (!confirm("Start a new game?\nYour current game will be lost.")) return;
  resetAnalysisState();
  refreshUI();
  if (window.__trainingReturnToSelect) window.__trainingReturnToSelect();
});

// (Delete removed for Training — only New + Save remain.)

// copy pgn to clipboard

function showToast(msg) {
  let toast = document.getElementById("ap-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ap-toast";
    toast.className = "ap-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("ap-toast-visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("ap-toast-visible");
  }, 2200);
}

const copyPgnBtn = document.getElementById("copyPgnBtn");
if (copyPgnBtn) {
  copyPgnBtn.addEventListener("click", () => {
    const pgn = generatePGNFromNode(currentNode);
    navigator.clipboard
      .writeText(pgn)
      .then(() => {
        showToast("PGN copied to clipboard");
      })
      .catch(() => {
        showToast("Copy failed — check browser permissions");
      });
  });
}

// edit analysis name

let customPositionName = null;

const editNameBtn = document.getElementById("editNameBtn");
if (editNameBtn) {
  editNameBtn.addEventListener("click", () => {
    const posLabel = document.getElementById("apPositionLabel");
    const current = posLabel ? posLabel.textContent : "Starting Position";
    const newName = prompt("Rename analysis:", current);
    if (newName === null) return; // cancelled
    const trimmed = newName.trim() || "Starting Position";
    customPositionName = trimmed;
    if (posLabel) posLabel.textContent = trimmed;
  });
}

// ── Opening Explorer → Analysis integration ─────────────────────────────────
// On load, check localStorage for an opening selected in the Opening Explorer.
// If present, replay its moves through the existing playMove pipeline so the
// board, move tree, PGN, and Stockfish all update exactly as if played by hand.
// The position label is set via the existing customPositionName mechanism.
// The stored opening is cleared afterwards so it never reloads on a later visit.

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

// initial
refreshUI();

// Training starts from a clean board — it does not consume the Analysis
// opening / Database PGN handoffs.


// ── Save System (localStorage) ──────────────────────────────────────────────
// Local-only saves: analysis name + mainline PGN + creation date. No accounts,
// no backend, no overwriting (each save is appended). Saved analyses appear in
// the existing Games tab; clicking one reloads it through the normal
// playMove -> refreshUI pipeline, so it behaves like a hand-played analysis.

const SAVED_ANALYSES_KEY = "cheeseSavedAnalyses";

const tabAnalysisEl = document.getElementById("tabAnalysis");
const tabGamesEl = document.getElementById("tabGames");
const analysisPanelEl = document.getElementById("analysisPanel");
const gamesPanelEl = document.getElementById("gamesPanel");
const savedGamesListEl = document.getElementById("savedGamesList");
const apGamesCountEl = document.getElementById("apGamesCount");

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
    showToast("Could not save \u2014 storage unavailable");
    return false;
  }
}

// Deepest node along the main line (root -> children[0] -> ...)
function mainlineTip() {
  let node = root;
  while (node.children.length) node = node.children[0];
  return node;
}

// Reset board + tree to an empty game (mirrors the New/Delete reset)
function resetAnalysisState() {
  customPositionName = null;
  chess.reset();
  root.children = [];
  root.engineLine = [];
  root.engineEval = null;
  root.fen = chess.fen();
  currentNode = root;
  latestEngineUCILine = [];
}

function formatSavedDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " \u00b7 " +
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

// Load a saved analysis back onto the board, then show the Analysis tab.
function loadSavedAnalysis(entry) {
  if (!entry || !entry.pgn) return;

  resetAnalysisState();

  const sanMoves = parseOpeningMoves(entry.pgn);
  for (const san of sanMoves) {
    const ok = playMove(san, true, true); // suppressGlide + suppressSound
    if (!ok) break;
  }

  if (entry.name) customPositionName = entry.name;

  refreshUI(); // re-renders board + tree and triggers Stockfish (analyzePosition)
  switchTab("analysis");
  showToast('Loaded "' + (entry.name || "analysis") + '"');
}

function deleteSavedAnalysis(id) {
  const list = readSavedAnalyses().filter((x) => x.id !== id);
  writeSavedAnalyses(list);
  renderSavedGames();
}

// Render saved analyses into the Games tab (newest first).
function renderSavedGames() {
  if (!savedGamesListEl) return;
  const list = readSavedAnalyses();

  if (apGamesCountEl) apGamesCountEl.textContent = list.length ? String(list.length) : "";

  savedGamesListEl.innerHTML = "";

  if (!list.length) {
    savedGamesListEl.innerHTML =
      '<div class="ap-games-empty">No saved analyses yet. ' +
      "Open the Analysis tab and press Save to store one.</div>";
    return;
  }

  const frag = document.createDocumentFragment();

  list
    .slice()
    .reverse()
    .forEach((entry) => {
      const card = document.createElement("div");
      card.className = "ap-game-card";
      card.dataset.id = entry.id;

      const info = document.createElement("div");
      info.className = "ap-game-info";

      const name = document.createElement("div");
      name.className = "ap-game-name";
      name.textContent = entry.name || "Untitled";

      const date = document.createElement("div");
      date.className = "ap-game-date";
      date.textContent = formatSavedDate(entry.created);

      info.appendChild(name);
      info.appendChild(date);

      const del = document.createElement("button");
      del.className = "ap-game-delete";
      del.setAttribute("aria-label", "Delete saved analysis");
      del.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

      card.appendChild(info);
      card.appendChild(del);
      frag.appendChild(card);
    });

  savedGamesListEl.appendChild(frag);
}

// Switch between the Analysis and Games tab panels.
function switchTab(name) {
  const showGames = name === "games";

  if (tabAnalysisEl) tabAnalysisEl.classList.toggle("ap-tab-active", !showGames);
  if (tabGamesEl) tabGamesEl.classList.toggle("ap-tab-active", showGames);

  if (analysisPanelEl) analysisPanelEl.style.display = showGames ? "none" : "flex";
  if (gamesPanelEl) gamesPanelEl.style.display = showGames ? "flex" : "none";

  if (showGames) renderSavedGames();
}

if (tabAnalysisEl) tabAnalysisEl.addEventListener("click", () => switchTab("analysis"));
if (tabGamesEl) tabGamesEl.addEventListener("click", () => switchTab("games"));

exportPgnBtn.addEventListener("click", saveCurrentAnalysis);

if (savedGamesListEl) {
  savedGamesListEl.addEventListener("click", (e) => {
    const card = e.target.closest(".ap-game-card");
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest(".ap-game-delete")) {
      e.stopPropagation();
      deleteSavedAnalysis(id);
      return;
    }

    const entry = readSavedAnalyses().find((x) => x.id === id);
    if (entry) loadSavedAnalysis(entry);
  });
}


// ── Review (Import PGN) ──────────────────────────────────────────────────────
// Paste any valid PGN, then replay it through the existing playMove -> refreshUI
// pipeline so the board, move tree, and Stockfish behave like a normal game.

const pgnModalOverlay = document.getElementById("pgnModalOverlay");
const pgnModalCloseBtn = document.getElementById("pgnModalClose");
const pgnCancelBtn = document.getElementById("pgnCancelBtn");
const pgnLoadBtn = document.getElementById("pgnLoadBtn");
const pgnInput = document.getElementById("pgnInput");

function openReviewModal() {
  if (!pgnModalOverlay) return;
  pgnModalOverlay.style.display = "flex";
  if (pgnInput) {
    pgnInput.value = "";
    setTimeout(() => pgnInput.focus(), 0);
  }
}

function closeReviewModal() {
  if (pgnModalOverlay) pgnModalOverlay.style.display = "none";
}

// Raw PGN text -> { sanMoves, headers }. Prefers chess.js's parser (handles
// headers, comments, NAGs); falls back to a plain movetext strip.
function parsePGN(text) {
  const probe = new Chess();
  let ok = false;
  try {
    ok = probe.load_pgn(text, { sloppy: true });
  } catch (e) {
    ok = false;
  }
  if (ok) {
    const hist = probe.history();
    if (hist.length) return { sanMoves: hist, headers: probe.header() || {} };
  }
  return { sanMoves: parseOpeningMoves(text), headers: {} };
}

// Update the Analysis info panel + board headers from PGN tags
// ("?" placeholders count as empty).
function applyPGNMetadata(headers) {
  const val = (v) => {
    const t = (v || "").trim();
    return t === "?" ? "" : t;
  };

  const white = val(headers.White) || "White";
  const black = val(headers.Black) || "Black";

  customPositionName = val(headers.Event) || "Imported PGN";

  const names = {
    apWhiteName: white,
    apBlackName: black,
    whitePlayerName: white,
    blackPlayerName: black,
  };
  for (const [id, text] of Object.entries(names)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

function importPGN(text) {
  const pgn = (text || "").trim();
  if (!pgn) {
    showToast("Paste a PGN first");
    return;
  }

  const { sanMoves, headers } = parsePGN(pgn);
  if (!sanMoves.length) {
    showToast("Could not read that PGN");
    return;
  }

  resetAnalysisState();
  currentNode = root;

  let played = 0;
  for (const san of sanMoves) {
    if (!playMove(san, true, true)) break; // suppressGlide + suppressSound
    played++;
  }

  if (!played) {
    showToast("Could not read that PGN");
    return;
  }

  applyPGNMetadata(headers);
  refreshUI(); // re-renders board + tree and triggers Stockfish (analyzePosition)
  switchTab("analysis");
  closeReviewModal();
  showToast("PGN loaded");
}

if (loadPgnBtn) loadPgnBtn.addEventListener("click", openReviewModal);
if (pgnModalCloseBtn) pgnModalCloseBtn.addEventListener("click", closeReviewModal);
if (pgnCancelBtn) pgnCancelBtn.addEventListener("click", closeReviewModal);
if (pgnLoadBtn)
  pgnLoadBtn.addEventListener("click", () => importPGN(pgnInput ? pgnInput.value : ""));

if (pgnModalOverlay) {
  pgnModalOverlay.addEventListener("click", (e) => {
    if (e.target === pgnModalOverlay) closeReviewModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    pgnModalOverlay &&
    pgnModalOverlay.style.display !== "none"
  ) {
    closeReviewModal();
  }
});

// (Analysis-only PGN/opening handoff intentionally omitted on Training.)

// ── Training: dedicated Stockfish opponent ──────────────────────────────────
// A SEPARATE engine worker. The analysis `engine` stays a no-op stub so its
// dormant onmessage never touches the removed eval UI; this worker only asks
// for a best move and plays it for Stockfish's colour.

let trEngine = null;

function trInitEngine() {
  if (trEngine) return;
  try {
    trEngine = new Worker("../../engine/stockfish/stockfish.js");
  } catch (err) {
    trEngine = null;
    return;
  }
  trEngine.onmessage = function (event) {
    const line =
      typeof event.data === "string" ? event.data : String(event.data || "");
    if (line.indexOf("bestmove") === 0) {
      trApplyEngineMove(line.split(/\s+/)[1]);
    }
  };
  trEngine.postMessage("uci");
  trEngine.postMessage("isready");
}

function trGameOver() {
  return typeof chess.game_over === "function" && chess.game_over();
}

function trRequestEngineMove() {
  if (!trGameActive || !trEngine) return;
  chess.load(currentNode.fen);
  if (trGameOver() || chess.turn() !== trEngineColor) return;
  trEngine.postMessage("position fen " + currentNode.fen);
  trEngine.postMessage("go movetime 700");
}

function trApplyEngineMove(uci) {
  if (!trGameActive || !uci || uci === "(none)") return;
  chess.load(currentNode.fen);
  if (trGameOver() || chess.turn() !== trEngineColor) return;
  const move = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  if (uci.length > 4) move.promotion = uci[4];
  playMove(move); // wrapped playMove -> renders + sound; turn returns to human
}

// ── Game-over detection ──────────────────────────────────────────────────────
// Replay the whole mainline into a fresh engine-of-rules instance so history
// dependent draws (threefold, fifty-move) are detected accurately.
function trBuildGameChess() {
  const c = new Chess();
  let node = root;
  while (node.children.length) {
    node = node.children[0];
    if (!node.move) break;
    c.move(node.move.san);
  }
  return c;
}

function trGameResult() {
  const c = trBuildGameChess();
  if (!c.game_over()) return { over: false };
  if (c.in_checkmate()) {
    const winner = c.turn() === "w" ? "b" : "w"; // side to move is the one mated
    return {
      over: true,
      winner: winner,
      title: winner === "w" ? "White Wins" : "Black Wins",
      reason: "Won by Checkmate",
    };
  }
  if (c.in_stalemate())
    return { over: true, winner: null, title: "Draw", reason: "Draw by Stalemate" };
  if (c.insufficient_material())
    return { over: true, winner: null, title: "Draw", reason: "Draw by Insufficient Material" };
  if (c.in_threefold_repetition())
    return { over: true, winner: null, title: "Draw", reason: "Draw by Threefold Repetition" };
  if (c.in_draw())
    return { over: true, winner: null, title: "Draw", reason: "Draw by Fifty-Move Rule" };
  return { over: true, winner: null, title: "Draw", reason: "Draw" };
}

// ── Winner highlight on the board player panels ──────────────────────────────
function trClearWinner() {
  document
    .querySelectorAll(".player.tr-winner")
    .forEach((el) => el.classList.remove("tr-winner"));
}

function trHighlightWinner(winner) {
  trClearWinner();
  if (!winner) return;
  const panel = document.querySelector(winner === "w" ? ".white-player" : ".black-player");
  if (panel) panel.classList.add("tr-winner");
}

// ── Game-over modal ──────────────────────────────────────────────────────────
function trModalPfp(el, isBot) {
  if (el) el.style.backgroundImage = isBot ? "url('../../assets/icons/stockfish-bot.webp')" : "";
}

function trShowGameOver(result) {
  const overlay = document.getElementById("trGameOver");
  if (!overlay) return;
  const BOT = "Stockfish 18 (3000)";
  const ME = "You";
  // Always reflect the colours the players chose — never the winner.
  const humanIsWhite = trPlayerColor === "w";
  const wName = document.getElementById("trGoWhiteName");
  const bName = document.getElementById("trGoBlackName");
  if (wName) wName.textContent = humanIsWhite ? ME : BOT;
  if (bName) bName.textContent = humanIsWhite ? BOT : ME;
  trModalPfp(document.getElementById("trGoWhitePfp"), !humanIsWhite);
  trModalPfp(document.getElementById("trGoBlackPfp"), humanIsWhite);
  const titleEl = document.getElementById("trGoTitle");
  const reasonEl = document.getElementById("trGoReason");
  if (titleEl) titleEl.textContent = result.title;
  if (reasonEl) reasonEl.textContent = result.reason;
  trHighlightWinner(result.winner);
  overlay.hidden = false;
}

function trHideGameOver() {
  const overlay = document.getElementById("trGameOver");
  if (overlay) overlay.hidden = true;
}

// After any successful move: end the game if it is over, else let Stockfish reply.
const __trBasePlayMove = playMove;
playMove = function (moveInput, suppressGlide, suppressSound) {
  const ok = __trBasePlayMove(moveInput, suppressGlide, suppressSound);
  if (ok && trGameActive) {
    const result = trGameResult();
    if (result.over) {
      trGameActive = false;
      trShowGameOver(result);
    } else {
      chess.load(currentNode.fen);
      if (chess.turn() === trEngineColor) setTimeout(trRequestEngineMove, 180);
    }
  }
  return ok;
};

// ── Player header panels (DOM: top = Black panel, bottom = White panel) ──────
function trSetPfp(el, isBot) {
  if (!el) return;
  if (isBot) {
    el.style.backgroundImage = "url('../../assets/icons/stockfish-bot.webp')";
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.classList.add("tr-bot-pfp");
  } else {
    el.style.backgroundImage = "";
    el.classList.remove("tr-bot-pfp");
  }
}

function trSetPlayers(color) {
  const BOT = "Stockfish 18 (3000)";
  const ME = "You";
  const whiteName = document.getElementById("whitePlayerName");
  const blackName = document.getElementById("blackPlayerName");
  const botIsWhite = color === "black"; // human plays Black -> Stockfish is White
  if (whiteName) whiteName.textContent = botIsWhite ? BOT : ME;
  if (blackName) blackName.textContent = botIsWhite ? ME : BOT;
  trSetPfp(document.querySelector(".white-pfp"), botIsWhite);
  trSetPfp(document.querySelector(".black-pfp"), !botIsWhite);
}

function trResetPlayers() {
  const whiteName = document.getElementById("whitePlayerName");
  const blackName = document.getElementById("blackPlayerName");
  if (whiteName) whiteName.textContent = "White";
  if (blackName) blackName.textContent = "Black";
  trSetPfp(document.querySelector(".white-pfp"), false);
  trSetPfp(document.querySelector(".black-pfp"), false);
}

// ── Training panel controller (bot select -> colour -> play -> game) ─────────
(function trainingMode() {
  const titleEl    = document.getElementById("trPanelTitle");
  const selectView = document.getElementById("trSelectView");
  const gameView   = document.getElementById("trGameView");
  const botCard    = document.getElementById("trBotCard");
  const config     = document.getElementById("trConfig");
  const colWhite   = document.getElementById("trColorWhite");
  const colBlack   = document.getElementById("trColorBlack");
  const playBtn    = document.getElementById("trPlayBtn");
  const boardArea  = document.querySelector(".board-area");
  if (!selectView || !gameView || !botCard) return;

  let chosenColor = null; // "white" | "black" | null

  function applyOrientation(color) {
    boardFlipped = color === "black";
    if (boardArea) boardArea.classList.toggle("flipped", boardFlipped);
  }

  function showSelect() {
    titleEl.textContent = "Bot";
    gameView.hidden = true;
    selectView.hidden = false;
    config.hidden = true;
    botCard.classList.remove("is-active");
    chosenColor = null;
    colWhite.classList.remove("is-selected");
    colBlack.classList.remove("is-selected");
  }

  function showGame() {
    titleEl.textContent = "Game";
    selectView.hidden = true;
    gameView.hidden = false;
  }

  // Tapping the bot card expands the colour + Play panel beneath it.
  botCard.addEventListener("click", () => {
    const willOpen = config.hidden;
    config.hidden = !willOpen;
    botCard.classList.toggle("is-active", willOpen);
  });

  function selectColor(c) {
    chosenColor = c;
    colWhite.classList.toggle("is-selected", c === "white");
    colBlack.classList.toggle("is-selected", c === "black");
  }
  colWhite.addEventListener("click", () => selectColor("white"));
  colBlack.addEventListener("click", () => selectColor("black"));

  // Play -> start a fresh game in the chosen orientation (default White).
  playBtn.addEventListener("click", () => {
    const color = chosenColor || "white";
    trClearWinner();
    resetAnalysisState();
    applyOrientation(color);
    trPlayerColor = color === "white" ? "w" : "b";
    trEngineColor = color === "white" ? "b" : "w";
    trSetPlayers(color);
    refreshUI();
    showGame();
    trGameActive = true;
    trInitEngine();
    // If Stockfish has White (human chose Black), it opens the game.
    setTimeout(trRequestEngineMove, 250);
  });

  // The New button (game toolbar) calls this to return to bot selection.
  window.__trainingReturnToSelect = function () {
    trGameActive = false;
    trClearWinner();
    applyOrientation("white");
    trResetPlayers();
    showSelect();
  };

  showSelect();
})();

// ── Game-over modal buttons ─────────────────────────────────────────────────
(function trGameOverButtons() {
  const playAgain = document.getElementById("trGoPlayAgain");
  const closeBtn = document.getElementById("trGoClose");
  if (playAgain) {
    playAgain.addEventListener("click", () => {
      trHideGameOver();
      trClearWinner();
      if (window.__trainingReturnToSelect) window.__trainingReturnToSelect();
      resetAnalysisState();
      refreshUI();
    });
  }
  if (closeBtn) {
    // Close leaves the final position (and winner glow) visible.
    closeBtn.addEventListener("click", trHideGameOver);
  }
})();

// ── Resign ───────────────────────────────────────────────────────────────────
// Ends the active game and reuses the existing Game Over popup: the opponent
// wins and the reason becomes "Won by Resignation". Nothing else changes.
(function trResign() {
  const btn = document.getElementById("resignBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!trGameActive) return;
    if (!confirm("Are you sure you want to resign?")) return;
    const winner = trPlayerColor === "w" ? "b" : "w"; // opponent wins
    trGameActive = false;
    trShowGameOver({
      over: true,
      winner: winner,
      title: winner === "w" ? "White Wins" : "Black Wins",
      reason: "Won by Resignation",
    });
  });
})();