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

// Right-click circles/arrows (assets/js/board-annotations.js). Puzzles flips
// its board depending on which side is solving — the module needs no
// orientation info regardless; see that file's header for why.
const boardAnnotations = attachBoardAnnotations(document.querySelector(".board"));

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

// ── Rating (signed-in only) ──────────────────────────────────────────────
// isSignedIn tracks the current confirmed auth state (corrected once
// window.cheeseClerkReady resolves — see the Boot section).
let isSignedIn = false;
// A puzzle id is added here the first time it finishes scoring this session,
// so hitting Retry on a puzzle whose answer you've already seen (via a wrong
// move or a hint) can't be replayed for repeat clean-solve reward.
const scoredPuzzleIds = new Set();

// ── Anonymous puzzle gate ────────────────────────────────────────────────
// Signed-out visitors get ANON_PUZZLE_LIMIT puzzles, then a signup nudge
// instead of a new one — a soft, client-side counter, not access control.
// It is trivially bypassed by clearing localStorage or opening a private
// window; that's an accepted limitation (see the roadmap), not a bug.
// Persisted in localStorage (not sessionStorage) so it survives a reload —
// the whole point is that reloading isn't a free reset, even though other,
// less casual ways around it exist.
const ANON_PUZZLE_LIMIT = 5;
const ANON_PUZZLE_COUNT_KEY = "cheeseAnonPuzzleCount";

function getAnonPuzzleCount() {
  const raw = localStorage.getItem(ANON_PUZZLE_COUNT_KEY);
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function incrementAnonPuzzleCount() {
  try {
    localStorage.setItem(ANON_PUZZLE_COUNT_KEY, String(getAnonPuzzleCount() + 1));
  } catch (e) {
    // Private mode / quota exceeded — the count just won't persist, same
    // fallback posture as clerk-client.js's own writeAuthHint().
  }
}

// cheeseDialogs is defined by assets/js/cheese-dialogs.js, already loaded
// by Analysis/Training for the same blocking-dialog needs — reused as-is
// rather than building new modal markup for this one prompt.
function showSignupGate() {
  cheeseDialogs
    .showConfirm(
      "You've used your 5 free puzzles. Sign up to keep training — it's free.",
      {
        title: "That's your free puzzles for now",
        confirmLabel: "Sign Up",
        cancelLabel: "Maybe Later",
      },
    )
    .then((goSignUp) => {
      if (goSignUp) window.location.href = "../signup/index.html";
    });
}

// A separate, one-time flag from the count itself — deliberately not reusing
// or overloading ANON_PUZZLE_COUNT_KEY, so "have they been told about the
// limit" and "how many have they used" stay two independent, unambiguous
// pieces of state rather than one doing double duty.
const ANON_INTRO_SEEN_KEY = "cheeseAnonIntroSeen";

function markAnonIntroSeen() {
  try {
    localStorage.setItem(ANON_INTRO_SEEN_KEY, "1");
  } catch (e) {
    // Can't persist it — better to risk not showing it again than to show it
    // on every single load for someone in private mode.
  }
}

// Friendly, proactive heads-up — distinct from showSignupGate(), which is
// reactive (shown only once the limit is actually hit). Shown at most once
// ever per browser, and only to a visitor who still has puzzles left: if
// they're already at the limit, showSignupGate() already covers informing
// them, and stacking this on top of that would be redundant. Called only
// once Clerk has confirmed signed-out (see the Boot section) — never on the
// earlier optimistic guess, so a real signed-in user can never see it during
// the brief window before that confirmation arrives.
function maybeShowAnonIntro() {
  let alreadySeen;
  try {
    alreadySeen = !!localStorage.getItem(ANON_INTRO_SEEN_KEY);
  } catch (e) {
    return; // can't read storage — skip rather than risk showing it every load
  }
  if (alreadySeen) return;

  markAnonIntroSeen();
  if (getAnonPuzzleCount() >= ANON_PUZZLE_LIMIT) return;

  cheeseDialogs
    .showConfirm(
      "For now, you can solve 5 puzzles for free without an account. Sign up any time to unlock the full puzzle experience.",
      {
        title: "Enjoying the puzzles? \u{1F9C0}",
        confirmLabel: "Sign Up",
        cancelLabel: "Got it",
      },
    )
    .then((goSignUp) => {
      if (goSignUp) window.location.href = "../signup/index.html";
    });
}

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
const headerStatEl = document.getElementById("pzHeaderStat");
const ratingPopupEl = document.getElementById("pzRatingPopup");
const offlineRetryBtn = document.getElementById("pzOfflineRetryBtn");

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
    // The transition is declared up front and the value changed two frames
    // later. Setting both together lets the browser collapse them into one
    // style resolution, in which case no transition runs — and the element,
    // whose removal was hooked to transitionend, then lingers invisibly at
    // opacity 0 and inflates the board's piece count.
    cap.style.cssText = `position:absolute;pointer-events:none;z-index:10;
      width:${capRect.width}px;height:${capRect.height}px;
      left:${capPlace.left}px;top:${capPlace.top}px;
      transition:opacity 150ms ease;opacity:1;
      ${capPlace.counterRotate ? `transform:${capPlace.counterRotate};` : ""}`;
    boardEl.appendChild(cap);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cap.style.opacity = "0";
      });
    });

    // Removal is scheduled rather than left to transitionend alone, so a
    // transition that never fires cannot strand the element.
    scheduleStep(() => cap.remove(), 400);
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

  // The destination piece is hidden while the clone flies over it, so this
  // must run even if the transition never fires — otherwise that piece would
  // stay invisible until the next render. Scheduled as well as hooked to
  // transitionend, and written to be safe to run twice.
  const finishGlide = () => {
    fly.remove();
    if (toEl) toEl.style.opacity = "1";
  };

  fly.addEventListener("transitionend", finishGlide, { once: true });
  scheduleStep(finishGlide, 450);
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

