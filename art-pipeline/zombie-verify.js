// ============================================================================
// zombie-verify.js
// Pre-regen verification for Zombie character — gallery + coverage audit.
// Does NOT write mint-data.
//
// USAGE:  node zombie-verify.js
// OUTPUT: output/review/zombie-gallery.png, output/review/zombie-audit.json
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickCharacter,
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  compositeChromie,
  renderPNG,
  buildPhase3Effects,
} = require("./generate");

const REVIEW_DIR = path.join(SETTINGS.outputDir, "review");
const GRID = SETTINGS.grid;
const TILE_SCALE = 4;
const TILE_SIZE = GRID * TILE_SCALE;
const PADDING = 10;
const LABEL_H = 28;
const GALLERY_BG = [0xf5, 0xf5, 0xf5];

const ZOMBIE = CHARACTERS.find((c) => c.name === "Zombie");

const GALLERY_COMBOS = [
  { label: "naked+Mohawk", hood: "None", shirt: "None", hair: "Mohawk", glasses: "None", beard: "None" },
  { label: "Crew+Afro+Shades", hood: "None", shirt: "Crew", hair: "Afro", glasses: "Shades", beard: "None" },
  { label: "hood+MrT", hood: "Classic", shirt: "Crew", hair: "MrT", glasses: "None", beard: "None" },
  { label: "Tank+FullBeard", hood: "None", shirt: "Tank", hair: "MrT", glasses: "None", beard: "Full" },
  { label: "naked+Dreads+Neo", hood: "None", shirt: "None", hair: "Dreads", glasses: "Neo", mustache: "Thick" },
  { label: "naked+Pomp+chain", hood: "None", shirt: "None", hair: "Pompadour", necklace: "Male_Chain", earrings: "Stud" },
  { label: "Tank+tattoo", hood: "None", shirt: "Tank", hair: "Surfer", bodytattoo: "UnderArmour", tattoo: "Signal" },
  { label: "Crew+VR+Goat", hood: "None", shirt: "Crew", hair: "FadeRight", glasses: "VR", beard: "Goat" },
  { label: "naked+AZVet", hood: "None", shirt: "None", hair: "AZVet", glasses: "None", eyes: "Stoned" },
  { label: "Tank+necklace", hood: "None", shirt: "Tank", hair: "None", necklace: "Male_Chromies", beard: "None" },
  { label: "Flannel-ish Crew", hood: "None", shirt: "Crew", hair: "Mohawk", glasses: "Shades", bodytattoo: "Pyramid" },
  { label: "hood off naked", hood: "None", shirt: "None", hair: "Afro", beard: "Full", mustache: "Thick" },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function applyOverrides(picks, traits, combo) {
  for (const [slot, name] of Object.entries(combo)) {
    if (slot === "label" || !name) continue;
    const slotDef = traits.slots[slot];
    if (!slotDef) continue;
    const variant = slotDef.variants.find((v) => v.name === name);
    if (variant) picks[slot] = { variant, file: variant.file, buffer: null };
  }
}

function renderZombieCombo(tokenId, traits, combo) {
  const picks = pickTokenVariants(tokenId, traits, new Set(), ZOMBIE, false);
  applyOverrides(picks, traits, combo);
  loadPickBuffers(picks, traits, ZOMBIE);
  const renderPicks = applyCoverageRules(picks, traits, ZOMBIE);
  const palette = PALETTES.ZOMBIE;
  const { driftMap } = buildPhase3Effects(tokenId, picks, null, ZOMBIE);
  const buf = compositeChromie(renderPicks, traits, tokenId, driftMap);
  return { pngBuf: renderPNG(buf, palette, { transparentIndex0: true }), renderPicks, picks };
}

function gridDims(n) {
  const cols = Math.ceil(Math.sqrt(n * 4 / 3));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function blitTile(gallery, pngBuf, col, row, cols, label) {
  const ox = PADDING + col * (TILE_SIZE + PADDING);
  const oy = PADDING + row * (TILE_SIZE + PADDING + LABEL_H);
  const tilePng = PNG.sync.read(pngBuf);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const sx = Math.floor(x / TILE_SCALE);
      const sy = Math.floor(y / TILE_SCALE);
      const so = (sy * GRID + sx) * 4;
      const dx = ox + x;
      const dy = oy + y;
      const doff = (dy * gallery.width + dx) * 4;
      gallery.data[doff] = tilePng.data[so];
      gallery.data[doff + 1] = tilePng.data[so + 1];
      gallery.data[doff + 2] = tilePng.data[so + 2];
      gallery.data[doff + 3] = 255;
    }
  }
  drawLabel(gallery, ox, oy + TILE_SIZE + 2, label.slice(0, 22));
}

const FONT_5X7 = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "+": ["00100", "00100", "11111", "00100", "11111", "00100", "00100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10001", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "10001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10001", "10101", "11011", "10001"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10001", "10001"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11110", "01000", "01000", "01001", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10001", "01111"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
};

