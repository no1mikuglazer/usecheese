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

// undoMoveBtn, redoMoveBtn, prevMoveBtn, nextMoveBtn — looked up and wired by
// assets/js/board-core.js's attachMoveNavControls()

// GameNode — moved to assets/js/board-core.js (shared with Training)

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

  // -10..+10 mapped onto 0..100% of the bar's height.
  const percent = ((evalNum + 10) / 20) * 100;

  evalFill.style.height = `${percent}%`;
  evalText.textContent =
    evalNum > 0 ? `+${evalNum.toFixed(1)}` : evalNum.toFixed(1);
}

// render board

// snapshotBoard — moved to assets/js/board-core.js

// renderBoard — moved to assets/js/board-core.js

// clearBoard, getPieceImage, HIGHLIGHT_FILES, clearBoardHighlights,
// applyLastMoveHighlight, findKingSquare, flashCheck, flashKingIfInCheck —
// moved to assets/js/board-core.js

// MOVE_SOUND_FILES, moveSounds, playSound, moveSoundName — moved to
// assets/js/board-core.js

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


// showPromotionPicker — moved to assets/js/board-core.js

// outsidePromotionClick, closePromotionPicker — moved to assets/js/board-core.js

// ── DRAG AND DROP ────────────────────────────────────────────────────────────

// dragState, pendingPromotion — declared in assets/js/board-core.js

// getDragTargetSquare, startDrag and the board pointer listeners — moved to
// assets/js/board-core.js. Analysis places no extra condition on dragging, so
// it defines no canStartDrag() hook and every legal drag is allowed.

// onDragMove, onDragEnd — moved to assets/js/board-core.js

attachBoardDragListeners();

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

// Undo/redo/first/last buttons + arrow-key navigation — wired by
// assets/js/board-core.js's attachMoveNavControls() (shared with Training)

attachMoveNavControls();

// generatePGNFromNode — moved to assets/js/board-core.js

// export pgn

// Save handler lives in the "Save System" block at the end of this file.

// Review (Import PGN) handler lives in the "Review" block at the end of this file.

// new game

newGameBtn.addEventListener("click", async () => {
  // New discards the whole move tree, exactly as Delete beside it does, so it
  // asks first for the same reason — and Training's New already does.
  //
  // Skipped when there is nothing to lose: an untouched board with no loaded
  // position. mainlineTip() === root is the same "is there any analysis here"
  // test saveCurrentAnalysis() uses to refuse an empty save, reused rather
  // than inventing a second definition of empty. customPositionName is also
  // checked because a named position (a loaded save, an imported PGN, an
  // opening) is worth confirming even when it sits at the starting position.
  const hasWork = mainlineTip() !== root || customPositionName;
  if (hasWork) {
    const ok = await cheeseDialogs.showConfirm(
      "The current moves will be discarded. Save it first if you want to keep it.",
      {
        title: "Start a new analysis?",
        confirmLabel: "Start New",
        cancelLabel: "Cancel",
        danger: true,
      },
    );
    if (!ok) return;
  }

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

// Rename-analysis handler — wired by assets/js/board-core.js's
// attachRenameHandler() (shared with Training)

attachRenameHandler();

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

// SAVED_ANALYSES_KEY — moved to assets/js/board-core.js

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
  // writeSavedAnalyses() toasts its own failure. Bailing out on one matters:
  // re-rendering from storage that still holds the entry would show the card
  // vanish and come back, or worse look deleted until the next reload.
  if (!writeSavedAnalyses(list, "Could not delete — storage unavailable")) return;
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
  savedGamesListEl.addEventListener("click", async (e) => {
    const card = e.target.closest(".ap-game-card");
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest(".ap-game-delete")) {
      e.stopPropagation();

      // A saved analysis is the only thing on this page that outlives the
      // session, and there is no undo — so this one asks by name, rather than
      // discarding a study on a single mis-click of a small icon.
      const doomed = readSavedAnalyses().find((x) => x.id === id);
      const ok = await cheeseDialogs.showConfirm(
        "This saved analysis will be permanently deleted.",
        {
          title: 'Delete "' + ((doomed && doomed.name) || "Untitled") + '"?',
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          danger: true,
        },
      );
      if (!ok) return;

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