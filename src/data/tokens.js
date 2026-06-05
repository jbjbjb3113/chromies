// Curated token thumbnails served from /public/tokens (64x64 pixel renders).
// Regenerate the pool by copying more PNGs from art-pipeline/output/tokens.
const TOKEN_COUNT = 150;

export const TOKEN_IMAGES = Array.from(
  { length: TOKEN_COUNT },
  (_, i) => `/tokens/${String(i + 1).padStart(4, "0")}.png`
);

export const TOKEN_CELL_PX = 64;

/** Dense tile list covering a viewport — cycles all TOKEN_IMAGES. */
export function buildTokenGridTiles(width, height, cell = TOKEN_CELL_PX) {
  const cols = Math.ceil(width / cell) + 4;
  const rows = Math.ceil(height / cell) + 4;
  const count = cols * rows;
  const tiles = [];
  for (let i = 0; i < count; i++) {
    tiles.push(TOKEN_IMAGES[i % TOKEN_IMAGES.length]);
  }
  return tiles;
}

/** Deterministic-ish shuffle so the grid/marquee don't read as sequential. */
export function pickTokens(count, offset = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(TOKEN_IMAGES[(i * 7 + offset) % TOKEN_IMAGES.length]);
  }
  return out;
}

export const PORTRAIT_STRIP_CELL_PX = 128;

/** Curated mix — palettes, types, hair, and gender variety for the landing strip. */
export const PORTRAIT_STRIP_IDS = [
  "0042", "0139", "0010", "0001", "0015", "0076", "0028", "0086", "0062", "0048",
  "0123", "0128", "0094", "0038", "0018", "0056", "0068", "0007", "0034", "0045",
  "0103", "0121", "0135", "0143",
];

export const PORTRAIT_STRIP_IMAGES = PORTRAIT_STRIP_IDS.map(
  (id) => `/tokens/${id}.png`
);
