// Scratch utilities for legendary repaint workflow — not production.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { PNG } = require("../../art-pipeline/node_modules/pngjs");
const { PALETTES, SETTINGS } = require("../../art-pipeline/chromies-config");
const {
  LEGENDARY_ASSIGNMENTS,
  getLegendaryForToken,
} = require("../../art-pipeline/legendary-token-ids");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

function rgbKey(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toLowerCase();
}

function hexToRgb(hex) {
  const h = hex.toLowerCase();
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Same rgb map as legendary-finals.js loadLegendaryFinalBuffer. */
function buildPaletteRgbMap(paletteKey) {
  const palette = PALETTES[paletteKey];
  if (!palette || !Array.isArray(palette.colors) || palette.colors.length !== 16) {
    throw new Error(`Palette ${paletteKey} missing or invalid (expected 16 colors)`);
  }
  const map = new Map();
  const entries = [];
  for (let i = 0; i < palette.colors.length; i++) {
    const hex = palette.colors[i].toLowerCase();
    const rgb = hexToRgb(hex);
    map.set(rgbKey(rgb.r, rgb.g, rgb.b), i);
    entries.push({ index: i, hex, rgb });
  }
  return { map, palette, entries };
}

function nearestPaletteEntry(entries, r, g, b) {
  let best = entries[0];
  let bestDist = Infinity;
  for (const entry of entries) {
    const d = colorDistance({ r, g, b }, entry.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best;
}

function pad4(tokenId) {
  return String(tokenId).padStart(4, "0");
}

/** Registry-sourced GIMP palette; index 0 exported as transparent for Aseprite. */
function writePaletteGpl(paletteKey, outPath) {
  const { palette } = buildPaletteRgbMap(paletteKey);
  const lines = [
    "GIMP Palette",
    `Name: ${paletteKey}`,
    "Channels: RGBA",
    "#",
  ];

  for (let i = 0; i < 16; i++) {
    const hex = palette.colors[i].toLowerCase();
    if (i === 0) {
      lines.push(`  0   0   0   0\tidx ${i} transparent (registry ${hex})`);
      continue;
    }
    const { r, g, b } = hexToRgb(hex);
    lines.push(
      `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)} 255\tidx ${i} ${hex}`,
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`);
}

function formatSwatchList(paletteKey) {
  const { palette } = buildPaletteRgbMap(paletteKey);
  return palette.colors
    .map((hex, i) => (i === 0 ? `${hex} (→ transparent in .gpl)` : hex))
    .join(", ");
}

function printTokenCard(assignment) {
  const { tokenId, artist, palette } = assignment;
  console.log("─".repeat(60));
  console.log(`Token #${tokenId}  |  ${artist}`);
  console.log(`Palette: ${palette}`);
  console.log(`Swatches: ${formatSwatchList(palette)}`);
  console.log(`Base:     ${pad4(tokenId)}_base.png`);
  console.log(`Palette:  ${pad4(tokenId)}_palette.gpl`);
}

/**
 * Validate PNG against registry palette (same rules as loadLegendaryFinalBuffer).
 * Returns { ok, violations[], nonZero, colorUsage[] }
 */
function validateLegendaryPng(pngPath, tokenId) {
  const legendary = getLegendaryForToken(tokenId);
  if (!legendary) {
    throw new Error(`Token #${tokenId} is not a Normie Legendary assignment`);
  }

  const { map: rgbMap, palette, entries } = buildPaletteRgbMap(legendary.palette);
  const png = PNG.sync.read(fs.readFileSync(pngPath));

  if (png.width !== GRID || png.height !== GRID) {
    throw new Error(`Expected ${GRID}×${GRID}, got ${png.width}×${png.height} (${pngPath})`);
  }

  const violations = [];
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
        colorUsage[0].count += 1;
        continue;
      }

      const idx = rgbMap.get(rgbKey(r, g, b));
      if (idx === undefined) {
        const nearest = nearestPaletteEntry(entries, r, g, b);
        violations.push({
          x,
          y,
          found: { r, g, b, hex: rgbKey(r, g, b) },
          nearest: { index: nearest.index, hex: nearest.hex },
        });
        continue;
      }

      colorUsage[idx].count += 1;
    }
  }

  const nonZero = colorUsage.reduce((n, c) => n + (c.index === 0 ? 0 : c.count), 0);

  return {
    ok: violations.length === 0,
    tokenId,
    paletteKey: legendary.palette,
    artist: legendary.artist,
    violations,
    nonZero,
    colorUsage,
  };
}

const ART_PIPELINE_DIR = path.join(__dirname, "..", "..", "art-pipeline");
const REPO_ROOT = path.join(__dirname, "..", "..");

export {
  ART_PIPELINE_DIR,
  REPO_ROOT,
  LEGENDARY_ASSIGNMENTS,
  GRID,
  pad4,
  buildPaletteRgbMap,
  writePaletteGpl,
  formatSwatchList,
  printTokenCard,
  validateLegendaryPng,
  getLegendaryForToken,
};
