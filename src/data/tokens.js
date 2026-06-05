// Curated token thumbnails served from /public/tokens (64x64 pixel renders).
// Regenerate the pool by copying more PNGs from art-pipeline/output/tokens.
const TOKEN_COUNT = 150;

export const TOKEN_IMAGES = Array.from(
  { length: TOKEN_COUNT },
  (_, i) => `/tokens/${String(i + 1).padStart(4, "0")}.png`
);

/** Deterministic-ish shuffle so the grid/marquee don't read as sequential. */
export function pickTokens(count, offset = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(TOKEN_IMAGES[(i * 7 + offset) % TOKEN_IMAGES.length]);
  }
  return out;
}
