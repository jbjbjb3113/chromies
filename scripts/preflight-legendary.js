#!/usr/bin/env node
// ============================================================================
// preflight-legendary.js — SCRATCH validator for WIP legendary repaints.
// Same palette rules as loadLegendaryFinalBuffer; friendlier violation report.
//
// Usage: node scripts/preflight-legendary.js <png> <tokenId>
// Exit 0 = clean, 1 = violations (fix list printed)
// ============================================================================

import path from "path";
import { validateLegendaryPng, getLegendaryForToken } from "./lib/legendary-paint-kit.js";

function usage() {
  console.log(`Usage: node scripts/preflight-legendary.js <png> <tokenId>

Validates a 64×64 WIP PNG against the token's registry palette.
Transparent pixels (alpha=0) count as palette index 0.
Opaque pixels must match an exact registry RGB.`);
}

function main() {
  const pngArg = process.argv[2];
  const tokenArg = process.argv[3];

  if (!pngArg || !tokenArg || process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    process.exit(pngArg ? 0 : 1);
  }

  const tokenId = Number(tokenArg);
  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    console.error(`Invalid tokenId: ${tokenArg}`);
    process.exit(1);
  }

  const legendary = getLegendaryForToken(tokenId);
  if (!legendary) {
    console.error(`Token #${tokenId} is not one of the 9 Normie Legendary assignments.`);
    process.exit(1);
  }

  const pngPath = path.resolve(pngArg);
  const result = validateLegendaryPng(pngPath, tokenId);

  console.log(`Preflight: ${pngPath}`);
  console.log(`Token #${tokenId} — ${legendary.artist} — palette ${result.paletteKey}`);
  console.log(`Non-zero pixels: ${result.nonZero}`);

  if (result.ok) {
    console.log("\nPASS — all opaque pixels match registry palette exactly.");
    process.exit(0);
  }

  console.log(`\nFAIL — ${result.violations.length} non-conforming pixel(s):\n`);
  const maxShow = 200;
  for (let i = 0; i < Math.min(result.violations.length, maxShow); i++) {
    const v = result.violations[i];
    console.log(
      `  (${v.x}, ${v.y})  found ${v.found.hex} rgb(${v.found.r},${v.found.g},${v.found.b})` +
      `  → nearest idx ${v.nearest.index} ${v.nearest.hex}`,
    );
  }
  if (result.violations.length > maxShow) {
    console.log(`  … and ${result.violations.length - maxShow} more`);
  }

  console.log("\nFix every listed pixel to an exact registry swatch (or transparent).");
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message || err}`);
  process.exit(1);
}
