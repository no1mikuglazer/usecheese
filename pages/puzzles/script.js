/* Cheese — Puzzles page
   Tactics trainer. Puzzles come from the Cheese API (see assets/js/api-client.js);
   board rendering, drag-and-drop and highlight helpers are shared with Analysis
   and Training via assets/js/board-core.js.

   Puzzle data follows the Lichess convention: `fen` is the position BEFORE
   moves[0], and moves[0] is the opponent's move that creates the puzzle. It is
   played automatically. The solver then plays the odd-indexed moves, with the
   even-indexed ones being the opponent's forced replies. */

// ── Globals board-core.js reads ─────────────────────────────────────────────
// board-core.js operates on these names directly, so they must exist with the
// same shapes Analysis and Training give them.

const squares = document.querySelectorAll(".square");
const chess = new Chess();

// board-core.js reads `currentNode.fen` (for legality checks) and
// `currentNode.move` (for the last-move highlight). Puzzles are a single
// forced line with no branching, so a plain object stands in for Analysis's
// GameNode tree.
let currentNode = { fen: chess.fen(), move: null };

let selectedSquare = null;
let dragState = null;
let pendingPromotion = null;

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

// ── Piece asset preloading ──────────────────────────────────────────────────
// renderBoard() paints by creating <img> elements and assigning .src. On an
// uncached load the browser fetches each of the twelve piece PNGs separately,
// so they decode at different times and pieces visibly pop in one by one —
// while the board is already interactive. That is unfair on a streak: the
// solver can be looking at a half-drawn position.
//
// There are only twelve distinct piece images for the whole app, so fetch and
// decode all of them up front, then paint every square from that decoded
// cache. After this resolves, a full board render is a synchronous DOM
// operation with no network or decode work left to do.

const PIECE_COLORS = ["w", "b"];
const PIECE_TYPES = ["p", "r", "n", "b", "q", "k"];

const pieceImageCache = new Map();

function preloadPieceImages() {
  const jobs = [];

  for (const color of PIECE_COLORS) {
    for (const type of PIECE_TYPES) {
      const src = getPieceImage(color, type);
      const img = new Image();
      img.src = src;

      // decode() resolves once the bitmap is ready to paint, which is the
      // guarantee we actually need — `load` alone can still leave a decode to
      // happen on the first paint. Older browsers without decode() fall back
      // to the load event.
      const ready = img.decode
        ? img.decode()
        : new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });

      jobs.push(
        ready
          .then(() => pieceImageCache.set(src, img))
          // A single failed asset must never block the board forever; that
          // square just falls back to a plain <img src> below.
          .catch(() => {}),
      );
    }
  }

  return Promise.all(jobs);
}

const piecesReady = preloadPieceImages();

// ── Puzzle state ────────────────────────────────────────────────────────────

const PUZZLE_STATE = {
  LOADING: "loading",
  SOLVING: "solving",
  SOLVED: "solved",
  ERROR: "error",
};

let currentPuzzle = null;
let solutionMoves = [];
let solutionIndex = 0; // index of the move the solver must find next
let solverColor = "w";
let puzzleState = PUZZLE_STATE.LOADING;
let awaitingOpponent = false; // true while a scripted reply is being played
let usedHint = false;
let failedThisPuzzle = false;
let hintLevel = 0; // 0 = none, 1 = piece shown, 2 = full move shown
let boardFlipped = false;

// ── Move history (keyboard navigation) ──────────────────────────────────────
// positionHistory holds only positions the solver has actually reached this
// attempt — entries are appended exclusively from pushHistory(), called after
// the setup move, after each opponent reply, and after a verified-correct
// solver move. It is never pre-populated from solutionMoves, so there is
// nothing in it for Right Arrow to reveal ahead of legitimate play: the
// solution line the API returns can contain moves the solver hasn't earned
// yet, but this array only ever grows in step with what they've actually done.
let positionHistory = [];
let historyIndex = -1; // which position is currently displayed
let furthestIndex = -1; // highest index legitimately reached this attempt — the
// Right Arrow ceiling. Deliberately tracked separately from solutionMoves.length
// (or currentPuzzle.moves.length) so the boundary can never be derived from,
// or accidentally widened by, data the solver hasn't earned.

