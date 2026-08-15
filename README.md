# Cheese

> A modern browser-based chess study platform.

**Live at [usecheese.xyz](https://usecheese.xyz)**

---

## Overview

**Cheese** is an all-in-one, desktop-focused chess study platform. It brings together everything you need to improve your game in one calm, cohesive workspace — analyse your games with a world-class engine, study openings, browse the greatest games ever played, train tactics, and sharpen your skills against Stockfish.

Every board feature — analysis, openings, the database, playing Stockfish — runs entirely in your browser, with no account needed. The Puzzles page additionally talks to the Cheese API, a small backend that serves positions from a database of 1.7 million tactics puzzles, sampled across every difficulty from the full 5.8 million–puzzle Lichess import (see [`server/`](server/)). Puzzles are free to try without an account — 5 puzzles, then a prompt to sign up. A free account (via [Clerk](https://clerk.com)) removes that limit and adds a persisted puzzle rating that goes up or down with each solve, plus a public profile showing your rating history, recent activity and the tactical themes you have met.

Cheese is **desktop-only** today. Below 768px every page shows an explanatory notice rather than a broken layout; a responsive experience is the next major piece of work.

---

## Features

Everything below is available in **Version 1.4**.

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

## Upcoming Features

These are planned for future releases:

- **Mobile Support** — a fully responsive experience for phones and tablets.
  Cheese is desktop-only today and shows an explanatory notice below 768px.
- **Cloud-synced saved analyses** — accounts exist (see Accounts & Profiles above),
  but saved analyses still live only in your browser's `localStorage`
- **Puzzle themes** — filter training by tactical motif
- **Accessibility** — a keyboard-navigable board, screen-reader support, and
  respecting `prefers-reduced-motion`
- **Link previews** — Open Graph tags so a shared Cheese link renders a preview card
- **More master games** — additional players and expanded collections
- **Additional improvements** — ongoing polish and quality-of-life updates

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

This README corresponds to **Version 1.4**.

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

You are free to use, study, share, and modify Cheese under the terms of the GPL-3.0. Any distributed derivative works must remain under the same license. See the [LICENSE](LICENSE) file for the full text.

© 2026 Vihaan Productions™

---

## Thank You

Thanks for checking out **Cheese**! Your interest and feedback are genuinely appreciated. Enjoy your study, and happy analysing.
