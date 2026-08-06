/* Cheese — Analysis page */
// engine

let analysisTimeout = null;

const STOCKFISH_VERSION = "Stockfish 18 Lite";

const engine = new Worker("../../engine/stockfish/stockfish.js");

engine.postMessage("uci");
engine.postMessage("isready");

// chess

const chess = new Chess();

// dom

const squares = document.querySelectorAll(".square");

// Right-click circles/arrows (assets/js/board-annotations.js). Analysis
// never flips its board, but the module needs no orientation info regardless
// — see that file's header for why.
const boardAnnotations = attachBoardAnnotations(document.querySelector(".board"));

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
  clearTimeout(analysisTimeout);

  // Stop immediately so Stockfish is never mid-search when the new command arrives
  engine.postMessage("stop");

  analysisTimeout = setTimeout(() => {
    engine.postMessage("position fen " + currentNode.fen);

    engine.postMessage("go depth 18");
  }, 80);
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

// snapshotBoard — moved to assets/js/board-core.js

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

  if (!currentNode.move) return;

  const move = currentNode.move;
  const fromData = before[move.from];
  if (!fromData) return;

  const toSquareEl = document.getElementById(move.to);
  if (!toSquareEl) return;

  const boardRect = boardEl.getBoundingClientRect();
  const toRect = toSquareEl.getBoundingClientRect();

  // ── Motion trail ───────────────────────────────────────────────────────────
  // Drawn ahead of the glide's own condition below, so a dragged piece gets
  // one too — the user moved it themselves, so there is no glide to
  // accompany, but the streak still shows the path it took. Analysis never
  // flips the board, hence `false`. Shared with Training and Puzzles via
  // assets/js/board-core.js.
  drawMotionTrail(boardEl, boardRect, fromData.rect, toRect, false);

  if (suppressGlide) return;

  // ── Glide animation for click-to-move ──────────────────────────────────────
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

// clearBoard, getPieceImage, HIGHLIGHT_FILES, clearBoardHighlights,
// applyLastMoveHighlight, findKingSquare, flashCheck, flashKingIfInCheck —
// moved to assets/js/board-core.js

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

// playSound, moveSoundName — moved to assets/js/board-core.js

// play move
// suppressSound = true skips audio (used for bulk auto-loading an opening so
// we don't fire a burst of move sounds).

function playMove(moveInput, suppressGlide, suppressSound) {
  chess.load(currentNode.fen);

  // sloppy: accept the loose SAN found in the ECO data (e.g. the needlessly
  // disambiguated "Ncb4"), matching the parser already used for PGN import.
  // Illegal moves still return null, so drag/click validation is unaffected.
  const move = chess.move(moveInput, { sloppy: true });

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

// showValidMoves, clearValidMoves — moved to assets/js/board-core.js

// square clicks

squares.forEach((square) => {
  square.addEventListener("click", () => {
    chess.load(currentNode.fen);

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

// isPromotionMove — moved to assets/js/board-core.js

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
  const left = squareRect.left - boardRect.left;
  const top = isWhite
    ? squareRect.top - boardRect.top
    : squareRect.bottom - boardRect.top - squareSize * 4;
  popup.style.left = Math.min(left, boardRect.width - squareSize) + "px";
  popup.style.top = top + "px";
  popup.style.width = squareSize + "px";
  boardEl.appendChild(popup);
  setTimeout(() => {
    document.addEventListener("click", outsidePromotionClick);
  }, 0);
}

// outsidePromotionClick, closePromotionPicker — moved to assets/js/board-core.js

// ── DRAG AND DROP ────────────────────────────────────────────────────────────

let dragState = null;

function getDragTargetSquare(clientX, clientY) {
  const boardEl = document.querySelector(".board");
  const boardRect = boardEl.getBoundingClientRect();
  const squareSize = boardRect.width / 8;
  const col = Math.floor((clientX - boardRect.left) / squareSize);
  const row = Math.floor((clientY - boardRect.top) / squareSize);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return files[col] + (8 - row);
}

// isLegalMove, animateSnapBack — moved to assets/js/board-core.js

function startDrag(e, square) {
  const pieceEl = square.querySelector(".piece");
  if (!pieceEl) return;
  chess.load(currentNode.fen);
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

  const fromRect = square.getBoundingClientRect();
  dragState = { pieceEl, ghost, fromSquare: square, fromRect };
}

// onDragMove, onDragEnd — moved to assets/js/board-core.js

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
document.addEventListener("mousemove", onDragMove, { passive: true });
document.addEventListener("touchmove", onDragMove, { passive: true });
document.addEventListener("mouseup", onDragEnd);
document.addEventListener("touchend", onDragEnd);

// ── END DRAG AND DROP ────────────────────────────────────────────────────────

// renderMoveTree, renderNodeRecursive, renderVariationLine, findNodeById,
// addMoveTreeClickEvents, createEngineContinuation, addEngineLineClickEvents —
// moved to assets/js/board-core.js

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

// generatePGNFromNode — moved to assets/js/board-core.js

// export pgn

// Save handler lives in the "Save System" block at the end of this file.

// Review (Import PGN) handler lives in the "Review" block at the end of this file.

// new game

newGameBtn.addEventListener("click", () => {
  customPositionName = null;

  resetPlayerNames();

  chess.reset();

  root.children = [];

  root.engineLine = [];

  root.engineEval = null;

  root.fen = chess.fen();

  currentNode = root;

  latestEngineUCILine = [];

  evalScore.textContent = "0.0";

  bestMoveText.textContent = "--";

  engineDepth.textContent = "depth=0 | " + STOCKFISH_VERSION;

  updateEvalBar(0);

  boardAnnotations.clear();

  refreshUI();
});

// delete game

deleteGameBtn.addEventListener("click", async () => {
  const ok = await cheeseDialogs.showConfirm("", {
    title: "Delete current analysis?",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (!ok) return;

  customPositionName = null;

  resetPlayerNames();

  chess.reset();

  root.children = [];

  root.engineLine = [];

  root.engineEval = null;

  root.fen = chess.fen();

  currentNode = root;

  latestEngineUCILine = [];

  evalScore.textContent = "0.0";

  bestMoveText.textContent = "--";

  engineDepth.textContent = "depth=0 | " + STOCKFISH_VERSION;

  updateEvalBar(0);

  boardAnnotations.clear();

  refreshUI();
});

// showToast — moved to assets/js/board-core.js

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

// parseOpeningMoves, loadOpeningFromStorage — moved to assets/js/board-core.js

// initial
updateEvalBar(0);

refreshUI();

// Auto-load a selected opening, if one is waiting in localStorage.
loadOpeningFromStorage();


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

// readSavedAnalyses, writeSavedAnalyses, mainlineTip, resetAnalysisState,
// formatSavedDate, saveCurrentAnalysis \u2014 moved to assets/js/board-core.js

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

// ── External PGN handoff (Database, etc.) ────────────────────────────────────
// A game opened from another page is left in localStorage as raw PGN, then
// loaded here through the SAME importPGN pipeline that the Review modal uses.
(function loadImportedGameFromStorage() {
  let pgn = null;
  try {
    pgn = localStorage.getItem("cheeseImportPGN");
    if (pgn) localStorage.removeItem("cheeseImportPGN");
  } catch (e) {
    return;
  }
  if (pgn) importPGN(pgn);
})();