const session = { solved: 0, attempted: 0, streak: 0 };

// Timers are tracked so a new puzzle never gets interrupted by a reply
// scheduled for the previous one.
let pendingTimers = [];

function scheduleStep(fn, delay) {
  const id = setTimeout(fn, delay);
  pendingTimers.push(id);
  return id;
}

function cancelPendingSteps() {
  pendingTimers.forEach(clearTimeout);
  pendingTimers = [];
}

// Delay before the opponent's scripted reply, long enough to read the position.
const OPPONENT_REPLY_DELAY = 480;
const SETUP_MOVE_DELAY = 420;

// ── DOM references ──────────────────────────────────────────────────────────

const boardArea = document.getElementById("boardArea");
const statusEl = document.getElementById("pzStatus");
const statusTitleEl = document.getElementById("pzStatusTitle");
const statusSubEl = document.getElementById("pzStatusSub");
const ratingEl = document.getElementById("pzRating");
const themesEl = document.getElementById("pzThemes");
const totalCountEl = document.getElementById("pzTotalCount");
const minRatingInput = document.getElementById("pzMinRating");
const maxRatingInput = document.getElementById("pzMaxRating");
const presetsEl = document.getElementById("pzPresets");
const nextBtn = document.getElementById("pzNextBtn");
const hintBtn = document.getElementById("pzHintBtn");
const retryBtn = document.getElementById("pzRetryBtn");
const solverNameEl = document.getElementById("pzSolverName");
const opponentNameEl = document.getElementById("pzOpponentName");
const solverPfpEl = document.getElementById("pzSolverPfp");
const opponentPfpEl = document.getElementById("pzOpponentPfp");
const solvedCountEl = document.getElementById("pzSolvedCount");
const attemptCountEl = document.getElementById("pzAttemptCount");
const streakCountEl = document.getElementById("pzStreakCount");

// ── Rendering ───────────────────────────────────────────────────────────────

