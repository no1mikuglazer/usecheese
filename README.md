# Cheese

> A modern browser-based chess study platform.

**Live at [usecheese.xyz](https://usecheese.xyz)**

> ### 🧀 This project is complete
>
> Cheese is **finished**. **v1.4.1** is the final release and active development
> has ended — no further features are planned. The site is live and fully
> functional; what is described below is the finished product, not a work in
> progress. See [Scope](#scope--what-cheese-does-not-do) for the boundary of
> what it does, and the [changelog](docs/CHANGELOG.md) for how it got here.

---

## Overview

**Cheese** is an all-in-one, desktop-focused chess study platform. It brings together everything you need to improve your game in one calm, cohesive workspace — analyse your games with a world-class engine, study openings, browse the greatest games ever played, train tactics, and sharpen your skills against Stockfish.

Every board feature — analysis, openings, the database, playing Stockfish — runs entirely in your browser, with no account needed. The Puzzles page additionally talks to the Cheese API, a small backend that serves positions from a database of 1.7 million tactics puzzles, sampled across every difficulty from the full 5.8 million–puzzle Lichess import (see [`server/`](server/)). Puzzles are free to try without an account — 5 puzzles, then a prompt to sign up. A free account (via [Clerk](https://clerk.com)) removes that limit and adds a persisted puzzle rating that goes up or down with each solve, plus a public profile showing your rating history, recent activity and the tactical themes you have met.

Cheese is **desktop-only**. Below 768px every page shows an explanatory notice rather than a broken layout. This is by design and will not change — see [Scope](#scope--what-cheese-does-not-do).

---

## Features

Everything below is live in **Version 1.4.1**, the final release.

| Feature | Description |
| --- | --- |
| **Stockfish 18 Analysis** | Analyse any position with the Stockfish 18 engine, including an evaluation bar and engine lines. |
| **Puzzle Trainer** | Train tactics against a database of 1.7 million puzzles, filtered by difficulty, with hints. 5 free without an account; sign up for unlimited puzzles and a persisted rating. |
| **Accounts & Profiles** | A free account adds a persisted puzzle rating, a public profile with rating history and recent activity, and profile customization. |
| **Opening Explorer** | Browse openings by ECO code and hand off any line straight into Analysis. |
| **Play Against Stockfish** | Play full games versus the engine — choose your colour, with automatic board orientation and turn enforcement. |
| **Master Game Database** | Explore curated collections of games from legendary players, parsed dynamically from PGN. |
| **Local Save System** | Save your analyses locally in the browser and revisit them anytime. |
| **PGN Import** | Load games via PGN and review them move by move. |
| **Move Navigation** | Step forwards and backwards through any game with a clean move list. |
| **Graceful Failure** | A branded 404 page, and a clear offline state on Puzzles if the API is unreachable — both offering a way back into the site. |
| **Remembers Your Settings** | Puzzle difficulty and your Training colour persist across visits. |
| **Modern Glassmorphism UI** | A consistent dark, glassmorphism-inspired interface across every page. |
| **No Build Step** | The website is plain HTML, CSS and JavaScript — no bundler, no framework. |

---

## Project Structure

| Path | Contents |
| --- | --- |
| `index.html`, `pages/` | The static website — one folder per page |
| `404.html` | Shown for any unknown URL (picked up automatically by Cloudflare Pages) |
| `assets/` | Shared CSS, JS, pieces, sounds and images |
| `engine/` | Stockfish 18 (WebAssembly) |
| `library/` | Static content: ECO openings, master game PGNs |
| `docs/` | Changelog and technical documentation artifacts |
| `server/` | The Cheese backend API — see [`server/README.md`](server/README.md) |
| `_headers` | Response headers applied by Cloudflare Pages |

Only six files sit at the repository root, and each has to: `index.html` and
`404.html` are served from there, `_headers` is only read from there, and
`README.md`, `LICENSE` and `.gitignore` are expected there by GitHub and git.
Everything else lives in a folder.

The website and the API deploy independently. Only the Puzzles page depends on
the API; every other page works without it. The website is hosted on
Cloudflare Pages; the API runs on Railway (see
[`server/README.md`](server/README.md)).

---

## Scope — what Cheese does *not* do

Development is complete, so these are permanent limitations rather than pending
work. They were considered during development and deliberately not built:

- **Mobile** — Cheese is desktop-only and shows an explanatory notice below
  768px. This is the single largest thing it does not do.
- **Cloud-synced saved analyses** — accounts exist (see Accounts & Profiles
  above), but saved analyses live only in your browser's `localStorage`, so they
  do not follow you across devices
- **Puzzle themes as a filter** — themes are revealed when you finish a puzzle,
  but you cannot train a specific motif
- **Accessibility** — the board is not keyboard-navigable, there is no
  screen-reader support, and animated pages do not respect
  `prefers-reduced-motion`
- **Link previews** — no Open Graph tags, so a shared Cheese link renders no
  preview card

Cheese is [GPL-3.0](#license) — if you want any of the above, you are free to
fork it and build them.

---

## Screenshots

**Home**

![Home](assets/screenshots/home.png)

**Analysis**

![Analysis](assets/screenshots/analysis.png)

**Database**

![Database](assets/screenshots/database.png)

**Training**

![Training](assets/screenshots/training.png)

---

## Technologies Used

| Technology | Role |
| --- | --- |
| **HTML5** | Page structure |
| **CSS3** | Styling, layout, and glassmorphism design |
| **JavaScript** | Application logic (vanilla, no framework) |
| **chess.js** | Move generation, legality, and game state |
| **Stockfish 18** | Chess engine (WebAssembly, runs in a Web Worker) |
| **PGN parsing** | Reading and splitting master games and imports |
| **Node.js + Express** | Backend API (Puzzles and accounts) |
| **SQLite** | Puzzle datastore (1.7M rows served, sampled from a 5.8M import), plus a separate accounts database |
| **Clerk** | Authentication and session management |

---

## Design Philosophy

Cheese is built to be a **calm, distraction-free environment for studying chess**. The interface stays quiet and out of the way so the board and your analysis remain the focus, while a modern, consistent look keeps the whole experience cohesive from page to page. The goal is simple: a study platform that feels focused, polished, and pleasant to spend time in.

---

## Version

This README corresponds to **Version 1.4.1** — the **final** release.

Cheese was built between May and August 2026, from a single analysis board
([v1.0](docs/CHANGELOG.md)) to a nine-page study platform with its own backend,
puzzle database and account system. The full history is in the
[changelog](docs/CHANGELOG.md).

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

You are free to use, study, share, and modify Cheese under the terms of the GPL-3.0. Any distributed derivative works must remain under the same license. See the [LICENSE](LICENSE) file for the full text.

© 2026 Vihaan Productions™

---

## Thank You

Thanks for checking out **Cheese**! It started as a chessboard that could barely
track a move and ended as a platform I'm genuinely proud of. It's finished now —
the site stays live, and it is what it was always meant to be.

Enjoy your study, and happy analysing. ♟️🧀
