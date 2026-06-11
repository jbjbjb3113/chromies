#!/usr/bin/env node
// generate-normie-chromies.js — batch-convert Normies into Chromies renders.
//
// For each token ID: fetches the 1600-char binary pixel string (40x40) from
// the Normies API, nearest-neighbor scales it to 64x64, maps 1 -> slot 1
// (mask_dark) and 0 -> slot 0 (background), and renders PNG/1024 PNG/SVG
// through the Chromies renderer with the SIGNAL palette.
//
// Usage: node generate-normie-chromies.js

const fs = require("fs");
const path = require("path");
const { PALETTES, SETTINGS } = require("./chromies-config.js");
const { renderPNG, renderSVG, upscalePNG } = require("./generate.js");

const TOKEN_IDS = [6576, 45, 603, 5974, 4354, 7409];
const API = "https://api.normies.art";
const NORMIE_SIZE = 40;
const GRID = SETTINGS.grid; // 64
const SLOT_BG = 0;
const SLOT_DARK = 1;

async function fetchPixels(id) {
  const res = await fetch(`${API}/normie/${id}/pixels`);
  if (!res.ok) throw new Error(`pixels endpoint returned ${res.status}`);
  const pixels = (await res.text()).trim();
  if (pixels.length !== NORMIE_SIZE * NORMIE_SIZE) {
    throw new Error(`expected ${NORMIE_SIZE * NORMIE_SIZE} chars, got ${pixels.length}`);
  }
  return pixels;
}

// Nearest-neighbor upscale 40x40 -> 64x64, mapping the two-tone bitmap onto
// Chromies palette slots.
function buildChromieBuffer(pixels) {
  const buf = Buffer.alloc(GRID * GRID, SLOT_BG);
  for (let y = 0; y < GRID; y++) {
    const sy = Math.min(NORMIE_SIZE - 1, Math.floor((y * NORMIE_SIZE) / GRID));
    for (let x = 0; x < GRID; x++) {
      const sx = Math.min(NORMIE_SIZE - 1, Math.floor((x * NORMIE_SIZE) / GRID));
      if (pixels[sy * NORMIE_SIZE + sx] === "1") {
        buf[y * GRID + x] = SLOT_DARK;
      }
    }
  }
  return buf;
}

async function main() {
  const palette = PALETTES.SIGNAL;
  const tokensDir = path.join(SETTINGS.outputDir, "tokens");
  if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir, { recursive: true });

  console.log(`Converting ${TOKEN_IDS.length} Normies to Chromies (SIGNAL palette)\n`);

  let done = 0;
  for (const id of TOKEN_IDS) {
    process.stdout.write(`  [${++done}/${TOKEN_IDS.length}] Normie #${id} — fetching... `);
    const pixels = await fetchPixels(id);
    const drawn = [...pixels].filter((c) => c === "1").length;
    process.stdout.write(`${drawn} px — rendering... `);

    const buf = buildChromieBuffer(pixels);
    const pngBuf = renderPNG(buf, palette);
    fs.writeFileSync(path.join(tokensDir, `normie_${id}.png`), pngBuf);
    fs.writeFileSync(path.join(tokensDir, `normie_${id}_1024.png`), upscalePNG(pngBuf, 16));
    fs.writeFileSync(path.join(tokensDir, `normie_${id}.svg`), renderSVG(buf, palette));
    console.log(`wrote normie_${id}.{png,_1024.png,svg}`);
  }

  console.log(`\nDone — ${done} Normies converted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