// Mirrors Training's renderBoard: repaint from the given FEN, re-apply the
// last-move highlight, and glide the moved piece unless the caller already
// showed the movement (drag) or the board is flipped (the clones would render
// mirrored).
//
// `node` defaults to the live position (currentNode) — every existing call
// site keeps behaving exactly as before. History navigation is the only
// caller that ever passes a different node, to paint a past position without
// touching currentNode (which stays the source of truth for legality checks,
// hints, and everywhere else that must always reflect real progress rather
// than whatever the solver is currently looking at).
function renderBoard(suppressGlide, node = currentNode) {
  const boardEl = document.querySelector(".board");
  const before = snapshotBoard();

  // Drop animation clones still in flight from an earlier render. Without
  // this, switching puzzles or navigating history mid-animation leaves
  // orphaned pieces layered over the new position.
  boardEl
    .querySelectorAll(".anim-fly, .anim-capture, .anim-trail")
    .forEach((el) => el.remove());

  chess.load(node.fen);
  clearBoard();

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  chess.board().forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (!piece) return;
      const square = document.getElementById(files[colIndex] + (8 - rowIndex));
      const src = getPieceImage(piece.color, piece.type);

      // Cloning the preloaded element reuses its already-decoded bitmap, so
      // the whole position paints in one frame instead of each piece
      // appearing as its own request finishes.
      const cached = pieceImageCache.get(src);
      const img = cached ? cached.cloneNode(false) : document.createElement("img");
      if (!cached) img.src = src;
      img.className = "piece";

      square.appendChild(img);
    });
  });

  applyLastMoveHighlightFor(node.move);
  if (chess.in_check()) {
    flashCheck(findKingSquare(chess, chess.turn()));
  }

  if (!node.move) return;

  const move = node.move;
  const fromData = before[move.from];
  if (!fromData) return;

  const toSquareEl = document.getElementById(move.to);
  if (!toSquareEl) return;

  const boardRect = boardEl.getBoundingClientRect();
  const toRect = toSquareEl.getBoundingClientRect();

  // Board-relative start/end coordinates of the move. Measured once and
  // shared by the trail and the gliding piece so both follow one path.
  const sl = fromData.rect.left - boardRect.left;
  const st = fromData.rect.top - boardRect.top;
  const el = toRect.left - boardRect.left;
  const et = toRect.top - boardRect.top;

  // Drawn for every move, deliberately ahead of the glide's own conditions
  // below. It still reads correctly in the two cases the glide skips: a
  // dragged piece (the user moved it themselves, so there is no glide to
  // accompany — the streak shows the path it took), and a flipped board (the
  // piece clone is skipped there because it would render upside-down, but a
  // symmetric gradient has no orientation and simply rotates with the board).
  drawMotionTrail(boardEl, boardRect, fromData.rect, toRect, boardFlipped);

  // Only a drag skips the glide now — there the player moved the piece
  // themselves, so re-animating it would replay a movement they just made.
  // A flipped board no longer skips it: the clone is placed and counter-
  // rotated for that orientation below, rather than the piece teleporting.
  if (suppressGlide) return;

  if (before[move.to]) {
    const capRect = before[move.to].rect;
    const capPlace = placeBoardClone(
      boardRect,
      boardFlipped,
      capRect.left - boardRect.left,
      capRect.top - boardRect.top,
      capRect.width,
      capRect.height,
    );

    const cap = document.createElement("img");
    cap.src = before[move.to].src;
    cap.className = "piece anim-capture";
    cap.style.cssText = `position:absolute;pointer-events:none;z-index:10;
      width:${capRect.width}px;height:${capRect.height}px;
      left:${capPlace.left}px;top:${capPlace.top}px;
      ${capPlace.counterRotate ? `transform:${capPlace.counterRotate};` : ""}`;
    boardEl.appendChild(cap);
    requestAnimationFrame(() => {
      cap.style.transition = "opacity 150ms ease";
      cap.style.opacity = "0";
      cap.addEventListener("transitionend", () => cap.remove(), { once: true });
    });
  }

  const toEl = toSquareEl.querySelector(".piece");
  if (toEl) toEl.style.opacity = "0";

  const flyPlace = placeBoardClone(
    boardRect,
    boardFlipped,
    sl,
    st,
    fromData.rect.width,
    fromData.rect.height,
  );

  // A translation in the board's local space appears reversed on screen once
  // the board's own 180deg rotation is applied, so negate it when flipped.
  const glideX = boardFlipped ? -(el - sl) : el - sl;
  const glideY = boardFlipped ? -(et - st) : et - st;

  const fly = document.createElement("img");
  fly.src = fromData.src;
  fly.className = "piece anim-fly";
  fly.style.cssText = `position:absolute;pointer-events:none;z-index:20;
    width:${fromData.rect.width}px;height:${fromData.rect.height}px;
    left:${flyPlace.left}px;top:${flyPlace.top}px;will-change:transform;
    transition:transform 200ms cubic-bezier(0.25,0.1,0.25,1);
    transform:translate(0,0)${flyPlace.counterRotate};`;
  boardEl.appendChild(fly);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fly.style.transform =
        `translate(${glideX}px,${glideY}px)${flyPlace.counterRotate}`;
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

// Animation clones (the gliding piece, the fading captured piece) are
// absolutely-positioned children of .board, so their left/top are read in the
// board's own coordinate space. On a flipped board that space is itself
// rotated 180deg, which breaks a clone in two separate ways: positioned from
// screen measurements it lands point-reflected across the board, and its
// inline transform overrides the CSS rule that keeps pieces upright, so the
// image renders upside-down.
//
// This converts a screen-space box into the board's local space and reports
// the counter-rotation needed to cancel the board's own. `counterRotate` is
// appended to the clone's transform, so it must come after any translate.
function placeBoardClone(boardRect, flipped, screenLeft, screenTop, width, height) {
  if (!flipped) {
    return { left: screenLeft, top: screenTop, counterRotate: "" };
  }
  return {
    left: boardRect.width - screenLeft - width,
    top: boardRect.height - screenTop - height,
    counterRotate: " rotate(180deg)",
  };
}

