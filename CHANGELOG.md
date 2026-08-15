# Cheese Website Changelog

---

# V1.0 — Basic Analysis System
Completed: 26/05/2026

## Added
- Fully functional chess board
- Custom medieval chess piece set
- Custom brown board tile set
- Custom background support
- Move validation system
- Legal move highlighting using translucent dots
- Check detection with flashing king effect
- Click-to-move piece system
- Full move navigation system
- First move / previous move / next move / last move controls
- Clickable PGN move list
- Move syncing with board positions
- Chess.com-style variation system
- Side-line move rendering
- Dynamic move numbering system
- PGN export support
- Simple PGN import support
- Player panels
- Dynamic player names from PGN
- Dynamic clock detection from PGN TimeControl tags
- Analysis panel
- Move tree architecture
- Variation node system
- Board state rebuilding system
- Custom UI styling
- Hover animations
- Scrollable analysis section
- New game system
- Delete game system

## Improved
- Board centering and scaling
- Analysis panel layout
- Move spacing and readability
- Variation rendering logic
- Move numbering logic
- Asset loading consistency
- Board positioning
- Player panel positioning
- General UI polish

## Fixed
- Knight asset loading issues
- Variation numbering bugs
- Incorrect black move notation
- Move overwrite bug
- Navigation desync bugs
- Player bar overflow issues
- Broken move tree rendering
- Incorrect PGN continuation rendering

## Technical Notes
- Built primarily using vanilla HTML, CSS, and JavaScript
- Uses chess.js for move legality and PGN handling
- Uses a custom move-tree architecture
- Structured for future Stockfish integration
- Structured for future production-level UI overhaul

## Statistics
- ~1800+ lines of code
- First major large-scale chess project
- First fully functional analysis platform prototype

## Notes
V1 marks the completion of the foundational architecture of Cheese Website.

The project now supports:
- move trees
- variations
- PGN systems
- navigation
- analysis workflows

# V1.1 — Opening Explorer & Persistence Update

Completed: 23/06/2026

## Added

* Full Stockfish 18 Lite integration
* Live evaluation bar
* Engine depth display
* Engine analysis display
* Opening Explorer page
* ECO opening database integration
* Opening search system
* Opening cards with ECO code support
* Opening-to-Analysis loading system
* Dynamic opening name display
* Games tab
* Persistent save system using localStorage
* Analysis loading system
* Saved analysis management
* Advanced PGN import system
* PGN metadata parsing
* Dynamic event detection from PGN
* Dynamic player name detection from PGN
* Dynamic board player panels
* Dynamic clock loading from PGN metadata
* Home page
* Sidebar navigation system
* Multi-page architecture
* Analysis page navigation
* Opening Explorer navigation
* Sound effect system
* Last move highlighting
* Check flashing animation
* Invalid move feedback while in check

## Improved

* Analysis panel responsiveness
* Navigation architecture
* Move synchronization reliability
* Opening loading workflow
* Save/load workflow
* PGN handling reliability
* General UI consistency
* Sidebar behavior across pages

## Fixed

* Promotion handling bugs
* PGN copy issues
* Navigation button issues
* Evaluation display issues
* Analysis synchronization issues
* Multiple UI state inconsistencies

## Technical Notes

* Uses Stockfish 18 Lite for engine analysis
* Uses ECO JSON databases for opening exploration
* Uses localStorage for persistent saved analyses
* Supports opening-to-analysis state transfer
* Supports PGN-to-analysis state transfer
* Structured for future Puzzles, Training, and Database modules

## Statistics

* Multiple integrated application pages
* Persistent storage support
* Opening database support
* Engine analysis support
* Full analysis workflow implementation

## Notes

V1.1 transforms Cheese from a standalone analysis board into a complete chess analysis platform.

The project now supports:

* engine analysis
* opening exploration
* saved analyses
* PGN import
* persistent storage
* navigation between modules
* complete analysis workflows

# V1.2 — Production Release

Completed: 01/07/2026

## Added

- Training mode
- Play against Stockfish 18
- White / Black side selection
- Automatic board orientation
- Stockfish bot integration
- Real-time engine gameplay
- Game over popup
- Checkmate detection
- Draw detection
- Resignation system
- Winner highlighting
- Shared save system between Analysis and Training
- Master Games Database
- Famous player browser
- Dynamic PGN parsing for master games
- Analysis loading directly from Database
- Player profile pages
- Expanded Home page
- Puzzles page (Coming Soon)
- Shared mobile compatibility page
- Desktop-first experience

## Improved

- Home page layout and navigation
- Sidebar consistency across every page
- Database architecture
- Code reuse between Analysis and Training
- Training interface
- Save system integration
- Overall UI consistency
- Page transitions
- Navigation flow
- Production polish across the application

## Fixed

- Board orientation issues while playing as Black
- Training move synchronization
- Game state consistency
- Sound loading path issues
- Player name synchronization
- Training save integration
- Various UI alignment issues
- Multiple responsiveness improvements
- Navigation inconsistencies

## Removed

