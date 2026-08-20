# Cheese

> A modern browser-based chess study platform.

**Live at [usecheese.xyz](https://usecheese.xyz)**

> ### 🧀 v1.4.2 shipped — more to come later
>
> Cheese was wrapped up at **v1.4.1** in August 2026, and for a while that was
> the end of it. Development resumed, and **v1.4.2** — a backend test suite
> and CI, closing the one gap that kept holding the project back — has since
> shipped. This round of work is finished. The project isn't being worked on
> every day, but it isn't closed either — more will land here later.
>
> v1.4.2 is the latest *released* version and what the live site runs today,
> so everything described below is real and working. See
> [Scope](#scope--what-cheese-does-not-do) for what it does and doesn't do
> right now, and the [changelog](docs/CHANGELOG.md) for how it got here.

---

## Overview

**Cheese** is an all-in-one, desktop-focused chess study platform. It brings together everything you need to improve your game in one calm, cohesive workspace — analyse your games with a world-class engine, study openings, browse the greatest games ever played, train tactics, and sharpen your skills against Stockfish.

Every board feature — analysis, openings, the database, playing Stockfish — runs entirely in your browser, with no account needed. The Puzzles page additionally talks to the Cheese API, a small backend that serves positions from a database of 1.7 million tactics puzzles, sampled across every difficulty from the full 5.8 million–puzzle Lichess import (see [`server/`](server/)). Puzzles are free to try without an account — 5 puzzles, then a prompt to sign up. A free account (via [Clerk](https://clerk.com)) removes that limit and adds a persisted puzzle rating that goes up or down with each solve, plus a public profile showing your rating history, recent activity and the tactical themes you have met.

Cheese is **desktop-only**. Below 768px every page shows an explanatory notice rather than a broken layout. This is by design — see [Scope](#scope--what-cheese-does-not-do).

---

## Features

Everything below is live in **Version 1.4.2**, the current release.

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
| `.github/workflows/` | CI — runs lint and the backend test suite on every push to `main` and every pull request |
| `_headers` | Response headers applied by Cloudflare Pages |
| `eslint.config.mjs` | Lint rules for both the frontend and `server/` — run via `npm run lint` in `server/` |

Only seven files sit at the repository root, and each has to: `index.html` and
`404.html` are served from there, `_headers` is only read from there,
`README.md`, `LICENSE` and `.gitignore` are expected there by GitHub and git,
and `eslint.config.mjs` must live there because ESLint resolves a flat
config's `files` patterns against the working directory it's run from, not
the config's own location (see that file's own header for why it's still
kept out of a root `package.json`, which would risk tripping Cloudflare
Pages' build detection). Everything else lives in a folder.

The website and the API deploy independently. Only the Puzzles page depends on
the API; every other page works without it. The website is hosted on
Cloudflare Pages; the API runs on Railway (see
[`server/README.md`](server/README.md)).

---

## Scope — what Cheese does *not* do

These are the boundaries of what Cheese does **today**. Each was considered
during development and deliberately not built — they are decisions already
made, not a roadmap, but with development active again none of them are
permanent:

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

This README corresponds to **Version 1.4.2** — the current release.

Cheese was built between May and August 2026, from a single analysis board
([v1.0](docs/CHANGELOG.md)) to a nine-page study platform with its own backend,
puzzle database, account system, and now an automated test suite and CI. That
run ended at v1.4.1; development resumed and v1.4.2 closed the testing gap —
a patch release, since it changes nothing user-facing. This round of work is
finished, and the next release will build on it whenever development picks
back up. The full history is in the [changelog](docs/CHANGELOG.md).

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

You are free to use, study, share, and modify Cheese under the terms of the GPL-3.0. Any distributed derivative works must remain under the same license. See the [LICENSE](LICENSE) file for the full text.

© 2026 Vihaan Productions™

---

## Thank You

Thanks for checking out **Cheese**! It started as a chessboard that could barely
track a move and grew into a platform I'm genuinely proud of. The site stays
live — and after a spell of calling it done, I'm building on it again.

Enjoy your study, and happy analysing. ♟️🧀