// board-core.js's applyLastMoveHighlight() reads the global currentNode
// directly, which would highlight the LIVE last move even while a past
// position is being displayed via history navigation. This local version
// takes the move explicitly instead, so renderBoard's `node` argument stays
// the single source of truth for what's on screen. (board-core.js's version
// is left untouched — Analysis and Training both rely on its current,
// global-reading signature.)
function applyLastMoveHighlightFor(move) {
  clearBoardHighlights();
  if (!move) return;
  const fromSq = document.getElementById(move.from);
  const toSq = document.getElementById(move.to);
  if (fromSq) fromSq.classList.add("last-move");
  if (toSq) toSq.classList.add("last-move");
}

// Puzzle-specific square feedback. board-core's clearBoardHighlights only
// knows about last-move/check-flash, so these classes are managed here.
function clearPuzzleMarks() {
  squares.forEach((sq) =>
    sq.classList.remove("wrong-move", "right-move", "hint-square"),
  );
}

function flashSquares(squareIds, className) {
  squareIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth; // force reflow so a repeat flash re-triggers
    el.classList.add(className);
    el.addEventListener(
      "animationend",
      () => el.classList.remove(className),
      { once: true },
    );
  });
}

function applyOrientation() {
  boardArea.classList.toggle("flipped", boardFlipped);
}

// ── Status / panel updates ──────────────────────────────────────────────────

const STATUS_VARIANTS = [
  "pz-status-idle",
  "pz-status-solving",
  "pz-status-correct",
  "pz-status-wrong",
  "pz-status-solved",
  "pz-status-clean",
];

function setStatus(variant, title, sub) {
  STATUS_VARIANTS.forEach((v) => statusEl.classList.remove(v));
  statusEl.classList.add(variant);
  statusTitleEl.textContent = title;
  statusSubEl.textContent = sub;
}

function updateSessionDisplay() {
  solvedCountEl.textContent = String(session.solved);
  attemptCountEl.textContent = String(session.attempted);
  streakCountEl.textContent = String(session.streak);
}

// Themes name the tactic, so they stay hidden until the puzzle is over.
function renderThemes(reveal) {
  themesEl.innerHTML = "";
  themesEl.classList.toggle("pz-themes-visible", Boolean(reveal));
  if (!reveal || !currentPuzzle || !currentPuzzle.themes) return;

  currentPuzzle.themes.forEach((theme) => {
    const chip = document.createElement("span");
    chip.className = "pz-theme";
    // API themes are camelCase ("hangingPiece") — space them out for display.
    chip.textContent = theme
      .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
    themesEl.appendChild(chip);
  });
}

function updatePlayerBars() {
  const solverIsWhite = solverColor === "w";
  solverNameEl.textContent = solverIsWhite ? "White" : "Black";
  opponentNameEl.textContent = solverIsWhite ? "Black" : "White";
  solverPfpEl.className = "player-pfp " + (solverIsWhite ? "white-pfp" : "black-pfp");
  opponentPfpEl.className = "player-pfp " + (solverIsWhite ? "black-pfp" : "white-pfp");
}

function setControlsBusy(busy) {
  nextBtn.disabled = busy;
  hintBtn.disabled = busy || puzzleState !== PUZZLE_STATE.SOLVING;
  retryBtn.disabled = busy || !currentPuzzle;
}

// ── Move history / keyboard navigation ──────────────────────────────────────

// Snapshot the live position into history. Called only after currentNode has
// just legitimately advanced (the setup move, an opponent reply, or a
// verified-correct solver move) — never speculatively, and never for a
// position the solver merely navigated to. historyIndex is pulled forward to
// match: new live progress always takes over the display, mirroring how
// Training's move list jumps to a new move as soon as one is played.
function pushHistory() {
  positionHistory.push({ fen: currentNode.fen, move: currentNode.move });
  furthestIndex = positionHistory.length - 1;
  historyIndex = furthestIndex;
}

