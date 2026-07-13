// Empirical Zombie component pixel analysis — no palette guessing.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { ROLES, PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const { extractToBuffer, resolveExtractionDrawColors } = require("./generate");

const ZOMBIE_CHAR = CHARACTERS.find((c) => c.name === "Zombie");

const GRID = SETTINGS.grid;
const COMPONENTS = path.join(__dirname, "components");
const ZOMBIE_PAL = PALETTES.ZOMBIE.colors;

function hex(rgb) {
  const [r, g, b] = rgb;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(h) {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}

function colorDist(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function readPixels(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const pixels = [];
  const t = SETTINGS.bgKnockoutThreshold;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
      if (a === 0 || (r <= t && g <= t && b <= t)) continue;
      pixels.push({ x, y, rgb: [r, g, b] });
    }
  }
  return { width: png.width, height: png.height, pixels };
}

function regionLabel(xs, ys) {
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const cy = ys.reduce((s, v) => s + v, 0) / ys.length;
  const h = cx < GRID / 3 ? "left" : cx > (GRID * 2) / 3 ? "right" : "center";
  const v = cy < GRID / 3 ? "upper" : cy > (GRID * 2) / 3 ? "lower" : "mid";
  return `${v}-${h} (centroid ~${cx.toFixed(1)},${cy.toFixed(1)})`;
}

function matchZombiePaletteIndex(rgb) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < ZOMBIE_PAL.length; i++) {
    const d = colorDist(rgb, hexToRgb(ZOMBIE_PAL[i]));
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, role: ROLES[best], paletteHex: ZOMBIE_PAL[best], dist: bestD, exact: bestD === 0 };
}

function matchDrawColors(rgb, drawColors) {
  const ROLE_INDEX = Object.fromEntries(ROLES.map((r, i) => [r, i]));
  let best = null, bestD = Infinity;
  for (const [h, role] of Object.entries(drawColors)) {
    const d = colorDist(rgb, hexToRgb(h));
    if (d < bestD) { bestD = d; best = { drawHex: h, role, index: ROLE_INDEX[role] }; }
  }
  return { ...best, dist: bestD };
}

function pipelineBufFor(label, file, drawColors, slot) {
  const pick = { variant: { name: "Zombie" } };
  const slotDef = { drawColors };
  const resolved = resolveExtractionDrawColors(slot, pick, ZOMBIE_CHAR, slotDef);
  return extractToBuffer(path.join(COMPONENTS, file), resolved, { skipRgbKnockout: true });
}

