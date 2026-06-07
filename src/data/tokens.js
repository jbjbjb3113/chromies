// Curated token thumbnails served from /public/tokens (64x64 pixel renders).
// Regenerate the pool by copying more PNGs from art-pipeline/output/tokens.
const TOKEN_COUNT = 150;

export const TOKEN_IMAGES = Array.from(
  { length: TOKEN_COUNT },
  (_, i) => `/tokens/${String(i + 1).padStart(4, "0")}.png`
);

/** Landing hero foreground scroll — loaded from /foreground/manifest.json at runtime. */
export const FOREGROUND_MANIFEST_URL = "/foreground/manifest.json";

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