function resetHistory() {
  positionHistory = [];
  historyIndex = -1;
  furthestIndex = -1;
}

function isViewingLivePosition() {
  return historyIndex === furthestIndex;
}

// Paints a past position without touching currentNode, so nothing that
// depends on currentNode as "the real game state" (playMove, the click/drag
// handlers, showHint) is affected by merely looking at history.
function showHistoryPosition(index) {
  const node = positionHistory[index];
  if (!node) return;

  historyIndex = index;
  clearValidMoves();
  if (selectedSquare) {
    selectedSquare.style.outline = "none";
    selectedSquare = null;
  }
  renderBoard(true, node);
}

// delta: -1 for Left Arrow, +1 for Right Arrow. The furthestIndex bound is
// the anti-cheat check — Right Arrow can only ever reach positions already
// pushed by legitimate play, never solutionMoves ahead of them.
function navigateHistory(delta) {
  if (positionHistory.length === 0) return;
  const target = historyIndex + delta;
  if (target < 0 || target > furthestIndex) return;
  showHistoryPosition(target);
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

  // Don't hijack arrow keys while the user is typing (the rating-range
  // inputs are the only text fields on this page, but this stays general).
  const active = document.activeElement;
  const tag = active && active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || (active && active.isContentEditable)) {
    return;
  }

  if (!currentPuzzle || positionHistory.length === 0) return;

  e.preventDefault();
  navigateHistory(e.key === "ArrowLeft" ? -1 : 1);
});

// ── Move application ────────────────────────────────────────────────────────

// Convert a chess.js move object to the UCI form the API uses.
function moveToUci(move) {
  return move.from + move.to + (move.promotion || "");
}

// Play one move of the scripted solution (the setup move, or an opponent
// reply). These are trusted, so no validation branch is needed beyond the
// chess.js result.
function applyScriptedMove(uci) {
  chess.load(currentNode.fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || "q",
  });

  if (!move) return false;

  const gaveCheck = chess.in_check();
  currentNode = { fen: chess.fen(), move };
  pushHistory();
  renderBoard();
  playSound(moveSoundName(move, gaveCheck));
  return true;
}

function playOpponentReply() {
  const uci = solutionMoves[solutionIndex];
  if (!uci) {
    awaitingOpponent = false;
    return;
  }

  applyScriptedMove(uci);
  solutionIndex += 1;
  awaitingOpponent = false;

  setStatus(
    "pz-status-solving",
    "Your turn",
    `Find the best move for ${solverColor === "w" ? "White" : "Black"}`,
  );
  setControlsBusy(false);
}

/* The solver's move. board-core.js's drag handler and the square-click handler
   below both funnel into this, matching the signature Analysis and Training
   use so the shared drag code can call it unchanged. */
function playMove(moveInput, suppressGlide) {
  if (puzzleState !== PUZZLE_STATE.SOLVING || awaitingOpponent) return false;

  chess.load(currentNode.fen);
  const move = chess.move(moveInput);

  if (!move) {
    // Illegal by the rules of chess — same feedback as Analysis/Training.
    flashKingIfInCheck(currentNode.fen);
    return false;
  }

  const played = moveToUci(move);
  const expected = solutionMoves[solutionIndex];
  const isMate = chess.in_checkmate();

  // A different move that still delivers mate ends the puzzle just as well as
  // the recorded one, so accept it rather than calling it wrong.
  const correct = played === expected || isMate;

  if (!correct) {
    // Reject: the board is repainted from the unchanged position, so the piece
    // returns to where it started.
    renderBoard(true);
    clearPuzzleMarks();
    flashSquares([move.from, move.to], "wrong-move");

    if (!failedThisPuzzle) {
      failedThisPuzzle = true;
      session.streak = 0;
      updateSessionDisplay();
    }

    setStatus("pz-status-wrong", "Not quite", "That move loses the idea — try again");
    return false;
  }

  const gaveCheck = chess.in_check();
  currentNode = { fen: chess.fen(), move };
  solutionIndex += 1;
  pushHistory();

  renderBoard(suppressGlide);
  playSound(moveSoundName(move, gaveCheck));
  clearPuzzleMarks();
  flashSquares([move.from, move.to], "right-move");
  hintLevel = 0;

  const solutionExhausted = solutionIndex >= solutionMoves.length;

  if (isMate || solutionExhausted) {
    onPuzzleSolved();
    return true;
  }

  // More to go: play the opponent's forced reply, then hand back over.
  awaitingOpponent = true;
  setStatus("pz-status-correct", "Correct", "Keep going…");
  setControlsBusy(true);
  scheduleStep(playOpponentReply, OPPONENT_REPLY_DELAY);
  return true;
}