function analyzeFile(label, file, drawColors, slot) {
  const filePath = path.join(COMPONENTS, file);
  const { pixels } = readPixels(filePath);
  const pipelineBuf = pipelineBufFor(label, file, drawColors, slot);

  // Group by source RGB
  const byRgb = new Map();
  for (const p of pixels) {
    const key = hex(p.rgb);
    if (!byRgb.has(key)) byRgb.set(key, { rgb: p.rgb, xs: [], ys: [], pipelineIndices: new Set() });
    const g = byRgb.get(key);
    g.xs.push(p.x);
    g.ys.push(p.y);
    const idx = pipelineBuf[p.y * GRID + p.x];
    g.pipelineIndices.add(idx);
  }

  // Group by direct ZOMBIE palette index (artist intent if painted with GPL)
  const byPalIndex = new Map();
  for (const p of pixels) {
    const m = matchZombiePaletteIndex(p.rgb);
    if (!byPalIndex.has(m.index)) byPalIndex.set(m.index, { ...m, count: 0, xs: [], ys: [] });
    const g = byPalIndex.get(m.index);
    g.count++;
    g.xs.push(p.x);
    g.ys.push(p.y);
  }

  // Group by pipeline-assigned index
  const byPipelineIndex = new Map();
  for (const p of pixels) {
    const idx = pipelineBuf[p.y * GRID + p.x];
    if (!byPipelineIndex.has(idx)) byPipelineIndex.set(idx, { count: 0, xs: [], ys: [], sourceColors: new Map() });
    const g = byPipelineIndex.get(idx);
    g.count++;
    g.xs.push(p.x);
    g.ys.push(p.y);
    const hk = hex(p.rgb);
    g.sourceColors.set(hk, (g.sourceColors.get(hk) || 0) + 1);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`${label} — ${file}`);
  console.log(`Non-bg pixels: ${pixels.length}`);

  console.log("\n--- A) Unique SOURCE RGB colors in PNG (what artist painted) ---");
  const rgbSorted = [...byRgb.entries()].sort((a, b) => b[1].xs.length - a[1].xs.length);
  for (const [h, g] of rgbSorted) {
    const pal = matchZombiePaletteIndex(g.rgb);
    const draw = matchDrawColors(g.rgb, drawColors);
    console.log(
      `  ${h} ×${g.xs.length} @ ${regionLabel(g.xs, g.ys)}`,
    );
    console.log(
      `      GPL-exact index ${pal.index} (${pal.role}) → render ${pal.paletteHex}${pal.exact ? " EXACT" : ` (dist²=${pal.dist})`}`,
    );
    console.log(
      `      drawColors snap  index ${draw.index} (${draw.role}) ← nearest ${draw.drawHex} (dist²=${draw.dist})`,
    );
  }

  console.log("\n--- B) If painted with ZOMBIE GPL palette (direct index match) ---");
  [...byPalIndex.entries()].sort((a, b) => a[0] - b[0]).forEach(([idx, g]) => {
    console.log(
      `  index ${idx} (${g.role}) → ${g.paletteHex}: ${g.count} px @ ${regionLabel(g.xs, g.ys)}`,
    );
  });

  console.log("\n--- C) What pipeline assigns (Zombie-aware extraction) ---");
  let exactPipeline = 0;
  [...byPipelineIndex.entries()].sort((a, b) => a[0] - b[0]).forEach(([idx, g]) => {
    const src = [...g.sourceColors.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}×${n}`).join(", ");
    console.log(
      `  index ${idx} (${ROLES[idx]}) → render ${ZOMBIE_PAL[idx]}: ${g.count} px @ ${regionLabel(g.xs, g.ys)}`,
    );
    console.log(`      source colors: ${src}`);
  });
  for (const p of pixels) {
    const pal = matchZombiePaletteIndex(p.rgb);
    const pi = pipelineBuf[p.y * GRID + p.x];
    if (pal.index === pi) exactPipeline++;
  }
  console.log(`\n  Pipeline GPL-index agreement: ${exactPipeline}/${pixels.length} pixels`);

  // Eye region probe — approximate eye sockets for 64x64 head
  if (label === "HEAD") {
    console.log("\n--- D) Eye-region pixel probe (y=22-32) ---");
    const eyeRows = pixels.filter((p) => p.y >= 22 && p.y <= 32 && p.x >= 18 && p.x <= 46);
    const eyeByRgb = new Map();
    for (const p of eyeRows) {
      const h = hex(p.rgb);
      const pi = pipelineBuf[p.y * GRID + p.x];
      const key = `${h}|pi${pi}`;
      eyeByRgb.set(key, (eyeByRgb.get(key) || 0) + 1);
    }
    [...eyeByRgb.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
      const [h, pi] = k.split("|pi");
      const pal = matchZombiePaletteIndex(hexToRgb(h));
      console.log(`  (${h}) GPL-idx ${pal.index} pipeline-idx ${pi} (${ROLES[pi]}) ×${n}`);
    });
  }

  return { byRgb, byPalIndex, byPipelineIndex };
}

const traits = JSON.parse(fs.readFileSync(path.join(__dirname, "traits.json"), "utf8"));
console.log("ZOMBIE palette (live chromies-config.js):");
ROLES.forEach((r, i) => console.log(`  [${i}] ${r.padEnd(18)} ${ZOMBIE_PAL[i]}`));

console.log("\nhead drawColors (traits.json — SIGNAL authoring colors):");
Object.entries(traits.slots.head.drawColors).forEach(([h, r]) => console.log(`  ${h} → ${r}`));

console.log("\nbody drawColors (traits.json — SIGNAL authoring colors):");
Object.entries(traits.slots.body.drawColors).forEach(([h, r]) => console.log(`  ${h} → ${r}`));

analyzeFile("HEAD", "zombie/HEAD_Zombie.png", traits.slots.head.drawColors, "head");
analyzeFile("BODY", "zombie/BODY_Zombie.png", traits.slots.body.drawColors, "body");

// Cross-check: colors in PNG that are NOT in drawColors at all
console.log(`\n${"=".repeat(72)}`);
console.log("DIAGNOSIS SUMMARY");
const headPath = path.join(COMPONENTS, "zombie/HEAD_Zombie.png");
const headDraw = traits.slots.head.drawColors;
const { pixels: headPx } = readPixels(headPath);
const drawHexes = new Set(Object.keys(headDraw));
let orphanCount = 0;
const orphans = new Map();
for (const p of headPx) {
  const h = hex(p.rgb);
  let minD = Infinity;
  for (const dh of drawHexes) minD = Math.min(minD, colorDist(p.rgb, hexToRgb(dh)));
  if (minD > 0) {
    orphanCount++;
    orphans.set(h, (orphans.get(h) || 0) + 1);
  }
}
console.log(`HEAD pixels NOT exact-matching any drawColor hex: ${orphanCount}/${headPx.length}`);
console.log("Orphan colors (painted with Zombie GPL, not SIGNAL drawColors):");
[...orphans.entries()].sort((a, b) => b[1] - a[1]).forEach(([h, n]) => {
  const pal = matchZombiePaletteIndex(hexToRgb(h));
  const draw = matchDrawColors(hexToRgb(h), headDraw);
  console.log(`  ${h} ×${n} → GPL idx ${pal.index} (${pal.role}) wrongly snapped to idx ${draw.index} (${draw.role})`);
});