- Settings page
- Analysis Explore tab
- Unused interface elements
- Remaining placeholder navigation items

## Technical Notes

- Reused the existing chess board architecture for Training
- Integrated Stockfish gameplay using the existing engine implementation
- Unified save system between Analysis and Training
- Extended the Database using reusable PGN parsing
- Shared Mobile module for desktop-only detection
- Continued using vanilla HTML, CSS and JavaScript
- Continued using chess.js for game logic
- Entire application remains client-side with no backend required

## Statistics

- 7 major application pages
- Stockfish gameplay support
- Master game database
- Persistent local save system
- Desktop-first production release
- Thousands of master games supported through PGN files

## Notes

V1.2 marks the first public production release of Cheese.

Cheese has evolved from a simple analysis board into a complete desktop chess study platform.

The project now supports:

- engine analysis
- opening exploration
- master game database
- play against Stockfish
- PGN import
- persistent saved games
- game review
- local-first architecture
- modern multi-page interface

# V1.2.1 — Licensing

Completed: 02/07/2026

- Added MIT LICENSE with new copyright information
- Added copyright notice for Vihaan Productions to README

# V1.2.2 — Website Is Now Live

Completed: 03/07/2026

- Cheese is now live in production
- Cleaned up remaining top-level folder naming (`Home/` merged into project root)

# V1.2.3 — Professional Folder Restructure

Completed: 01/08/2026

- Reorganized the entire project into a professional folder structure: `pages/`, `assets/`, `engine/stockfish/`, `data/eco/`, `data/masters/`, `docs/artifacts/`
- Added `.gitignore`
- Added technical documentation artifacts (PDF and PPTX)

# V1.2.4 — Shared Board Core Extraction

Completed: 01/08/2026

- Extracted shared `assets/css/board-layout.css` and `assets/css/nav.css` stylesheets
- Extracted shared `assets/js/board-core.js` module for board rendering and interaction
- De-duplicated board logic between Analysis and Training, trimming both pages' scripts significantly

# V1.2.5 — Drag-and-Drop Polish

Completed: 02/08/2026

- Smoothed out chessboard piece drag-and-drop in `board-core.js`

# V1.2.6 — Favicon

Completed: 02/08/2026

- Added site favicon, wired into every page

# V1.2.7 — Database/Opening Handoff Fixes

Completed: 02/08/2026

- Fixed Database → Opening Explorer → Analysis handoff data bugs
- Corrected ECO opening data (`data/eco/ecoC.json`)

# V1.3 — Puzzles & the First Backend

Completed: 03/08/2026

## Added

- **Puzzle system** — a full tactics trainer on the Puzzles page
- **Cheese backend API** (`server/`) — the project's first server-side component
- Puzzle database built from the Lichess puzzle export (5.8M puzzles)
- Random puzzle lookup by rating band
- Difficulty presets (Beginner through Expert) plus a custom rating range
- Progressive hint system (reveals the piece, then the full move)
- Automatic board orientation to the solving side
- Move-by-move solution validation with correct/incorrect feedback
- Alternate-checkmate acceptance (any mate ends a puzzle, not just the recorded move)
- Puzzle themes revealed on completion
- Session tracking for solved / attempted / streak
- Retry to restart the current puzzle
- Shared `assets/js/api-client.js` for frontend-to-API calls

## Changed

- Cheese is no longer a purely client-side application. The website remains
  fully static and is still deployed as before; the new API is a **separate**
  service that only the Puzzles page calls.
- Puzzles page now uses the shared `nav.css` and `board-layout.css` instead of
  duplicating those rules locally.

## Technical Notes

- Backend is Node.js + Express, with SQLite (`better-sqlite3`) as the datastore
- Puzzle data is imported from a parquet export by a one-time script
  (`server/scripts/import-puzzles.js`); the resulting database is not committed
- Random puzzle selection avoids `ORDER BY RANDOM()` — rows are stored in
  rating order so the lookup is two index-boundary reads plus a primary-key
  hit, roughly 700x faster than a scan at this table size
- Puzzle solving reuses the existing `board-core.js` rendering, drag-and-drop
  and highlight helpers rather than duplicating them
- Configuration is entirely environment-variable driven; no secrets are
  committed (see `server/.env.example`)

# V1.3.1 — Accounts, Profiles & Ratings

Completed: 14/08/2026

Cheese gained its first real user accounts. Every board feature still works
signed-out; accounts add persistence on top rather than gating what already
existed.

## Added

