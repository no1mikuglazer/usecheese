/* Curated profile-customization options — the single source of truth for
 * both server-side validation (users.schema.js) and the frontend's edit
 * form (served via GET /api/profile-options, assets/js/api-client.js's
 * fetchProfileOptions()). Keeping one list here means the frontend never
 * hardcodes a copy that could drift out of sync — there's no build step to
 * keep two copies aligned, so there is only ever one.
 *
 * The opening list is a curated ~40 well-known openings, not derived from
 * library/eco/ — that's 4.4MB across five FEN-keyed JSON files, meant for
 * position lookup, not a dropdown of names.
 */

// Keys, not raw CSS — the frontend maps each key to a gradient it controls,
// so a stored value can never resolve to something broken or off-brand.
export const BANNERS = [
  { key: "default", label: "Default" },
  { key: "blue", label: "Blue" },
  { key: "green", label: "Green" },
  { key: "purple", label: "Purple" },
  { key: "amber", label: "Amber" },
  { key: "rose", label: "Rose" },
];

export const OPENINGS = [
  "Italian Game",
  "Ruy Lopez",
  "Sicilian Defense",
  "French Defense",
  "Caro-Kann Defense",
  "Scandinavian Defense",
  "Pirc Defense",
  "Modern Defense",
  "Alekhine's Defense",
  "Scotch Game",
  "Vienna Game",
  "King's Gambit",
  "English Opening",
  "Queen's Gambit",
  "Queen's Gambit Declined",
  "Queen's Gambit Accepted",
  "Slav Defense",
  "Semi-Slav Defense",
  "King's Indian Defense",
  "Nimzo-Indian Defense",
  "Grünfeld Defense",
  "Catalan Opening",
  "London System",
  "Réti Opening",
  "Bird's Opening",
  "Dutch Defense",
  "Benoni Defense",
  "Benko Gambit",
  "Petrov's Defense",
  "Philidor Defense",
  "Four Knights Game",
  "Giuoco Piano",
  "Berlin Defense",
  "Sicilian Najdorf",
  "Sicilian Dragon",
  "Sicilian Accelerated Dragon",
  "Fried Liver Attack",
  "Nimzowitsch Defense",
  "Trompowsky Attack",
  "Colle System",
];

export const BANNER_KEYS = new Set(BANNERS.map((b) => b.key));
export const OPENING_NAMES = new Set(OPENINGS);
