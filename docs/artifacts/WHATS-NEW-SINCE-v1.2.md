# Cheese — What Changed Since v1.2

**For updating `Cheese_Technical_Documentation_v1.2.pdf` and `Cheese_v1.2.pptx`,
both of which still describe v1.2.**

This is a plain-language summary of everything that changed between **v1.2**
(the first public release, 01/07/2026) and **v1.4** (15/08/2026). Copy from it
freely — it is written to be pasted into slides and a report, not read as a
changelog. For the precise per-release detail, see [`CHANGELOG.md`](../../CHANGELOG.md).

---

## The one-sentence version

Cheese went from a purely client-side chess study site to a platform with its
own backend, a 1.7-million-puzzle tactics trainer, real user accounts with
persisted ratings and public profiles — and then had a release spent entirely on
making it fail gracefully and behave predictably.

---

## The single biggest architectural change

**v1.2 had no server at all.** Everything ran in the browser.

**v1.4 has two independently deployed halves:**

| Half | What it is | Where it runs |
| --- | --- | --- |
| Website | Vanilla HTML/CSS/JS, no build step, no framework | Cloudflare Pages |
| API | Node.js + Express + SQLite | Railway |

They deploy separately and are not coupled. Only Puzzles and accounts need the
API — Analysis, Openings, Master Games and playing Stockfish all still work with
the API completely offline. That was a deliberate design constraint, not an
accident: the parts of the site that worked in v1.2 without a server still do.

**A useful talking point:** the chess engine never moved to the server. Stockfish
18 runs as WebAssembly in a Web Worker in the browser, exactly as it did in v1.2.
The backend serves puzzle data and account data — it does not analyse chess.

---

## What was added, by release

### v1.3 — Puzzles & the First Backend

- A full tactics trainer, backed by the Lichess puzzle export
- **5.8 million puzzles imported; 1.7 million served**, sampled to keep every
  difficulty band populated
- Difficulty presets from Beginner to Expert, plus a custom rating range
- Progressive hints — reveals the piece, then the whole move
- Move-by-move validation, with any checkmate accepted rather than only the
  recorded one
- The project's first backend, database, and API client

### v1.3.1 — Accounts, Profiles & Ratings

- Real user accounts, via Clerk
- A **persisted puzzle rating** that moves up or down with each solve
- A **public profile page** — rating history chart, recent activity, puzzle
  stats, and a breakdown of the tactical themes you have encountered
- Profile customization: a banner palette with live preview, and a favourite opening
- An anonymous gate: 5 free puzzles signed-out, then a prompt to sign up

### v1.4 — Final Polish

Deliberately **no new features**. Three kinds of work:

1. **Failing gracefully** — a proper 404 page, and a clear offline state on
   Puzzles when the API cannot be reached. Both offer a way back into the site.
2. **Not losing your work** — confirmation before actions that discard an
   analysis, and a fix for a failed puzzle submit that used to be discarded
   silently and could never be retried.
3. **Making the source honest** — around 655 net lines of dead code removed,
   including fake clocks that never ticked and a 120-line engine parser writing
   to elements that did not exist.

---

## Two engineering decisions worth presenting

These are the kind of detail that shows judgment rather than just feature count.

### 1. Random puzzle selection is not `ORDER BY RANDOM()`

The obvious way to pick a random puzzle in a rating band is
`ORDER BY RANDOM() LIMIT 1`. On a table this size that scans **every** row.

Instead, rows are written to the database **in rating order** during import, so
row id correlates with rating. Picking a random puzzle in a band becomes two
index-boundary lookups plus one primary-key hit — roughly **700× faster** than a
scan at this table size.

The cost of that choice: any future incremental append silently breaks the
ordering assumption. The fix is a full reimport, and that is documented where
someone would hit it.

### 2. Accounts live in a separate database file from puzzles

The puzzle import scripts **drop and recreate** their target database as a normal,
documented operation. If accounts shared that file, running an import out of
habit would destroy every user.

This was learned the hard way. In production, the accounts database path was
never configured, so it fell back to a location inside the container's temporary
filesystem — and **every deploy silently wiped every account**. It surfaced only
because the public profile endpoint, which deliberately does not auto-create
missing users, started returning "not found" for real accounts.

Two things changed as a result: the path is now set explicitly, and the server
**refuses to start in production** if it is missing, rather than falling back to
a default that loses data. The failure mode was changed from silent to loud.

---

## Numbers for a slide

| | v1.2 | v1.4 |
| --- | --- | --- |
| Pages | 6 | 9 (plus a 404 page) |
| Backend | none | Node + Express + SQLite |
| Puzzles available | 0 | 1,700,000 |
| User accounts | no | yes, with persisted ratings |
| Deployed services | 1 | 2 (website + API) |
| Build step | none | still none |

---

## What is deliberately still missing

Worth stating outright rather than being asked about it:

- **Mobile.** Cheese is desktop-only. Below 768px every page shows an
  explanatory notice instead of a broken layout. This is the single largest
  outstanding piece of work.
- **Accessibility.** The board is not keyboard-navigable and is not usable with
  a screen reader; animations do not yet respect `prefers-reduced-motion`.
- **Link previews.** Sharing a Cheese link renders a bare URL — no Open Graph tags.
- **Cloud-synced saved analyses.** Accounts exist, but saved analyses are still
  stored only in the browser's local storage.
