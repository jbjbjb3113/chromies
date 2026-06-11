#!/usr/bin/env node
// generate-serc-1of1.js — SERC 1/1: Normie #4354 rendered through the Chromies pipeline.
//
// Fetches Normie #4354's on-chain SVG from the Normies API, parses the 40x40
// two-tone pixel grid, scales it up to the full 64x64 Chromies canvas with
// nearest-neighbor sampling (hard pixel edges, no interpolation), maps the two
// Normie colors onto Chromies palette slots (dark -> slot 1, bg -> slot 0),
// and renders via the Chromies renderer with the SIGNAL palette.
//
// Usage: node generate-serc-1of1.js

const fs = require("fs");
const path = require("path");
const { PALETTES, SETTINGS } = require("./chromies-config.js");
const { renderPNG, upscalePNG } = require("./generate.js");

const NORMIE_ID = 4354;
const API = "https://api.normies.art";
const NORMIE_SIZE = 40;
const GRID = SETTINGS.grid; // 64

const DARK = "#48494b"; // drawn pixel -> palette slot 1 (mask_dark)
const SLOT_BG = 0;
const SLOT_DARK = 1;

async function fetchNormieSVG(id) {
  // Primary: direct SVG endpoint
  try {
    const res = await fetch(`${API}/normie/${id}/image.svg`);
    if (res.ok) return await res.text();
    console.warn(`  image.svg returned ${res.status}, falling back to metadata`);
  } catch (err) {
    console.warn(`  image.svg fetch failed (${err.message}), falling back to metadata`);
  }

  // Fallback: metadata embeds the same SVG as base64
  const res = await fetch(`${API}/normie/${id}/metadata`);
  if (!res.ok) throw new Error(`metadata endpoint returned ${res.status}`);
  const meta = await res.json();
  const prefix = "data:image/svg+xml;base64,";
  if (!meta.image?.startsWith(prefix)) throw new Error("metadata image is not base64 SVG");
  return Buffer.from(meta.image.slice(prefix.length), "base64").toString("utf8");
}

// Parse the RLE row-scan SVG: every drawn run is a 1px-high <rect> filled DARK.
function parseSVGToGrid(svg) {
  const grid = new Uint8Array(NORMIE_SIZE * NORMIE_SIZE); // 0 = bg, 1 = drawn
  const rectRe = /<rect\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"\s+fill="([^"]+)"\s*\/>/g;
  let m;
  let drawnRects = 0;
  while ((m = rectRe.exec(svg)) !== null) {
    const [, xs, ys, ws, hs, fill] = m;
    if (fill.toLowerCase() !== DARK) continue; // skip background rect
    const x = Number(xs), y = Number(ys), w = Number(ws), h = Number(hs);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        grid[(y + dy) * NORMIE_SIZE + (x + dx)] = 1;
      }
    }
    drawnRects++;
  }
  if (drawnRects === 0) throw new Error("no drawn rects found — SVG format unexpected");
  return grid;
}

// Nearest-neighbor upscale 40x40 -> 64x64: each destination pixel samples the
// nearest source pixel, preserving hard pixel-art edges.
function buildChromieBuffer(normieGrid) {
  const buf = Buffer.alloc(GRID * GRID, SLOT_BG);
  for (let y = 0; y < GRID; y++) {
    const sy = Math.min(NORMIE_SIZE - 1, Math.floor((y * NORMIE_SIZE) / GRID));
    for (let x = 0; x < GRID; x++) {
      const sx = Math.min(NORMIE_SIZE - 1, Math.floor((x * NORMIE_SIZE) / GRID));
      if (normieGrid[sy * NORMIE_SIZE + sx] === 1) {
        buf[y * GRID + x] = SLOT_DARK;
      }
    }
  }
  return buf;
}

async function main() {
  console.log(`SERC 1/1 — Normie #${NORMIE_ID} through the Chromies renderer`);

  const svg = await fetchNormieSVG(NORMIE_ID);
  const grid = parseSVGToGrid(svg);
  const drawn = grid.reduce((s, v) => s + v, 0);
  console.log(`  parsed ${NORMIE_SIZE}x${NORMIE_SIZE} grid — ${drawn} drawn pixels`);

  const buf = buildChromieBuffer(grid);
  const palette = PALETTES.SIGNAL;
  const pngBuf = renderPNG(buf, palette);

  const tokensDir = path.join(SETTINGS.outputDir, "tokens");
  if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir, { recursive: true });
  fs.writeFileSync(path.join(tokensDir, "serc_normie_chromie.png"), pngBuf);
  fs.writeFileSync(path.join(tokensDir, "serc_normie_chromie_1024.png"), upscalePNG(pngBuf, 16));

  console.log("  wrote tokens/serc_normie_chromie.png + serc_normie_chromie_1024.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