function onPuzzleSolved() {
  puzzleState = PUZZLE_STATE.SOLVED;
  awaitingOpponent = false;

  session.attempted += 1;
  if (!failedThisPuzzle && !usedHint) {
    session.solved += 1;
    session.streak += 1;
  } else if (!failedThisPuzzle && usedHint) {
    // Solved, but with help — counts as solved, does not extend a clean streak.
    session.solved += 1;
    session.streak = 0;
  } else {
    session.streak = 0;
  }
  updateSessionDisplay();

  // Green is reserved for a fully correct solve with no help. A wrong move or
  // a hint still finishes the line, but stays yellow rather than claiming a
  // clean solve — and a puzzle finished after a wrong move doesn't count
  // towards Solved, so its headline must not claim it did either.
  if (failedThisPuzzle) {
    setStatus("pz-status-solved", "Solution complete", "A wrong move broke the solve");
  } else if (usedHint) {
    setStatus("pz-status-solved", "Puzzle solved", "Solved with a hint");
  } else {
    setStatus("pz-status-clean", "Puzzle solved", "Clean solve — nice");
  }

  renderThemes(true);
  setControlsBusy(false); // also disables Hint, since the state is no longer SOLVING
}

// ── Loading puzzles ─────────────────────────────────────────────────────────

function readRatingRange() {
  let min = parseInt(minRatingInput.value, 10);
  let max = parseInt(maxRatingInput.value, 10);

  if (!Number.isFinite(min)) min = 400;
  if (!Number.isFinite(max)) max = 2800;

  min = Math.min(Math.max(min, 0), 3500);
  max = Math.min(Math.max(max, 0), 3500);
  if (min > max) [min, max] = [max, min];

  minRatingInput.value = String(min);
  maxRatingInput.value = String(max);
  return { min, max };
}

function setupPuzzle(puzzle) {
  cancelPendingSteps();
  clearPuzzleMarks();
  clearValidMoves();
  clearBoardHighlights();

  if (selectedSquare) {
    selectedSquare.style.outline = "none";
    selectedSquare = null;
  }

  currentPuzzle = puzzle;
  solutionMoves = puzzle.moves;
  solutionIndex = 0;
  usedHint = false;
  failedThisPuzzle = false;
  hintLevel = 0;
  awaitingOpponent = true; // the setup move is still to come
  resetHistory();

  chess.load(puzzle.fen);

  // The FEN's side to move plays the setup move, so the solver is the other
  // side. Orientation is set before the first paint to avoid a visible flip.
  solverColor = chess.turn() === "w" ? "b" : "w";
  boardFlipped = solverColor === "b";
  applyOrientation();
  updatePlayerBars();

  currentNode = { fen: puzzle.fen, move: null };
  // Record this as history[0], the true starting position — otherwise Left
  // Arrow could never rewind far enough to show the square the opponent's
  // setup move actually came from, only the highlight on where it landed.
  pushHistory();
  renderBoard(true);

  ratingEl.textContent = String(puzzle.rating);
  renderThemes(false);

  puzzleState = PUZZLE_STATE.SOLVING;
  setStatus("pz-status-idle", "Watch the move", "Your opponent is playing…");
  setControlsBusy(true);

  scheduleStep(() => {
    applyScriptedMove(solutionMoves[0]);
    solutionIndex = 1;
    awaitingOpponent = false;
    setStatus(
      "pz-status-solving",
      "Your turn",
      `Find the best move for ${solverColor === "w" ? "White" : "Black"}`,
    );
    setControlsBusy(false);
  }, SETUP_MOVE_DELAY);
}