// ── Header stat display ──────────────────────────────────────────────────

// Signed-out (or not yet confirmed): how many of the free puzzles are left,
// derived straight from the same counter loadNewPuzzle() already maintains —
// no separate fetch, no separate count kept anywhere else. Replaces the
// header's old "N puzzles" library-size text, which wasn't actionable
// information for exactly the visitor this now serves.
function updateAnonRemainingDisplay() {
  headerStatEl.classList.remove("pz-header-stat-rating");
  const remaining = Math.max(0, ANON_PUZZLE_LIMIT - getAnonPuzzleCount());
  totalCountEl.textContent = `${remaining} puzzle${remaining === 1 ? "" : "s"} remaining`;
}

// Signed-in, confirmed: the user's own persisted rating replaces the puzzle
// count, shown directly with no label.
function showRatingMode(stats) {
  headerStatEl.classList.add("pz-header-stat-rating");
  totalCountEl.textContent = String(stats.rating);
}

// Confirmed signed-in, but fetching their rating failed (network blip, API
// hiccup) — NOT the same situation as being signed-out, so this must never
// fall back to updateAnonRemainingDisplay(): a real signed-in user briefly
// seeing "0 puzzles remaining" would be actively misleading, not just blank.
function showBlankHeaderMode() {
  headerStatEl.classList.remove("pz-header-stat-rating");
  totalCountEl.textContent = "";
}

