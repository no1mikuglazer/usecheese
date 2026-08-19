/* Derives the Opening Explorer's served data file from the five source ECO
 * files, for the same reason server/scripts/shrink-database.js exists: the
 * source is far larger than what actually gets used.
 *
 * library/eco/eco{A..E}.json are FEN-keyed objects (~4.4MB total, 12,379
 * entries) carrying `src`, `scid`, `aliases`, `isEcoRoot` and `added`
 * alongside the three fields the page reads. The FEN keys themselves are
 * discarded on load too — the explorer is a name/ECO list, it never looks a
 * position up. So the browser was downloading and parsing roughly six times
 * the data it needed, on a page whose first paint depends on all of it.
 *
 * This writes library/eco/openings.json: one flat array of
 * [eco, name, moves] tuples, in the same A→B→C→D→E order the page already
 * displayed (JSON object keys preserve insertion order, so the resulting
 * list is identical to what the five-file loader produced).
 *
 * Tuples rather than objects because the key names would otherwise repeat
 * 12,379 times — about 500KB of pure `"eco":`/`"name":`/`"moves":` overhead
 * in a file whose entire point is being small. The loader gives them names
 * again in one pass. Measured on the real data:
 *
 *     source, 5 files          4.50MB raw   0.40MB gzip
 *     objects                  1.68MB raw   0.16MB gzip
 *     tuples (this)            1.42MB raw   0.15MB gzip
 *
 * Note the gzip column: Cloudflare compresses this on the way out, and
 * repeated JSON keys compress extremely well, so the transfer saving is real
 * but modest (0.40MB -> 0.15MB). The saving that actually matters is the raw
 * one — 4.5MB down to 1.4MB is what the browser has to parse and allocate
 * before the explorer can paint, and it drops five requests to one.
 *
 * Deliberately NOT precomputed here: a lowercase copy of each name for the
 * search filter. It costs ~0.7MB in the file to save a pass the loader can do
 * in a millisecond, so the loader does it instead (see loadOpenings()).
 *
 * The five source files no longer live in library/eco/ — this site has no
 * build step, so anything in the repo is what Cloudflare Pages deploys, and
 * 4.3MB of files nothing ever fetches was dead weight sitting in the public
 * tree for no benefit. They're still recoverable from git history (the
 * commit that deleted them) if openings.json ever needs to be regenerated
 * with different source data; restore them to library/eco/ temporarily, run
 * this script, then remove them again.
 *
 * Usage (from the repository root):
 *   node scripts/shrink-eco.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const ecoDir = path.join(repoRoot, "library", "eco");

const SOURCE_FILES = ["ecoA.json", "ecoB.json", "ecoC.json", "ecoD.json", "ecoE.json"];
const TARGET_FILE = path.join(ecoDir, "openings.json");

function readEntries(fileName) {
  const raw = fs.readFileSync(path.join(ecoDir, fileName), "utf8");
  const data = JSON.parse(raw);
  // Tolerate both shapes, exactly as the page's own loader did — the sources
  // are all FEN-keyed objects today, but an array would be equally valid.
  return Array.isArray(data) ? data : Object.values(data);
}

function main() {
  const openings = [];

  for (const fileName of SOURCE_FILES) {
    for (const entry of readEntries(fileName)) {
      // Same guard the page used: an entry with no name has nothing to show.
      if (!entry || !entry.name) continue;

      // Trimmed: a handful of source rows carry trailing whitespace (6 eco
      // codes, 9 names, 419 move strings), which the old loader passed
      // straight through to the card markup. Harmless but visible.
      openings.push([
        (entry.eco || "").trim(),
        entry.name.trim(),
        (entry.moves || "").trim(),
      ]);
    }
  }

  fs.writeFileSync(TARGET_FILE, JSON.stringify(openings), "utf8");

  const sourceBytes = SOURCE_FILES.reduce(
    (total, f) => total + fs.statSync(path.join(ecoDir, f)).size,
    0,
  );
  const targetBytes = fs.statSync(TARGET_FILE).size;
  const percent = Math.round((1 - targetBytes / sourceBytes) * 100);

  console.log(`[eco] ${openings.length.toLocaleString()} openings`);
  console.log(
    `[eco] ${(sourceBytes / 1e6).toFixed(2)}MB (${SOURCE_FILES.length} files) ` +
      `-> ${(targetBytes / 1e6).toFixed(2)}MB (1 file), ${percent}% smaller`,
  );
  console.log(`[eco] wrote ${path.relative(repoRoot, TARGET_FILE)}`);
}

main();