function drawLabel(png, x, y, text) {
  for (let i = 0; i < text.length && x + i * 6 < png.width; i++) {
    const glyph = FONT_5X7[text[i]] || FONT_5X7[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== "1") continue;
        const px = x + i * 6 + col;
        const py = y + row;
        if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
        const off = (py * png.width + px) * 4;
        png.data[off] = 0x22;
        png.data[off + 1] = 0x22;
        png.data[off + 2] = 0x22;
        png.data[off + 3] = 255;
      }
    }
  }
}

function auditZombieCoverage(traits, tokenCount) {
  const failures = [];
  let zombieCount = 0;
  const slotStats = {};

  for (let id = 1; id <= tokenCount; id++) {
    const character = pickCharacter(id);
    if (character.name !== "Zombie") continue;
    zombieCount++;
    const picks = pickTokenVariants(id, traits, new Set(), character, false);
    const renderPicks = applyCoverageRules(picks, traits, character);

    const head = renderPicks.head?.variant.name;
    const body = renderPicks.body?.variant.name;
    const hasNeck = renderPicks.neck !== undefined;

    if (head !== "Zombie") {
      failures.push({ tokenId: id, slot: "head", expected: "Zombie", got: head, rolled: picks.head?.variant.name });
    }
    if (body !== "Zombie") {
      failures.push({ tokenId: id, slot: "body", expected: "Zombie", got: body, rolled: picks.body?.variant.name });
    }
    if (hasNeck) {
      failures.push({ tokenId: id, slot: "neck", expected: "omitted", got: renderPicks.neck?.variant.name });
    }

    for (const [slot, pick] of Object.entries(renderPicks)) {
      slotStats[slot] = slotStats[slot] || {};
      slotStats[slot][pick.variant.name] = (slotStats[slot][pick.variant.name] || 0) + 1;
    }
  }

  return { zombieCount, failures, slotStats };
}

function main() {
  ensureDir(REVIEW_DIR);
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));

  const { cols, rows } = gridDims(GALLERY_COMBOS.length);
  const W = cols * (TILE_SIZE + PADDING) + PADDING;
  const H = rows * (TILE_SIZE + PADDING + LABEL_H) + PADDING;
  const gallery = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    gallery.data[i * 4] = GALLERY_BG[0];
    gallery.data[i * 4 + 1] = GALLERY_BG[1];
    gallery.data[i * 4 + 2] = GALLERY_BG[2];
    gallery.data[i * 4 + 3] = 255;
  }

  const galleryDetails = [];
  for (let n = 0; n < GALLERY_COMBOS.length; n++) {
    const combo = GALLERY_COMBOS[n];
    const tokenId = 9000 + n;
    const { pngBuf, renderPicks } = renderZombieCombo(tokenId, traits, combo);
    blitTile(gallery, pngBuf, n % cols, Math.floor(n / cols), cols, combo.label);
    galleryDetails.push({
      label: combo.label,
      combo,
      head: renderPicks.head?.variant.name,
      body: renderPicks.body?.variant.name,
      neck: renderPicks.neck ? renderPicks.neck.variant.name : null,
      hood: renderPicks.hood?.variant.name,
      shirt: renderPicks.shirt?.variant.name,
      hair: renderPicks.hair?.variant.name,
      glasses: renderPicks.glasses?.variant.name,
    });
  }

  const galleryPath = path.join(REVIEW_DIR, "zombie-gallery.png");
  fs.writeFileSync(galleryPath, PNG.sync.write(gallery));
  console.log(`Wrote ${galleryPath}`);

  const audit = auditZombieCoverage(traits, 5150);
  const totalWeight = CHARACTERS.reduce((s, c) => s + c.weight, 0);
  const expectedZombie = Math.round((ZOMBIE.weight / totalWeight) * 5150);

  const report = {
    generatedAt: new Date().toISOString(),
    palette: PALETTES.ZOMBIE,
    gallery: { path: galleryPath, combos: galleryDetails },
    coverageAudit: {
      sampleTokenCount: 5150,
      zombieTokensFound: audit.zombieCount,
      expectedApprox: expectedZombie,
      headBodyOverwriteFailures: audit.failures.length,
      failures: audit.failures,
      rolledSlotDistribution: audit.slotStats,
      pass: audit.failures.length === 0,
    },
    catStillActive: CHARACTERS.some((c) => c.name === "Cat" && c.weight > 0),
    zombieWeight: ZOMBIE.weight,
    catWeight: CHARACTERS.find((c) => c.name === "Cat")?.weight,
  };

  const auditPath = path.join(REVIEW_DIR, "zombie-audit.json");
  fs.writeFileSync(auditPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${auditPath}`);
  console.log(`Zombie tokens in 5150 sample: ${audit.zombieCount} (expected ~${expectedZombie})`);
  console.log(`Coverage failures: ${audit.failures.length} ${audit.failures.length === 0 ? "PASS" : "FAIL"}`);
  if (audit.failures.length) {
    console.log(JSON.stringify(audit.failures.slice(0, 10), null, 2));
    process.exit(1);
  }
}

main();
