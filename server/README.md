# Cheese Server

Backend API for Cheese. Currently serves the puzzle database; structured so
future features (accounts, cloud-synced saves) can be added as new modules
without rearranging anything.

The frontend remains a separate, fully static site — it calls this API over
`fetch()`. This service does not serve the website itself.

---

## Requirements

- Node.js 22 or newer (required by `better-sqlite3`; older versions segfault
  rather than failing cleanly, so the version is pinned in `engines` and
  `.nvmrc`)
- The source puzzle parquet (`chess-puzzles.parquet`, the Lichess puzzle
  export, ~825MB)

### Where the source parquet lives

It is kept **outside this repository**, in a sibling folder:

```
Projects/
  Chess_Engine_Web/          <- this repository
  Chess_Engine_Web_data/
    chess-puzzles.parquet    <- source data
```

It sits outside the repo for two reasons: GitHub rejects files over 100MB, so
it could never be committed; and an ignored file *inside* the working tree
would be deleted by `git clean -xdf`. The import script looks there by
default — use `--parquet <path>` if yours is elsewhere.

## Setup

```bash
cd server
npm install
cp .env.example .env      # then edit if needed
```

## Building the puzzle database

The API needs a SQLite database built from the parquet. This is a one-time
step (repeat only when the source data is refreshed):

```bash
npm run import:puzzles
```

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--parquet <path>` | `../../Chess_Engine_Web_data/chess-puzzles.parquet` | Source file |
| `--db <path>` | `./data/cheese.sqlite` | Output database |
| `--min-popularity <n>` | `50` | Drop puzzles below this community score |
| `--min-plays <n>` | `5` | Drop puzzles played fewer than this many times |

The import is idempotent — it drops and rebuilds its tables, so re-running is
safe. With the default filters it keeps roughly 5.8M of the 6.0M source
puzzles and produces a ~1GB database in a couple of minutes.

**The database is deliberately not committed** (it is gitignored). It is fully
reproducible from the parquet plus the command above, which is the recovery
path if it is ever lost.

### Why the import sorts by rating

`ORDER BY RANDOM()` would make SQLite touch every matching row on every
request — unusable at ~6M rows. Instead the import writes rows in rating order
so the rowid (`id`) is monotonically correlated with `rating`. Fetching a random
puzzle in a rating band is then two index-boundary lookups plus one primary-key
hit, none of which scan.

That correlation only holds because the table is built by a single ordered
INSERT. If puzzles are ever appended incrementally, rebuild with a full
reimport rather than patching rows in.

## Deriving a smaller database

The imported database is ~1GB, which does not fit a storage-constrained volume
(Railway's free tier caps at 500MB). This derives a smaller one from it:

```bash
npm run shrink:puzzles
```

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--source <path>` | `./data/cheese.sqlite` | Database to sample from |
| `--target <path>` | `./data/cheese.small.sqlite` | Output database |
| `--cap-per-band <n>` | `70000` | Max puzzles kept per rating band |
| `--band-size <n>` | `100` | Width of a rating band |

With the defaults:

| | rows | rating span | size |
| --- | --- | --- | --- |
| `cheese.sqlite` | 5,826,593 | 399–3327 | 1014 MB |
| `cheese.small.sqlite` | 1,693,140 | 399–3327 | 296 MB |

It reads rows already on disk in SQLite rather than re-parsing the parquet, so
it finishes in seconds rather than minutes.

### Why it samples per rating band, not uniformly

Puzzle ratings are heavily concentrated in the middle. Uniformly downsampling
the whole table would let those dense mid-ratings crowd out the rare extremes,
and a band that ends up empty is not a cosmetic loss: a difficulty preset
covering it would start returning `no_puzzles_in_range` instead of a puzzle.

Capping *per band* instead means dense bands get trimmed while sparse ones pass
through untouched, so every difficulty level stays represented. Note above that
the rating span is identical before and after.

### It preserves the ordering the query path depends on

The shrink writes its final table with a single `INSERT ... ORDER BY rating ASC`,
exactly as the import does — so the id/rating correlation described in *Why the
import sorts by rating* holds here too, and the API needs no changes to serve
this database. Ids come out contiguous (1..N) with no rating inversions.

Any future change to this script must keep that single ordered INSERT. Sampling
into the final table in band order, or appending bands incrementally, would
break the correlation silently: queries would still return rows, just the wrong
ones for the requested rating range.

## Running

```bash
npm run dev     # auto-restarts on file changes
npm start       # plain start
```

The frontend is served separately — open the repo root with any static server
(Live Server, `npx serve`, etc.). `assets/js/api-client.js` points at
`http://localhost:3001/api` automatically when the page is loaded from
localhost, so no manual switching is needed.

## Configuration

All configuration comes from environment variables — see `.env.example` for
the full list. Locally they are read from `.env` (gitignored). In production
they are set in the host's dashboard; no `.env` file is ever deployed.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Liveness + database check. Returns 503 if the DB is unreachable. |
| `GET /api/puzzles/stats` | Total puzzle count. |
| `GET /api/puzzles/random?minRating=&maxRating=` | Random puzzle in a rating band. Defaults 400–2800. 404 if the band is empty. |
| `GET /api/puzzles/:id` | Single puzzle by its Lichess id. |

Puzzle response shape:

```json
{
  "id": "00008",
  "fen": "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
  "moves": ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
  "rating": 1862,
  "themes": ["crushing", "hangingPiece", "long", "middlegame"]
}
```

`moves[0]` is the opponent's setup move — the FEN is the position *before* it.
Play it automatically, then the solver's task begins at `moves[1]`, with
even-indexed moves being the opponent's forced replies.

Errors use a consistent shape: `{ "error": "code", "details": ... }`.

## Deployment notes

Runs on any host that provides Node plus a **persistent volume** (the SQLite
file must survive redeploys). Set `DB_PATH` to a path on that volume, set
`CORS_ORIGINS` to the real site origin, and leave `PORT` to the host.

The database is too large to commit, so it is built locally and uploaded:

1. Run the import to build `cheese.sqlite` (~1GB).
2. Run the shrink to derive `cheese.small.sqlite` (~296MB).
3. Upload **only the small database** to the volume.
4. Point `DB_PATH` at it, e.g. `DB_PATH=/data/cheese.small.sqlite`.

Do not skip the shrink and upload the full database instead — at ~1GB it does
not fit a 500MB volume, and the failure surfaces as a partial upload or an
out-of-space error rather than anything that names the real cause.

Both files are reproducible from the parquet by re-running the two commands
above, which is the recovery path if the volume is ever lost.