// Identifies the most recent load. Responses are only applied if they still
// belong to it, so a slower earlier request can never overwrite a newer
// puzzle — which previously left the board showing a puzzle outside the
// rating range on screen. The difficulty presets make this reachable: they
// call loadNewPuzzle() directly and, unlike Next/Hint/Retry, are not disabled
// while a load is in flight.
let activeLoadToken = 0;

async function loadNewPuzzle() {
  const token = ++activeLoadToken;

  cancelPendingSteps();
  puzzleState = PUZZLE_STATE.LOADING;
  awaitingOpponent = false;
  setControlsBusy(true);
  setStatus("pz-status-idle", "Loading…", "Fetching a puzzle");

  const { min, max } = readRatingRange();

  try {
    const puzzle = await fetchRandomPuzzle(min, max);
    if (token !== activeLoadToken) return; // superseded while fetching

    // Never hand over a board whose pieces haven't finished decoding. After
    // the first load this is already settled and adds nothing.
    await piecesReady;
    if (token !== activeLoadToken) return; // superseded while assets loaded

    setupPuzzle(puzzle);
  } catch (err) {
    if (token !== activeLoadToken) return; // a newer load owns the UI now

    puzzleState = PUZZLE_STATE.ERROR;
    currentPuzzle = null;
    setControlsBusy(false);
    retryBtn.disabled = true;
    hintBtn.disabled = true;

    if (err.code === "no_puzzles_in_range") {
      setStatus("pz-status-wrong", "No puzzles found", "Try a wider rating range");
    } else if (err.code === "network_error") {
      setStatus("pz-status-wrong", "Server unreachable", "Is the Cheese API running?");
    } else {
      setStatus("pz-status-wrong", "Could not load a puzzle", "Please try again");
    }
  }
}

function retryPuzzle() {
  if (!currentPuzzle) return;
  // Claim the load token so any request still in flight is discarded rather
  // than replacing the puzzle the solver just chose to retry.
  activeLoadToken += 1;
  cancelPendingSteps();
  setupPuzzle(currentPuzzle);
}

// ── Hint ────────────────────────────────────────────────────────────────────

/* Reveals the recorded solution rather than asking Stockfish. On a
   non-forced continuation the engine's preference can differ from the puzzle's
   line, which would point the solver at a move the puzzle then rejects.
   First press names the piece; second press shows the destination. */
function showHint() {
  if (puzzleState !== PUZZLE_STATE.SOLVING || awaitingOpponent) return;

  // A hint describes the live position's next move; showing it while a past
  // position is on screen would highlight squares that don't match what's
  // displayed.
  if (!isViewingLivePosition()) {
    showToast("Go to the current position to continue");
    return;
  }

  const uci = solutionMoves[solutionIndex];
  if (!uci) return;

  usedHint = true;
  hintLevel = Math.min(hintLevel + 1, 2);
  clearPuzzleMarks();

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);

  const fromEl = document.getElementById(from);
  if (fromEl) fromEl.classList.add("hint-square");

  if (hintLevel >= 2) {
    const toEl = document.getElementById(to);
    if (toEl) toEl.classList.add("hint-square");
    setStatus("pz-status-solving", "Hint", `Play ${from} → ${to}`);
  } else {
    chess.load(currentNode.fen);
    const piece = chess.get(from);
    const names = {
      p: "pawn",
      n: "knight",
      b: "bishop",
      r: "rook",
      q: "queen",
      k: "king",
    };
    const label = piece ? names[piece.type] : "piece";
    setStatus("pz-status-solving", "Hint", `Move the ${label} on ${from}`);
  }
}

