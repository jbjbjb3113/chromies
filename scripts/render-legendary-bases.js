#!/usr/bin/env node
// ============================================================================
// render-legendary-bases.js — SCRATCH / painting kit only.
// Renders pre-7f14456 composites (legendary head + rolled body + NORMIE palette)
// to derived_assets/legendary-bases/NNNN_base.png — NOT valid as finals.
//
// Usage: node scripts/render-legendary-bases.js
// ============================================================================

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import {
  ART_PIPELINE_DIR,
  REPO_ROOT,
  LEGENDARY_ASSIGNMENTS,
  pad4,
  writePaletteGpl,
  printTokenCard,
} from "./lib/legendary-paint-kit.js";

const require = createRequire(path.join(ART_PIPELINE_DIR, "package.json"));
const OUT_DIR = path.join(REPO_ROOT, "derived_assets", "legendary-bases");

function main() {
  process.chdir(ART_PIPELINE_DIR);

  const { PALETTES, SETTINGS } = require("./chromies-config");
  const {
    pickCharacter,
    pickPalette,
    pickTokenVariants,
    loadPickBuffers,
    finalizeTokenTraits,
    buildPhase3Effects,
    compositeChromie,
    renderPNG,
  } = require("./generate");

  const traitsPath = path.join(ART_PIPELINE_DIR, SETTINGS.traitsFile);
  const traits = JSON.parse(fs.readFileSync(traitsPath, "utf8"));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Legendary painting kit — base renders (scratch, not finals)\n");
  console.log(`Output: ${OUT_DIR}\n`);

  for (const assignment of LEGENDARY_ASSIGNMENTS) {
    const { tokenId } = assignment;
    const character = pickCharacter(tokenId);
    const paletteKey = pickPalette(tokenId, traits, character);

    // Pre-7f14456 path: composite with buffers loaded (skip legendary-finals injection).
    const picks = pickTokenVariants(tokenId, traits, new Set(), character, false);
    const { renderPicks } = finalizeTokenTraits(tokenId, picks, traits, character);
    loadPickBuffers(renderPicks, traits, character);

    const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);
    const buf = compositeChromie(renderPicks, traits, tokenId, driftMap);
    const palette = PALETTES[paletteKey];
    if (!palette) {
      throw new Error(`Missing palette ${paletteKey} for token #${tokenId}`);
    }

    const pngBuf = renderPNG(buf, palette);
    const basePath = path.join(OUT_DIR, `${pad4(tokenId)}_base.png`);
    const gplPath = path.join(OUT_DIR, `${pad4(tokenId)}_palette.gpl`);

    fs.writeFileSync(basePath, pngBuf);
    writePaletteGpl(paletteKey, gplPath);

    printTokenCard(assignment);
    console.log(`  wrote ${path.relative(REPO_ROOT, basePath)}`);
    console.log(`  wrote ${path.relative(REPO_ROOT, gplPath)}`);
  }

  console.log("\n─".repeat(60));
  console.log(`Done — ${LEGENDARY_ASSIGNMENTS.length} base PNGs + palette GPLs`);
  console.log("These *_base.png files are painting starting points only.");
  console.log("Drop finished art into legendary-finals/ as NNNN.png after preflight.");
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
