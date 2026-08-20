/* Cheese — lint configuration.
 *
 * Run with `npm run lint` from server/ — that is where the eslint
 * devDependency lives, and the script steps back up to the repository root
 * first because ESLint resolves a flat config's `files` patterns against the
 * working directory, not against the config's own location.
 *
 * The dependency is kept out of a root package.json deliberately: the
 * frontend is served as static files straight from this directory by
 * Cloudflare Pages, and a package.json at the root is exactly the thing a
 * host's build detection looks for. Nothing here should be able to change how
 * the site deploys.
 *
 * The main reason this exists is `no-undef`. The site has no build step and no
 * modules — every browser script is a classic <script> sharing one global
 * scope, wired together purely by the order of the tags in each page's HTML.
 * Nothing else in the project can tell you that a name a file uses is actually
 * defined somewhere, so the `globals` block below doubles as the written-down
 * contract between the shared files and the page scripts.
 */

const browserGlobals = {
  // Standard browser surface used by this project.
  window: "readonly",
  document: "readonly",
  console: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  location: "readonly",
  history: "readonly",
  navigator: "readonly",
  fetch: "readonly",
  crypto: "readonly",
  URLSearchParams: "readonly",
  Worker: "readonly",
  Audio: "readonly",
  Image: "readonly",
  IntersectionObserver: "readonly",
  MutationObserver: "readonly",
  ResizeObserver: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  getComputedStyle: "readonly",
  alert: "readonly",
  prompt: "readonly",
  confirm: "readonly",
  performance: "readonly",
  SVGElement: "readonly",
  Element: "readonly",
  Node: "readonly",
  CustomEvent: "readonly",
  Event: "readonly",
};

const vendorGlobals = {
  Chess: "readonly", // chess.js, loaded from cdnjs before every board page's scripts
  Clerk: "readonly", // Clerk's browser bundle, loaded from clerk.usecheese.xyz
};

/* Names the shared files in assets/js/ publish for page scripts, and names the
 * page scripts must publish back for the shared files. Writable because these
 * are plain globals in one shared scope, assigned from both sides. */
const sharedAppGlobals = {
  // ── assets/js/board-core.js -> pages ──
  getPieceImage: "writable",
  snapshotBoard: "writable",
  clearBoard: "writable",
  clearBoardHighlights: "writable",
  applyLastMoveHighlight: "writable",
  findKingSquare: "writable",
  flashCheck: "writable",
  flashKingIfInCheck: "writable",
  playSound: "writable",
  moveSoundName: "writable",
  showValidMoves: "writable",
  clearValidMoves: "writable",
  isPromotionMove: "writable",
  outsidePromotionClick: "writable",
  closePromotionPicker: "writable",
  drawMotionTrail: "writable",
  isLegalMove: "writable",
  setGhostTransform: "writable",
  animateSnapBack: "writable",
  onDragMove: "writable",
  onDragEnd: "writable",
  renderMoveTree: "writable",
  renderNodeRecursive: "writable",
  renderVariationLine: "writable",
  findNodeById: "writable",
  addMoveTreeClickEvents: "writable",
  createEngineContinuation: "writable",
  addEngineLineClickEvents: "writable",
  generatePGNFromNode: "writable",
  showToast: "writable",
  positionToastNearPlayerBar: "writable",
  parseOpeningMoves: "writable",
  loadOpeningFromStorage: "writable",
  readSavedAnalyses: "writable",
  writeSavedAnalyses: "writable",
  mainlineTip: "writable",
  resetPlayerNames: "writable",
  resetAnalysisState: "writable",
  formatSavedDate: "writable",
  saveCurrentAnalysis: "writable",
  boardFlipped: "writable",
  dragState: "writable",
  pendingPromotion: "writable",
  dragAllowed: "writable",
  getDragTargetSquare: "writable",
  showPromotionPicker: "writable",
  startDrag: "writable",
  attachBoardDragListeners: "writable",
  renderBoard: "writable",
  DRAG_GHOST_SCALE: "writable",
  HIGHLIGHT_FILES: "writable",
  GameNode: "writable",
  MOVE_SOUND_FILES: "writable",
  moveSounds: "writable",
  SAVED_ANALYSES_KEY: "writable",
  // Analysis + Training only — Puzzles has no move tree, so these two are
  // called from two of the three board pages, not all three.
  attachMoveNavControls: "writable",
  attachRenameHandler: "writable",

  // ── pages -> assets/js/board-core.js ──
  // board-core operates on these by name; every board page must define them.
  squares: "writable",
  chess: "writable",
  currentNode: "writable",
  root: "writable",
  selectedSquare: "writable",
  customPositionName: "writable",
  latestEngineUCILine: "writable",
  moveTreeContainer: "writable",
  playMove: "writable",
  refreshUI: "writable",
  boardAnnotations: "writable",
  // Optional hook — a page defines it to gate dragging; absent on Analysis.
  canStartDrag: "writable",

  // ── assets/js/board-annotations.js ──
  attachBoardAnnotations: "writable",

  // ── assets/js/api-client.js ──
  fetchRandomPuzzle: "writable",
  fetchMyPuzzleProfile: "writable",
  submitPuzzleResult: "writable",
  fetchProfileOptions: "writable",
  fetchPublicProfile: "writable",
  updateMyProfile: "writable",
  CheeseApiError: "writable",
  cheeseApiRequest: "writable",

  // ── assets/js/clerk-client.js ──
  escapeHtml: "writable",
  cheeseClerk: "writable",
  cheeseClerkReady: "writable",
  readAuthHint: "writable",
  writeAuthHint: "writable",

  // ── assets/js/cheese-dialogs.js ──
  cheeseDialogs: "writable",

  // ── assets/js/auth-form.js (Log In + Sign Up) ──
  showAuthError: "writable",
  clearAuthError: "writable",
  messageFromClerkError: "writable",
};

const baseRules = {
  "no-undef": "error",
  eqeqeq: ["warn", "smart"],
  "no-var": "warn",
};

/* Browser scripts share one global scope across files, which makes two
 * otherwise-useful rules structurally wrong here:
 *
 * - `no-unused-vars` at global scope would flag every function a shared file
 *   publishes for a page script to call, because the definition and the only
 *   caller are in different files. `vars: "local"` keeps the rule where it
 *   still works — genuinely dead locals inside a function.
 * - `prefer-const` would flag `boardFlipped`, which board-core declares and
 *   the page scripts assign to. ESLint cannot see the other file, so it is
 *   off for this group.
 */
const browserRules = {
  ...baseRules,
  "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }],
};

const nodeRules = {
  ...baseRules,
  "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" }],
  "prefer-const": "warn",
};

export default [
  {
    // Vendored builds and generated data are not ours to lint.
    ignores: [
      "engine/**",
      "library/**",
      "server/node_modules/**",
      "server/data/**",
      "docs/**",
    ],
  },
  {
    // Browser scripts: one shared global scope, no modules.
    files: ["assets/js/**/*.js", "pages/**/script.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserGlobals, ...vendorGlobals, ...sharedAppGlobals },
    },
    rules: browserRules,
  },
  {
    // Node: the API, its data scripts, its test suite, and the ECO derivation script.
    files: ["server/src/**/*.js", "server/scripts/**/*.js", "server/test/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        // Node 22's built-in global fetch — only the test suite uses it so
        // far (hitting the app's own HTTP server in integration tests).
        fetch: "readonly",
      },
    },
    rules: nodeRules,
  },
];
