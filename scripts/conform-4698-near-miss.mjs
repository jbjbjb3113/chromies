#!/usr/bin/env node
/**
 * Conforming pass for #4698: merge near-miss opaque colors at RGB distance ≤6.
 * Does NOT write registry or replace legendary-finals/4698.png.
 * Output: derived_assets/legendary-recovery/4698_conform/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));
const { PNG } = require("pngjs");

const SRC = path.join(REPO, "art-pipeline/legendary-finals/4698.png");
const OUT = path.join(REPO, "derived_assets/legendary-recovery/4698_conform");
const MERGE_THRESHOLD = 6;
const SCALE = 8;

function rgbKey(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toLowerCase();
}

function parseHex(hex) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbDistance(hexA, hexB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

class UnionFind {
  constructor(keys) {
    this.parent = new Map(keys.map((k) => [k, k]));
  }
  find(x) {
    let p = this.parent.get(x);
    while (p !== this.parent.get(p)) {
      this.parent.set(x, this.parent.get(p));
      p = this.parent.get(p);
    }
    return p;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function loadColorCountsFromBuffer(buf) {
  const img = PNG.sync.read(buf);
  const counts = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a === 0) continue;
    const key = rgbKey(img.data[i], img.data[i + 1], img.data[i + 2]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { img, counts };
}

function loadColorCounts(pngPath) {
  return loadColorCountsFromBuffer(fs.readFileSync(pngPath));
}

function buildMergeMap(counts) {
  const colors = [...counts.keys()];
  const uf = new UnionFind(colors);
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (rgbDistance(colors[i], colors[j]) <= MERGE_THRESHOLD) {
        uf.union(colors[i], colors[j]);
      }
    }
  }
  const groups = new Map();
  for (const c of colors) {
    const root = uf.find(c);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  }
  const remap = new Map();
  const merges = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      remap.set(members[0], members[0]);
      continue;
    }
    const canonical = members.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))[0];
    for (const m of members) {
      remap.set(m, canonical);
      if (m !== canonical) {
        merges.push({ from: m, to: canonical, px: counts.get(m) || 0, dist: rgbDistance(m, canonical) });
      }
    }
  }
  return { remap, merges, groups: [...groups.values()] };
}

function applyRemap(img, remap) {
  const out = new PNG({ width: img.width, height: img.height });
  out.data = Buffer.from(img.data);
  let changed = 0;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const key = rgbKey(out.data[i], out.data[i + 1], out.data[i + 2]);
    const target = remap.get(key) || key;
    if (target !== key) {
      const rgb = parseHex(target);
      out.data[i] = rgb.r;
      out.data[i + 1] = rgb.g;
      out.data[i + 2] = rgb.b;
      changed += 1;
    }
  }
  return { png: out, changedPixels: changed };
}

function derivePalette(counts) {
  const SLOT0 = "#000001";
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const art = ranked.map(([hex]) => hex);
  const padding = [];
  let n = 2;
  while (art.length + padding.length + 1 < 16) {
    padding.push(`#${String(n).padStart(6, "0")}`);
    n += 1;
  }
  return [SLOT0, ...art, ...padding].slice(0, 16);
}

async function upscaleNearest(buf) {
  return sharp(buf).resize(64 * SCALE, 64 * SCALE, { kernel: sharp.kernel.nearest }).png().toBuffer();
}

async function buildDiffPanel(beforeBuf, afterBuf, changedPixels) {
  const before8 = await upscaleNearest(beforeBuf);
  const after8 = await upscaleNearest(afterBuf);
  const before = PNG.sync.read(beforeBuf);
  const after = PNG.sync.read(afterBuf);
  const diff = new PNG({ width: before.width, height: before.height });
  for (let i = 0; i < before.data.length; i += 4) {
    const same =
      before.data[i] === after.data[i] &&
      before.data[i + 1] === after.data[i + 1] &&
      before.data[i + 2] === after.data[i + 2] &&
      before.data[i + 3] === after.data[i + 3];
    if (same) {
      diff.data[i] = 32;
      diff.data[i + 1] = 32;
      diff.data[i + 2] = 32;
      diff.data[i + 3] = 255;
    } else {
      diff.data[i] = 255;
      diff.data[i + 1] = 0;
      diff.data[i + 2] = 255;
      diff.data[i + 3] = 255;
    }
  }
  const diff8 = await upscaleNearest(PNG.sync.write(diff));
  const cell = 64 * SCALE;
  const labelH = 28;
  const panelW = cell * 3 + 48;
  const panelH = cell + labelH + 24;
  const labels = ["BEFORE (original)", "AFTER (≤6 merge)", "DIFF (magenta = changed px)"];
  const composites = [
    { input: before8, left: 16, top: labelH },
    { input: after8, left: 16 + cell + 8, top: labelH },
    { input: diff8, left: 16 + (cell + 8) * 2, top: labelH },
  ];
  for (let i = 0; i < 3; i++) {
    const svg = Buffer.from(
      `<svg width="${cell}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="4" y="18" fill="#eee" font-family="monospace" font-size="13">${labels[i]}</text></svg>`,
    );
    composites.push({ input: svg, left: 16 + i * (cell + 8), top: 4 });
  }
  const caption = Buffer.from(
    `<svg width="${panelW}" height="20" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="4" y="15" fill="#ccc" font-family="monospace" font-size="12">` +
      `#4698 conforming pass — ${changedPixels} pixel(s) remapped (RGB ≤${MERGE_THRESHOLD}); expect zero visible change at 8×` +
      `</text></svg>`,
  );
  composites.push({ input: caption, left: 8, top: panelH - 22 });
  return sharp({
    create: { width: panelW, height: panelH, channels: 4, background: { r: 20, g: 20, b: 24, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { img, counts: beforeCounts } = loadColorCounts(SRC);
  const { remap, merges, groups } = buildMergeMap(beforeCounts);
  const beforeBuf = PNG.sync.write(img);
  const { png: afterPng, changedPixels } = applyRemap(img, remap);
  const afterBuf = PNG.sync.write(afterPng);

  const afterCounts = loadColorCountsFromBuffer(afterBuf).counts;
  const proposedPalette = derivePalette(afterCounts);
  const distinctArt = afterCounts.size;

  fs.writeFileSync(path.join(OUT, "4698_before.png"), beforeBuf);
  fs.writeFileSync(path.join(OUT, "4698_after_conform.png"), afterBuf);
  fs.writeFileSync(
    path.join(OUT, "4698_merge_report.json"),
    JSON.stringify(
      {
        mergeThreshold: MERGE_THRESHOLD,
        changedPixels,
        mergeGroups: groups.map((g) => ({
          canonical: g.sort((a, b) => (beforeCounts.get(b) || 0) - (beforeCounts.get(a) || 0))[0],
          members: g.map((hex) => ({ hex, px: beforeCounts.get(hex) || 0 })),
        })),
        mergesApplied: merges.sort((a, b) => a.dist - b.dist),
        distinctOpaqueAfterMerge: distinctArt,
        fits16Slots: distinctArt + 1 <= 16,
        proposedPalette31: proposedPalette,
      },
      null,
      2,
    ) + "\n",
  );

  const diffPanel = await buildDiffPanel(beforeBuf, afterBuf, changedPixels);
  fs.writeFileSync(path.join(OUT, "4698_before_after_diff_8x.png"), diffPanel);

  await sharp(beforeBuf).resize(512, 512, { kernel: sharp.kernel.nearest }).png().toFile(path.join(OUT, "4698_before_8x.png"));
  await sharp(afterBuf).resize(512, 512, { kernel: sharp.kernel.nearest }).png().toFile(path.join(OUT, "4698_after_8x.png"));

  console.log(`4698 conform pass complete → ${OUT}`);
  console.log(`  Merge groups: ${groups.filter((g) => g.length > 1).length}`);
  console.log(`  Pixels remapped: ${changedPixels}`);
  console.log(`  Distinct opaque after merge: ${distinctArt} (fits 16 slots: ${distinctArt + 1 <= 16})`);
  console.log(`  Proposed NORMIE_JACKBUTCHER palette (ID 31, NOT written to registry):`);
  console.log(JSON.stringify(proposedPalette, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
