// ============================================================================
// legendary-finals.js
// Verbatim JB final renders for Normie Legendary tokens (9 assigned IDs).
// Files live in legendary-finals/ as zero-padded token IDs: 0045.png, 0264.png, …
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS } = require("./chromies-config");
const {
  isLegendaryToken,
  getLegendaryForToken,
  LEGENDARY_TOKEN_IDS,
} = require("./legendary-token-ids");

const LEGENDARY_FINALS_DIR = path.join(__dirname, "legendary-finals");
const GRID = SETTINGS.grid;
const PX = GRID * GRID;

function legendaryFinalPath(tokenId) {
  return path.join(LEGENDARY_FINALS_DIR, `${String(tokenId).padStart(4, "0")}.png`);
}

function legendaryFinalExists(tokenId) {
  return fs.existsSync(legendaryFinalPath(tokenId));
}

function rgbKey(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toLowerCase();
}

function buildPaletteRgbMap(paletteKey) {
  const palette = PALETTES[paletteKey];
  if (!palette || !Array.isArray(palette.colors) || palette.colors.length !== 16) {
    throw new Error(`Legendary palette ${paletteKey} missing or invalid (expected 16 colors)`);
  }
  const map = new Map();
  for (let i = 0; i < palette.colors.length; i++) {
    const hex = palette.colors[i].toLowerCase();
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    map.set(rgbKey(r, g, b), i);
  }
  return { map, palette };
}

/**
 * Load a legendary-final PNG into a 64×64 palette-index buffer.
 * Hard-fails if the file is missing or any pixel is not an exact palette color.
 */
function loadLegendaryFinalBuffer(tokenId, paletteKey = null) {
  if (!isLegendaryToken(tokenId)) {
    throw new Error(`loadLegendaryFinalBuffer called for non-legendary token #${tokenId}`);
  }

  const legendary = getLegendaryForToken(tokenId);
  const expectedPalette = legendary.palette;
  if (paletteKey != null && paletteKey !== expectedPalette) {
    throw new Error(
      `Legendary #${tokenId} palette mismatch: expected ${expectedPalette}, got ${paletteKey}`,
    );
  }

  const filePath = legendaryFinalPath(tokenId);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Legendary final render missing for token #${tokenId} (${legendary.artist}, palette ${expectedPalette}).\n` +
      `  Expected: ${filePath}\n` +
      `  No placeholder fallback — add JB's 64×64 PNG to legendary-finals/ before generation.`,
    );
  }

  const png = PNG.sync.read(fs.readFileSync(filePath));
  if (png.width !== GRID || png.height !== GRID) {
    throw new Error(
      `Legendary final #${tokenId}: expected ${GRID}×${GRID}, got ${png.width}×${png.height} (${filePath})`,
    );
  }

  const { map: rgbMap, palette } = buildPaletteRgbMap(expectedPalette);
  const buf = new Uint8Array(PX);
  const colorUsage = Array.from({ length: 16 }, (_, i) => ({
    index: i,
    hex: palette.colors[i],
    count: 0,
  }));

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const px = y * GRID + x;
      const o = px * 4;
      const r = png.data[o];
      const g = png.data[o + 1];
      const b = png.data[o + 2];
      const a = png.data[o + 3];

      if (a === 0) {
        buf[px] = 0;
        colorUsage[0].count += 1;
        continue;
      }

      const idx = rgbMap.get(rgbKey(r, g, b));
      if (idx === undefined) {
        throw new Error(
          `Legendary final #${tokenId} palette violation at (${x}, ${y}): ` +
          `RGB(${r}, ${g}, ${b}) not in ${expectedPalette} — ${filePath}`,
        );
      }
      buf[px] = idx;
      colorUsage[idx].count += 1;
    }
  }

  return {
    buf,
    colorUsage,
    sourcePath: filePath,
    paletteKey: expectedPalette,
    legendary,
  };
}

function formatColorUsage(colorUsage) {
  return colorUsage
    .filter((c) => c.count > 0)
    .map((c) => `idx ${c.index} ${c.hex} ×${c.count}`)
    .join(", ");
}

function loadLegendaryFinalPngBuffer(tokenId) {
  const filePath = legendaryFinalPath(tokenId);
  return fs.readFileSync(filePath);
}

module.exports = {
  LEGENDARY_FINALS_DIR,
  LEGENDARY_TOKEN_IDS,
  legendaryFinalPath,
  legendaryFinalExists,
  loadLegendaryFinalBuffer,
  loadLegendaryFinalPngBuffer,
  formatColorUsage,
  buildPaletteRgbMap,
};