- **User accounts** via [Clerk](https://clerk.com) — dedicated Sign Up and Log In pages
- **Persisted puzzle rating** for signed-in users, moving up or down with each solve
- **Public profile page** (`pages/profile/`) — reachable at `?u=<username>`, showing
  identity, puzzle stats, rating history, recent activity and a theme breakdown
- Rating history chart with hover detail
- Profile customization — a banner palette with live preview, and a favourite opening
- Puzzle rating milestones, and an "almost unlocked" counter for puzzle themes
- **Anonymous puzzle gate** — 5 free puzzles signed-out, with a first-visit intro
  and a live remaining counter, then a prompt to sign up
- Live signed-in / signed-out state in the nav, cached so it paints instantly
  instead of flashing the wrong state on every page load
- Per-attempt puzzle logging, groundwork for a future stats feature
- `assets/js/clerk-client.js` — shared Clerk bootstrap for every page

## Changed

- Renamed `data/` to `library/`, to be clearly distinct from `server/data/`
- Replaced Clerk's default avatar with a plain glass initial tile, matching the UI
- Moved Clerk from its development instance to a production one

## Removed

- The puzzle-rating sparkline — it never read well at the size available

## Fixed

- **Signed-in users were getting 401 on every API request.** `usecheese.xyz` and
  `api.usecheese.xyz` are separate origins, so the session cookie was never sent.
  The session is now passed explicitly as an `Authorization: Bearer` token.
- Clerk rejected valid cross-subdomain sessions until `authorizedParties` was set
- **Every deploy silently wiped every account.** `USERS_DB_PATH` was never set in
  production, so it fell back to a path inside the container's ephemeral
  filesystem. Fixed by setting the variable and adding a production start-up check
  that refuses to boot without it. Data lost before the fix is unrecoverable.
- Oversized avatar and a signed-out nav flash when navigating between pages
- Puzzle rating header — stuck placeholder, stray sparkline dot, layout issues

## Technical Notes

- Accounts live in **their own SQLite file**, separate from the puzzle database.
  Both puzzle scripts drop and recreate their target as a routine operation; a
  shared file would mean running an import out of habit destroyed every user.
- The users database is not reproducible from anything and must be included in
  any volume backup — unlike the puzzle database, which can always be rebuilt
- Rating change is a pure function of the puzzle's own difficulty. The server
  looks up that difficulty itself rather than trusting a value from the client.
- `server/src/lib/profileOptions.js` is the single source of truth for the banner
  and opening lists, read by both the API's validation and the frontend's pickers
- Security hardening: `helmet` on the API, response headers on the frontend
  (`_headers`), and stricter rate limits on the write endpoints

# V1.4 — Final Polish

Completed: 15/08/2026

No new features. This release closes the gaps that made a finished site feel
unfinished: what happens when something goes wrong, what happens when you click
the wrong button, and making the source match what the site actually does.

## Added

- **404 page** — an unknown URL previously fell through to Cloudflare's default
  handling and offered no way back into the site
- **Offline state for Puzzles** — when the API is unreachable, the board is
  replaced by an error card explaining the situation, with Try Again and a way home
- `assets/css/error-state.css` — one shared treatment for both, so errors read as
  part of Cheese rather than as unrelated screens

## Improved

- **Puzzles remembers your difficulty** and **Training remembers your colour**
  across reloads. Both controls already existed; they simply reset every visit.
- Confirmation before Analysis's **New** (skipped on an untouched board) and
  before deleting a saved analysis, which names the analysis being deleted
- The Puzzles page's in-`<head>` prefetch now requests the saved difficulty, so
  it is actually usable instead of being discarded and re-fetched

## Fixed

- **A failed puzzle submit silently discarded the solve.** It was never scored,
  the user was never told, and the puzzle could never be re-submitted. It now
  reports the failure and stays scoreable.
- Deleting a saved analysis re-rendered as though it had worked even when the
  write failed — the entry would reappear on the next reload
- The active nav item was an `<a>` placed directly inside `<ul>`, invalid markup
  on four pages

## Removed

- The fake player clocks — a hardcoded `10:00` that never ticked
- Training's dead UCI parser, which wrote to five DOM elements that do not exist
  on that page, plus the no-op engine stub it was the only consumer of
- An unreachable PGN-import modal on Training, with no trigger anywhere
- Unused "Coming Soon" tooltip and disabled-state CSS matching no elements
- Roughly 655 net lines in total

## Technical Notes

- `404.html` is picked up automatically by Cloudflare Pages. Its asset paths are
  root-absolute because the file is served **at the requested URL** — a miss on
  `/pages/analysis/foo` renders it with the base still at `/pages/analysis/`,
  where relative paths would 404 in turn and leave it unstyled.
- Only an unreachable server takes over the Puzzles board. A rating range with no
  puzzles in it stays in the sidebar, because the server answered fine and
  widening the range fixes it — removing the board would hide the controls needed.
- `latestEngineUCILine` was kept in Training despite appearing dead: `board-core.js`
  reads it in `createEngineContinuation` and writes it in `resetAnalysisState`,
  which Training calls on every new game
- The duplicated `.left-nav-auth` block in `style.css` was also kept — the Home
  page does not load `nav.css`, so that copy is required, not leftover

### Upcoming

Future updates are planned to include:

- **Mobile support** — a fully responsive experience for phones and tablets
- **Cloud-synced saved analyses** — they still live only in browser `localStorage`
- **Puzzle themes** — filter training by tactical motif
- **Accessibility** — keyboard-navigable board, screen-reader support, and
  `prefers-reduced-motion` on the animated pages
- **Link previews** — Open Graph tags so a shared link renders a card
- Additional master games, more training options, and ongoing polish




