// Investigate eye socket / mouth knockout in HEAD_Zombie.png
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { ROLES, PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const { extractToBuffer, resolveExtractionDrawColors, compositeChromie, renderPNG } = require("./generate");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const headFile = path.join(SETTINGS.componentsDir, "zombie/HEAD_Zombie.png");
const bodyFile = path.join(SETTINGS.componentsDir, "zombie/BODY_Zombie.png");
const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
const ZOMBIE = CHARACTERS.find((c) => c.name === "Zombie");
const ZOMBIE_PAL = PALETTES.ZOMBIE.colors;

function hex(rgb, a = 255) {
  const [r, g, b] = rgb;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}${a < 255 ? ` a=${a}` : ""}`;
}

function readRaw(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const pixels = [];
  const t = SETTINGS.bgKnockoutThreshold;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
      const knocked = a === 0 || (r <= t && g <= t && b <= t);
      pixels.push({ x, y, rgb: [r, g, b], a, knocked });
    }
  }
  return pixels;
}

function matchPalette(rgb) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < ZOMBIE_PAL.length; i++) {
    const h = ZOMBIE_PAL[i].replace("#", "");
    const pr = parseInt(h.slice(0, 2), 16), pg = parseInt(h.slice(2, 4), 16), pb = parseInt(h.slice(4, 6), 16);
    const d = (rgb[0] - pr) ** 2 + (rgb[1] - pg) ** 2 + (rgb[2] - pb) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, role: ROLES[best], hex: ZOMBIE_PAL[best], dist: bestD };
}

const headPick = { variant: { name: "Zombie" } };
const headDraw = resolveExtractionDrawColors("head", headPick, ZOMBIE, traits.slots.head);
const zombieExtractOpts = { skipRgbKnockout: true };
const headBuf = extractToBuffer(headFile, headDraw, zombieExtractOpts);

console.log("=== HEAD_Zombie knockout / socket investigation ===\n");

// Region probes (approximate 64x64 layout from visual)
const regions = {
  "left-eye-socket": (x, y) => x >= 20 && x <= 27 && y >= 24 && y <= 29,
  "right-eye-socket": (x, y) => x >= 36 && x <= 43 && y >= 24 && y <= 29,
  "mouth-cavity": (x, y) => x >= 26 && x <= 38 && y >= 32 && y <= 36,
  "forehead-bone": (x, y) => x >= 24 && x <= 40 && y >= 10 && y <= 18,
};

const raw = readRaw(headFile);
for (const [name, pred] of Object.entries(regions)) {
  const region = raw.filter((p) => pred(p.x, p.y));
  const byState = { knocked: 0, painted: 0 };
  const byRgb = new Map();
  const byIndex = new Map();
  for (const p of region) {
    if (p.knocked) byState.knocked++;
    else byState.painted++;
    const flat = p.y * GRID + p.x;
    const idx = headBuf[flat];
    const key = `${hex(p.rgb, p.a)} idx=${idx}`;
    byRgb.set(key, (byRgb.get(key) || 0) + 1);
    byIndex.set(idx, (byIndex.get(idx) || 0) + 1);
  }
  console.log(`--- ${name} (${region.length} pixels) ---`);
  console.log(`  knocked out (alpha/threshold): ${byState.knocked}`);
  console.log(`  painted (extracted): ${byState.painted}`);
  console.log(`  pipeline index distribution:`);
  for (const [idx, n] of [...byIndex.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    [${idx}] ${ROLES[idx]} → ${ZOMBIE_PAL[idx]} : ${n}px`);
  }
  console.log(`  raw pixel breakdown:`);
  for (const [k, n] of [...byRgb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${k} ×${n}`);
  }
  console.log();
}

// Find all near-white pixels in entire head
console.log("=== Near-white pixels in HEAD (RGB all > 200) ===");
const nearWhite = raw.filter((p) => !p.knocked && p.rgb[0] > 200 && p.rgb[1] > 200 && p.rgb[2] > 190);
const nwByIdx = new Map();
for (const p of nearWhite) {
  const idx = headBuf[p.y * GRID + p.x];
  nwByIdx.set(idx, (nwByIdx.get(idx) || 0) + 1);
}
console.log(`Count: ${nearWhite.length}`);
for (const [idx, n] of [...nwByIdx.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  [${idx}] ${ROLES[idx]} → ${ZOMBIE_PAL[idx]} : ${n}px`);
}
if (nearWhite.length > 0) {
  const sample = nearWhite[0];
  const m = matchPalette(sample.rgb);
  console.log(`  sample ${hex(sample.rgb)} GPL-match idx ${m.index} (${m.role})`);
}

