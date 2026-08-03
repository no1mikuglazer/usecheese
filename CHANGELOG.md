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

### Upcoming

Future updates are planned to include:

- User accounts and cloud-synced progress
- Puzzle themes and motif filtering
- Mobile support
- Additional master games
- More training options
- General improvements and polish