// ── Interaction: click to move ──────────────────────────────────────────────

function canInteract() {
  return puzzleState === PUZZLE_STATE.SOLVING && !awaitingOpponent;
}

squares.forEach((square) => {
  square.addEventListener("click", () => {
    if (!canInteract()) return;

    // Browsing history: the position on screen isn't the live one, so a move
    // played here would be evaluated against a stale board. Same idiom as
    // Training's "Go to the latest move to continue".
    if (!isViewingLivePosition()) {
      showToast("Go to the current position to continue");
      return;
    }

    chess.load(currentNode.fen);
    if (chess.turn() !== solverColor) return;

    if (!selectedSquare) {
      const piece = square.querySelector(".piece");
      if (!piece) return;

      const pieceColor = piece.src.includes("/w_") ? "w" : "b";
      if (pieceColor !== chess.turn()) return;

      selectedSquare = square;
      square.style.outline = "3px solid rgba(255,255,255,0.4)";
      showValidMoves(square.id);
      return;
    }

    // Clicking the selected square again deselects it.
    if (square === selectedSquare) {
      clearValidMoves();
      selectedSquare.style.outline = "none";
      selectedSquare = null;
      return;
    }

    // Clicking another of your own pieces re-selects instead of moving.
    const targetPiece = square.querySelector(".piece");
    if (targetPiece) {
      const targetColor = targetPiece.src.includes("/w_") ? "w" : "b";
      if (targetColor === chess.turn()) {
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

    if (isPromotionMove(from, to) && isLegalMove(from, to)) {
      showPromotionPicker(from, to);
    } else {
      playMove({ from, to });
    }
  });
});

// ── Interaction: promotion picker ───────────────────────────────────────────
// Same construction as Training's: positioned in viewport coordinates and
// attached to <body>, so it is never rotated along with a flipped board.

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
      closePromotionPicker();
      const promo = pendingPromotion;
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
  setTimeout(() => document.addEventListener("click", outsidePromotionClick), 0);
}

// ── Interaction: drag and drop ──────────────────────────────────────────────
// onDragMove / onDragEnd live in board-core.js and call back into
// getDragTargetSquare, isLegalMove, isPromotionMove and playMove.

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

function startDrag(e, square) {
  const pieceEl = square.querySelector(".piece");
  if (!pieceEl) return;
  if (!canInteract()) return;

  if (!isViewingLivePosition()) {
    showToast("Go to the current position to continue");
    return;
  }

  chess.load(currentNode.fen);
  if (chess.turn() !== solverColor) return;

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

const boardElForDrag = document.querySelector(".board");

boardElForDrag.addEventListener("mousedown", (e) => {
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

// ── Controls ────────────────────────────────────────────────────────────────

nextBtn.addEventListener("click", loadNewPuzzle);
retryBtn.addEventListener("click", retryPuzzle);
hintBtn.addEventListener("click", showHint);

presetsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".pz-preset");
  if (!btn) return;

  presetsEl
    .querySelectorAll(".pz-preset")
    .forEach((b) => b.classList.remove("pz-preset-active"));
  btn.classList.add("pz-preset-active");

  minRatingInput.value = btn.dataset.min;
  maxRatingInput.value = btn.dataset.max;
  loadNewPuzzle();
});

// Typing a custom range clears the preset selection — the buttons no longer
// describe what is in the inputs.
[minRatingInput, maxRatingInput].forEach((input) => {
  input.addEventListener("change", () => {
    readRatingRange();
    presetsEl
      .querySelectorAll(".pz-preset")
      .forEach((b) => b.classList.remove("pz-preset-active"));
  });
});

// ── Boot ────────────────────────────────────────────────────────────────────

updateSessionDisplay();

fetchPuzzleStats()
  .then((stats) => {
    totalCountEl.textContent = `${stats.count.toLocaleString()} puzzles`;
  })
  .catch(() => {
    totalCountEl.textContent = "";
  });

loadNewPuzzle();