// Ticks the header number from its last value to the new one over ~600ms
// rather than snapping, so a solve reads as a real change rather than a
// silent overwrite.
function animateRatingValue(fromValue, toValue) {
  const duration = 600;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    totalCountEl.textContent = String(Math.round(fromValue + (toValue - fromValue) * eased));
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function showRatingPopup(delta) {
  ratingPopupEl.textContent = (delta > 0 ? "+" : "") + delta;
  ratingPopupEl.classList.remove(
    "pz-rating-popup-up",
    "pz-rating-popup-down",
    "pz-rating-popup-play",
  );
  void ratingPopupEl.offsetWidth; // force reflow so a repeat popup re-triggers the animation
  ratingPopupEl.classList.add(delta >= 0 ? "pz-rating-popup-up" : "pz-rating-popup-down");
  ratingPopupEl.classList.add("pz-rating-popup-play");
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

// ── Offline takeover ────────────────────────────────────────────────────────

// Swaps the board and player bars for the shared error card (see
// assets/css/error-state.css) and back. The class lives on .board-area so one
// toggle drives both halves of the swap from CSS — see pages/puzzles/style.css.
function setBoardOffline(offline) {
  boardArea.classList.toggle("pz-board-offline", offline);
}

// Whether a failed load is something the solver can do nothing about from this
// page, and so warrants replacing the board rather than a line in the sidebar.
//
// "no_puzzles_in_range" deliberately does NOT qualify: it means the server is
// perfectly reachable and answered, and widening the range in the sidebar
// fixes it — taking the board away would hide the controls needed to recover.
function isServerUnreachable(err) {
  if (!err) return false;
  if (err.code === "network_error") return true;
  // 5xx: the request arrived but the server could not answer it. Includes the
  // 503 that /api/health returns when its SQLite database is unreachable.
  return typeof err.status === "number" && err.status >= 500;
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

  setControlsBusy(false); // also disables Hint, since the state is no longer SOLVING

  if (isSignedIn && currentPuzzle && !scoredPuzzleIds.has(currentPuzzle.id)) {
    // Added before the request, not after, so a second solve landing while
    // this one is still in flight cannot submit the same puzzle twice.
    // Captured in a local because currentPuzzle can change before it settles.
    const submittedId = currentPuzzle.id;
    scoredPuzzleIds.add(submittedId);

    submitPuzzleResult(submittedId, failedThisPuzzle, usedHint)
      .then((result) => {
        animateRatingValue(result.puzzleStats.rating - result.delta, result.puzzleStats.rating);
        showRatingPopup(result.delta);
      })
      .catch(() => {
        // The attempt never reached the server, so it was not scored and the
        // rating on screen is unchanged. Say so: silently dropping a solve
        // makes the rating look broken rather than offline.
        //
        // Releasing the id also matters — the once-per-session guard exists to
        // stop double-scoring a puzzle that WAS scored. Holding an id that
        // never was would mean re-solving this puzzle could never count.
        scoredPuzzleIds.delete(submittedId);
        statusSubEl.textContent = "Rating not saved — connection issue";
      });
  }
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

// ── Difficulty persistence ──────────────────────────────────────────────────
// The difficulty controls already exist; they just reset to Medium on every
// reload, so anyone working through Hard or Expert had to re-pick on each
// visit. Nothing new is added to the page — the same six buttons and two
// inputs simply come back the way they were left.
//
// Only the two numbers are stored. Which preset is highlighted is derived from
// them, so the button and the inputs cannot drift out of agreement.
//
// IMPORTANT: the in-<head> prefetch in pages/puzzles/index.html reads this same
// key, with the same clamping, so its request matches the range applied here.
// Changing the key or the clamping means changing it there too.
const PUZZLE_RANGE_KEY = "cheesePuzzleRange";

function saveRatingRange(min, max) {
  try {
    localStorage.setItem(PUZZLE_RANGE_KEY, JSON.stringify({ min, max }));
  } catch (e) {
    // Same posture as the anon counter above: failing to persist is
    // acceptable, the range still applies for this session.
  }
}

// Highlight whichever preset matches the range exactly. A custom range matches
// none and clears them all — the rule the change handler already applied by
// hand, now derived in one place so a restored range highlights correctly too.
function syncPresetToRange(min, max) {
  presetsEl.querySelectorAll(".pz-preset").forEach((b) => {
    b.classList.toggle(
      "pz-preset-active",
      Number(b.dataset.min) === min && Number(b.dataset.max) === max,
    );
  });
}

function applySavedRatingRange() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PUZZLE_RANGE_KEY));
  } catch (e) {
    return; // unreadable, unavailable, or corrupt → the HTML defaults stand
  }
  if (!saved || !Number.isFinite(saved.min) || !Number.isFinite(saved.max)) return;

  minRatingInput.value = String(saved.min);
  maxRatingInput.value = String(saved.max);
  // Re-run the normal path so a hand-edited value is clamped and swapped by
  // exactly the same rules as typed input, never trusted straight from storage.
  const { min, max } = readRatingRange();
  syncPresetToRange(min, max);
}

