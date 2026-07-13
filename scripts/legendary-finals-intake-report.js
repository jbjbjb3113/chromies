#!/usr/bin/env node
/** One-shot intake report: format sanity + preflight + violation triage + round-trip. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { validateLegendaryPng, buildPaletteRgbMap } from "./lib/legendary-paint-kit.js";

const GRID = 64;

function rgbKeyLocal(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toLowerCase();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../art-pipeline/package.json"));
const { PNG } = require("pngjs");
const { PALETTES } = require("../art-pipeline/chromies-config");
const { verifyRoundTrip } = require("../art-pipeline/verify-legendary-finals");
const { buildMintRecord } = require("../art-pipeline/bridge-mint-data");

const FINALS = path.join(__dirname, "../art-pipeline/legendary-finals");
const TRAITS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../art-pipeline/traits.json"), "utf8"),
);

const INTAKE = [
  { tokenId: 45, file: "0045.png", palette: "NORMIE_SNOWFRO", artist: "Snowfro" },
  { tokenId: 264, file: "0264.png", palette: "NORMIE_TIMPERS", artist: "Timpers" },
  { tokenId: 603, file: "0603.png", palette: "NORMIE_ACK", artist: "a.c.k." },
  { tokenId: 1173, file: "1173.png", palette: "NORMIE_DEEKAY", artist: "Deekay" },
  { tokenId: 1294, file: "1294.png", palette: "NORMIE_PIV", artist: "PIV" },
  { tokenId: 4698, file: "4698.png", palette: "NORMIE_JACKBUTCHER", artist: "Jack Butcher" },
];

const STRAY_MAX = 24;

function analyzeFormat(pngPath) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const partial = [];
  let transparent = 0;
  let opaque = 0;
  const distinct = new Map();

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o];
      const g = png.data[o + 1];
      const b = png.data[o + 2];
      const a = png.data[o + 3];
      if (a !== 0 && a !== 255) partial.push({ x, y, a });
      if (a === 0) transparent += 1;
      else {
        opaque += 1;
        const key = rgbKeyLocal(r, g, b);
        distinct.set(key, (distinct.get(key) || 0) + 1);
      }
    }
  }

  const bgMode =
    transparent > opaque * 0.05 ? "transparent background (index 0 via alpha=0)" : "full opaque background";

  return {
    width: png.width,
    height: png.height,
    partialAlpha: partial,
    transparentPixels: transparent,
    opaquePixels: opaque,
    distinctOpaqueColors: [...distinct.entries()].map(([hex, count]) => ({ hex, count })),
    bgMode,
  };
}

function classifyViolations(violations, format, paletteKey) {
  if (violations.length === 0) return null;

  const { entries, palette } = buildPaletteRgbMap(paletteKey);
  const registrySet = new Set(palette.colors.map((h) => h.toLowerCase()));
  const foundColors = new Map();
  for (const v of violations) {
    foundColors.set(v.found.hex, (foundColors.get(v.found.hex) || 0) + 1);
  }

  const distinctArt = format.distinctOpaqueColors.map((c) => c.hex);
  const registryUsed = palette.colors.filter((_, i) => i > 0).length;

  if (violations.length <= STRAY_MAX) {
    return {
      kind: "STRAY",
      violations,
    };
  }

  return {
    kind: "SYSTEMATIC",
    violationCount: violations.length,
    artDistinctColors: distinctArt,
    artColorInventory: format.distinctOpaqueColors,
    registryPalette: palette.colors.map((hex, i) => ({ index: i, hex })),
    registrySlotsDefined: 16,
    registrySlotsUsedInArt: distinctArt.filter((h) => registrySet.has(h)).length,
    offRegistryColors: distinctArt.filter((h) => !registrySet.has(h)),
    foundInViolations: [...foundColors.entries()].map(([hex, count]) => ({ hex, count })),
  };
}

function main() {
  console.log("=== Legendary finals intake report ===\n");

  for (const item of INTAKE) {
    const pngPath = path.join(FINALS, item.file);
    console.log(`── #${item.tokenId} ${item.artist} (${item.file}) ──`);

    if (!fs.existsSync(pngPath)) {
      console.log("  MISSING canonical file\n");
      continue;
    }

    const fmt = analyzeFormat(pngPath);
    console.log(`  Format: ${fmt.width}×${fmt.height}`);
    if (fmt.width !== 64 || fmt.height !== 64) {
      console.log("  ** FAIL format: expected 64×64");
    }
    if (fmt.partialAlpha.length > 0) {
      console.log(`  ** FAIL partial alpha: ${fmt.partialAlpha.length} pixel(s)`);
      for (const p of fmt.partialAlpha.slice(0, 10)) {
        console.log(`     (${p.x},${p.y}) alpha=${p.a}`);
      }
    } else {
      console.log("  Alpha: binary 0/255 only ✓");
    }
    console.log(`  Background: ${fmt.bgMode}`);
    console.log(`  Opaque px: ${fmt.opaquePixels} | transparent px: ${fmt.transparentPixels}`);

    let result;
    try {
      result = validateLegendaryPng(pngPath, item.tokenId);
    } catch (err) {
      console.log(`  Preflight ERROR: ${err.message}\n`);
      continue;
    }

    if (result.ok) {
      console.log(`  Preflight: PASS (${result.paletteKey})`);
      try {
        const record = buildMintRecord(item.tokenId, TRAITS, [], null);
        const rt = verifyRoundTrip(item.tokenId, record);
        if (rt.status === "ok") {
          console.log(`  Round-trip: PASS (${rt.nonZero} non-zero px)`);
        } else {
          console.log(`  Round-trip: FAIL — ${rt.reason}`);
        }
      } catch (err) {
        console.log(`  Round-trip: ERROR — ${err.message}`);
      }
    } else {
      console.log(`  Preflight: FAIL — ${result.violations.length} violation(s)`);
      const triage = classifyViolations(result.violations, fmt, item.palette);
      if (triage.kind === "STRAY") {
        console.log(`  Triage: STRAY (${triage.violations.length} px — likely anti-aliasing)`);
        for (const v of triage.violations) {
          console.log(
            `    (${v.x}, ${v.y}) found ${v.found.hex} rgb(${v.found.r},${v.found.g},${v.found.b}) → nearest idx ${v.nearest.index} ${v.nearest.hex}`,
          );
        }
      } else {
        console.log(`  Triage: SYSTEMATIC — registry palette may need JB update`);
        console.log(`  Art distinct opaque colors (${triage.artColorInventory.length}):`);
        for (const c of triage.artColorInventory) {
          console.log(`    ${c.hex} ×${c.count}`);
        }
        console.log(`  Registry ${item.palette} (16 slots):`);
        for (const s of triage.registryPalette) {
          console.log(`    idx ${String(s.index).padStart(2)} ${s.hex}`);
        }
        console.log(
          `  Art uses ${triage.registrySlotsUsedInArt} registry-matching colors; off-registry: ${triage.offRegistryColors.join(", ") || "(none among opaque)"}`,
        );
        console.log(`  Violation pixel count: ${triage.violationCount}`);
      }
    }
    console.log("");
  }

  console.log("Status: 6/9 delivered | outstanding: 2222 (DOPEMIND), 4354 (Serc), 3792 (open)");
  console.log("Mint-data generation: BLOCKED");
}

main();