// What does composite do with index 0 under head?
console.log("\n=== Composite behavior: head over body ===");
const bodyPick = { variant: { name: "Zombie" } };
const bodyDraw = resolveExtractionDrawColors("body", bodyPick, ZOMBIE, traits.slots.body);
const bodyBuf = extractToBuffer(bodyFile, bodyDraw, zombieExtractOpts);
const picks = {
  body: { variant: { name: "Zombie" }, file: "zombie/BODY_Zombie.png", buffer: bodyBuf },
  head: { variant: { name: "Zombie" }, file: "zombie/HEAD_Zombie.png", buffer: headBuf },
};
const comp = compositeChromie(picks, traits, 0, null, null);

let socketShowsBody = 0, socketShowsBg = 0, socketShowsHead = 0;
for (const [name, pred] of Object.entries(regions)) {
  if (name === "forehead-bone") continue;
  for (const p of raw.filter((r) => pred(r.x, r.y))) {
    const flat = p.y * GRID + p.x;
    const headIdx = headBuf[flat];
    const compIdx = comp[flat];
    if (headIdx === 0) {
      if (compIdx === 0) socketShowsBg++;
      else socketShowsBody++;
    } else {
      socketShowsHead++;
    }
  }
}
console.log(`Socket/mouth pixels where head index=0:`);
console.log(`  composite shows background (0): ${socketShowsBg}`);
console.log(`  composite shows body underneath: ${socketShowsBody}`);
console.log(`Socket/mouth pixels where head index≠0 (opaque head layer): ${socketShowsHead}`);

// renderPNG: what color do socket pixels get?
const rendered = PNG.sync.read(renderPNG(comp, PALETTES.ZOMBIE, { transparentIndex0: true }));
let whiteish = 0;
for (const p of raw.filter((r) => regions["left-eye-socket"](r.x, r.y) || regions["right-eye-socket"](r.x, r.y))) {
  const flat = p.y * GRID + p.x;
  const ri = flat * 4;
  const r = rendered.data[ri], g = rendered.data[ri + 1], b = rendered.data[ri + 2];
  if (r > 200 && g > 200 && b > 190) whiteish++;
}
console.log(`\nRendered eye-socket pixels that look white (r,g,b > 200): ${whiteish}`);

// Check if artist used alpha=0 in sockets
console.log("\n=== Alpha channel in socket regions ===");
for (const [name, pred] of Object.entries(regions)) {
  if (name === "forehead-bone") continue;
  const region = raw.filter((p) => pred(p.x, p.y));
  const alpha0 = region.filter((p) => p.a === 0).length;
  const alpha255 = region.filter((p) => p.a === 255).length;
  console.log(`  ${name}: alpha=0 → ${alpha0}, alpha=255 → ${alpha255}`);
}

console.log("\n=== How other characters handle face holes ===");
const heroHead = path.join(SETTINGS.componentsDir, "HEAD_HeroA.png");
if (fs.existsSync(heroHead)) {
  const heroRaw = readRaw(heroHead);
  const heroBuf = extractToBuffer(heroHead, traits.slots.head.drawColors);
  for (const [name, pred] of Object.entries(regions)) {
    const region = heroRaw.filter((p) => pred(p.x, p.y));
    const knocked = region.filter((p) => p.knocked).length;
    const idx0 = region.filter((p) => heroBuf[p.y * GRID + p.x] === 0).length;
    console.log(`  HeroA ${name}: knocked=${knocked}, pipeline idx 0=${idx0}/${region.length}`);
  }
}