function setupPuzzle(puzzle) {
  cancelPendingSteps();
  clearPuzzleMarks();
  clearValidMoves();
  clearBoardHighlights();
  // A new puzzle (including Retry, which restarts the same one from scratch)
  // must never carry over circles/arrows drawn while solving the last one.
  boardAnnotations.clear();

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

/* Claims the request the page head started during HTML parse, so the first
   puzzle does not wait for the scripts to finish loading before its fetch
   even begins.
 *
 * One-shot: it is cleared on the first call, so every later puzzle — and any
 * change of difficulty — goes through a normal request. Returns null rather
 * than throwing whenever it cannot be used, letting the caller fall back to
 * an ordinary fetch, which also produces the proper typed errors.
 */
async function takePrefetchedPuzzle(min, max) {
  const prefetch = window.__cheesePuzzlePrefetch;
  if (!prefetch) return null;
  window.__cheesePuzzlePrefetch = null;

  // The head requested a fixed range. If the inputs on screen say something
  // else (a stale default, or a preset clicked before this resolved), the
  // prefetched puzzle is not the one the user asked for.
  if (prefetch.min !== min || prefetch.max !== max) return null;

  try {
    const puzzle = await prefetch.promise;
    if (!puzzle || typeof puzzle.rating !== "number") return null;
    // Belt and braces: never show a puzzle outside the range on display.
    if (puzzle.rating < min || puzzle.rating > max) return null;
    return puzzle;
  } catch (err) {
    return null;
  }
}

async function loadNewPuzzle() {
  if (!isSignedIn && getAnonPuzzleCount() >= ANON_PUZZLE_LIMIT) {
    showSignupGate();
    return;
  }

  const token = ++activeLoadToken;

  cancelPendingSteps();
  puzzleState = PUZZLE_STATE.LOADING;
  awaitingOpponent = false;
  setControlsBusy(true);
  setStatus("pz-status-idle", "Loading…", "Fetching a puzzle");

  const { min, max } = readRatingRange();

  try {
    const puzzle =
      (await takePrefetchedPuzzle(min, max)) || (await fetchRandomPuzzle(min, max));
    if (token !== activeLoadToken) return; // superseded while fetching

    // Never hand over a board whose pieces haven't finished decoding. After
    // the first load this is already settled and adds nothing.
    await piecesReady;
    if (token !== activeLoadToken) return; // superseded while assets loaded

    // Counts against the free limit here — a genuinely new puzzle actually
    // being shown — not in setupPuzzle(), which retryPuzzle() also calls for
    // the SAME puzzle and must not count twice.
    if (!isSignedIn) {
      incrementAnonPuzzleCount();
      updateAnonRemainingDisplay();
    }

    // Cleared here rather than when the request starts: leaving the error card
    // up for the duration of a retry means the board is never briefly restored
    // only to be taken away again when the retry also fails.
    setBoardOffline(false);
    setupPuzzle(puzzle);
  } catch (err) {
    if (token !== activeLoadToken) return; // a newer load owns the UI now

    puzzleState = PUZZLE_STATE.ERROR;
    currentPuzzle = null;
    // The meta row described the puzzle that just went away with it — leaving
    // its rating on screen next to an error reads as live detail about a
    // puzzle that is no longer loaded.
    ratingEl.textContent = "—";
    setControlsBusy(false);
    retryBtn.disabled = true;
    hintBtn.disabled = true;

    // The board is useless without a puzzle and there is nothing on this page
    // to adjust, so an unreachable server hands the whole board area to the
    // error card — the only thing on screen then offering a way out. Set on
    // every failure, not just the unreachable one, so an error that follows an
    // offline spell (a bad range, say) restores the board it needs.
    const unreachable = isServerUnreachable(err);
    setBoardOffline(unreachable);

    if (err.code === "no_puzzles_in_range") {
      setStatus("pz-status-wrong", "No puzzles found", "Try a wider rating range");
    } else if (unreachable) {
      setStatus("pz-status-wrong", "Puzzles are offline", "Can't reach the server");
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
  // Analysis and Training already guard this; Puzzles did not. Without it, a
  // right-mousedown used to start an annotation arrow could simultaneously
  // start a piece drag underneath it.
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
  const range = readRatingRange();
  saveRatingRange(range.min, range.max);
  loadNewPuzzle();
});

// The offline card's own retry. Unlike the sidebar buttons — which are hidden
// behind the card and stay disabled through the error state — this one carries
// its own busy label, because while it runs the card is the entire screen and
// nothing else could show that anything is happening.
offlineRetryBtn.addEventListener("click", async () => {
  const label = offlineRetryBtn.textContent;
  offlineRetryBtn.disabled = true;
  offlineRetryBtn.textContent = "Trying…";
  try {
    await loadNewPuzzle();
  } finally {
    // Restored even on success: the card is hidden by then, and leaving it
    // disabled would strand the button if the server drops again later.
    offlineRetryBtn.disabled = false;
    offlineRetryBtn.textContent = label;
  }
});

// Typing a custom range clears the preset selection — the buttons no longer
// describe what is in the inputs.
[minRatingInput, maxRatingInput].forEach((input) => {
  input.addEventListener("change", () => {
    const { min, max } = readRatingRange();
    // Derived rather than blanket-cleared: a custom range still matches no
    // preset and clears them all, but typing a range that happens to equal a
    // preset now highlights it instead of leaving the row misleadingly empty.
    syncPresetToRange(min, max);
    saveRatingRange(min, max);
  });
});

// ── Boot ────────────────────────────────────────────────────────────────────

// Before the first loadNewPuzzle() below, so the opening request uses the
// solver's own difficulty — and matches what the <head> prefetch already
// asked for, letting that prefetch actually be used.
applySavedRatingRange();

updateSessionDisplay();

// readAuthHint() is defined by assets/js/clerk-client.js, loaded before this
// file on every page that carries the nav — reused as-is rather than
// duplicating it here. Unlike the nav (which caches the actual name/avatar
// and can paint real content immediately), there is no cached rating value
// here — so the "optimistic" step only pre-applies the bigger rating font
// class to avoid a layout jump, leaving the number itself blank. The real
// number always comes from exactly one authoritative fetch, triggered once
// window.cheeseClerkReady resolves — never from a separate optimistic fetch
// racing against it. An earlier version fired an optimistic fetch here too
// and skipped the confirmed one whenever the hint "already matched," which
// meant a transient failure of that first fetch (page load, cookie not yet
// settled) left the header stuck blank forever with nothing to retry it.
const authHint = readAuthHint();

if (authHint && authHint.signedIn) {
  isSignedIn = true;
  headerStatEl.classList.add("pz-header-stat-rating");
} else {
  updateAnonRemainingDisplay();
}

window.cheeseClerkReady
  .then((clerkInstance) => {
    isSignedIn = !!clerkInstance.user;
    if (isSignedIn) {
      fetchMyPuzzleProfile()
        .then((user) => showRatingMode(user.puzzleStats))
        .catch(() => showBlankHeaderMode()); // degrade rather than mislead
    } else {
      updateAnonRemainingDisplay();
      // Only once Clerk has actually confirmed signed-out — never on the
      // earlier optimistic guess, which could still turn out to be a
      // signed-in user on a rare cold-boot-with-no-cached-hint visit.
      maybeShowAnonIntro();
    }
  })
  .catch(() => updateAnonRemainingDisplay());

loadNewPuzzle();
