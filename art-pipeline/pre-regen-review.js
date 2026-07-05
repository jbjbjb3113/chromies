// ============================================================================
// pre-regen-review.js
// Dry-run review package before mint-data regen — no mint-data writes, no commits.
//
// USAGE:  node pre-regen-review.js
// OUTPUT: output/review/
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickCharacter,
  pickTokenVariants,
  applyCoverageRules,
  pickPalette,
  compositeChromie,
  renderPNG,
  buildPhase3Effects,
  extractToBuffer,
} = require("./generate");
const { buildMintRecord } = require("./bridge-mint-data");
const {
  ON_CHAIN_CHARACTER_BYTES,
  characterKey,
  buildCharacterDecoderTable,
} = require("./on-chain-character-bytes");

const REVIEW_DIR = path.join(SETTINGS.outputDir, "review");
const GALLERY_DIR = path.join(REVIEW_DIR, "galleries");
const MINT_DATA_PATH = path.join(SETTINGS.outputDir, "mint-data.json");
const GRID = SETTINGS.grid;
const TILE_SCALE = 4;
const TILE_SIZE = GRID * TILE_SCALE;
const PADDING = 10;
const LABEL_H = 28;
const GALLERY_BG = [0xf5, 0xf5, 0xf5];

const PALETTE_DECODE = [
  "SIGNAL", "ACID", "CYAN", "GHOST", "BLOOD", "MOSS",
  "SIGNAL_BLONDE", "SIGNAL_GREY", "SIGNAL_RED",
  "ACID_BLONDE", "ACID_GREY", "ACID_RED",
  "CYAN_BLONDE", "CYAN_GREY", "CYAN_RED",
  "GHOST_BLONDE", "GHOST_GREY", "GHOST_RED",
  "BLOOD_BLONDE", "BLOOD_GREY", "BLOOD_RED",
  "MOSS_BLONDE", "MOSS_GREY", "MOSS_RED",
  "CAT", "ALIEN", "ZOMBIE", "AGENT",
];

const CHARACTER_TARGETS = [
  { label: "HeroA_Male", match: (c) => c.name === "HeroA" && c.gender === "Male" },
  { label: "HeroA_Female", match: (c) => c.name === "HeroA" && c.gender === "Female" },
  { label: "Cat", match: (c) => c.name === "Cat" },
  { label: "Zombie", match: (c) => c.name === "Zombie" },
  { label: "Alien", match: (c) => c.name === "Alien" },
  { label: "Agent", match: (c) => c.name === "Agent" },
  { label: "SideProfile_Male", match: (c) => c.name === "SideProfile" && c.gender === "Male" },
  { label: "SideProfile_Female", match: (c) => c.name === "SideProfile" && c.gender === "Female" },
  { label: "Chubby_Male", match: (c) => c.name === "Chubby" && c.gender === "Male" },
];

const BYTE_NAMES = buildCharacterDecoderTable();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function decodeCharByte(traitsHex) {
  return parseInt(traitsHex.replace("0x", "").slice(0, 2), 16);
}

function unpackPixels(hex) {
  const packed = Buffer.from(hex.replace("0x", ""), "hex");
  const out = new Uint8Array(GRID * GRID);
  for (let i = 0; i < out.length; i++) {
    const byteIndex = i >> 1;
    out[i] = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
  }
  return out;
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
  drawLabel(gallery, ox, oy + TILE_SIZE + 2, label);
}

function drawLabel(png, x, y, text) {
  const scale = 1;
  for (let i = 0; i < text.length && x + i * 6 * scale < png.width; i++) {
    drawChar(png, x + i * 6 * scale, y, text[i], scale);
  }
}

function drawChar(png, x, y, ch) {
  const glyph = FONT_5X7[ch] || FONT_5X7["?"];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (glyph[row][col] !== "1") continue;
      const px = x + col;
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

const FONT_5X7 = {
  "?": ["01110", "10001", "00010", "00100", "00000", "00100", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "#": ["00100", "00100", "11111", "00100", "11111", "00100", "00100"],
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
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
};

function checkRenderPicks(renderPicks, traits) {
  const issues = [];
  for (const [slot, pick] of Object.entries(renderPicks)) {
    const filePath = path.join(SETTINGS.componentsDir, pick.file);
    if (!fs.existsSync(filePath)) {
      issues.push({ slot, variant: pick.variant.name, file: pick.file, issue: "MISSING FILE" });
      continue;
    }
    try {
      const slotDef = traits.slots[slot];
      extractToBuffer(filePath, slotDef.drawColors);
    } catch (err) {
      issues.push({ slot, variant: pick.variant.name, file: pick.file, issue: `EXTRACT FAIL: ${err.message}` });
    }
  }
  return issues;
}

function renderTokenNew(tokenId, traits) {
  const character = pickCharacter(tokenId);
  const paletteKey = pickPalette(tokenId, traits, character);
  const palette = PALETTES[paletteKey];
  const picks = pickTokenVariants(tokenId, traits, new Set(), character);
  const renderPicks = applyCoverageRules(picks, traits, character);
  const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);
  const buf = compositeChromie(renderPicks, traits, tokenId, driftMap);
  const issues = checkRenderPicks(renderPicks, traits);
  return {
    pngBuf: renderPNG(buf, palette),
    character,
    paletteKey,
    picks,
    renderPicks,
    issues,
  };
}

function renderTokenOldFromMint(tokenId, mintRow) {
  const paletteByte = parseInt(mintRow.traitsHex.replace("0x", "").slice(2, 4), 16);
  const paletteKey = PALETTE_DECODE[paletteByte] || "SIGNAL";
  const palette = PALETTES[paletteKey] || PALETTES.SIGNAL;
  const indices = unpackPixels(mintRow.pixelsHex);
  return { pngBuf: renderPNG(indices, palette), paletteKey };
}

function getConfiguredVariants(character, slot, slotDef) {
  if (character.forcedSlots && character.forcedSlots[slot] !== undefined) {
    return [{ name: character.forcedSlots[slot], source: "forced" }];
  }
  const pool = character.slotVariantPool && character.slotVariantPool[slot];
  if (pool) {
    if (Array.isArray(pool)) return pool.map((name) => ({ name, source: "pool" }));
    return Object.keys(pool).map((name) => ({ name, source: "pool-weight", weight: pool[name] }));
  }
  let variants = slotDef.variants;
  if (character.slotWeightOverrides && character.slotWeightOverrides[slot]) {
    const overrides = character.slotWeightOverrides[slot];
    variants = variants.map((v) => {
      if (overrides[v.name] !== undefined) {
        return { ...v, weight: Math.round((v.weight || 0) * overrides[v.name]) };
      }
      return v;
    });
  }
  return variants
    .filter((v) => (v.weight || 0) > 0)
    .map((v) => ({ name: v.name, source: "weight", weight: v.weight }));
}

function buildCoverageReport(traits, allTokenIds) {
  const report = {};
  for (const target of CHARACTER_TARGETS) {
    const charDef = CHARACTERS.find((c) => target.match(c));
    const charIds = allTokenIds.filter((id) => target.match(pickCharacter(id)));
    const slotReport = {};
    const rolledCounts = {};

    for (const [slot, slotDef] of Object.entries(traits.slots)) {
      const configured = getConfiguredVariants(charDef, slot, slotDef);
      const variants = configured.map((cfg) => {
        const variantDef = slotDef.variants.find((v) => v.name === cfg.name);
        if (!variantDef) {
          return { ...cfg, file: null, inTraitsJson: false, fileExists: false, status: "ORPHAN_NAME" };
        }
        const filePath = path.join(SETTINGS.componentsDir, variantDef.file);
        const fileExists = fs.existsSync(filePath);
        let status = fileExists ? "OK" : "MISSING FILE";
        if ((variantDef.weight || 0) === 0 && cfg.source !== "forced" && cfg.source !== "pool-weight") {
          status = fileExists ? "OK (weight-0 in traits.json, gated via pool)" : "MISSING (weight-0 gated)";
        }
        return {
          name: cfg.name,
          file: variantDef.file,
          traitsWeight: variantDef.weight || 0,
          source: cfg.source,
          poolWeight: cfg.weight,
          inTraitsJson: true,
          fileExists,
          status,
        };
      });
      slotReport[slot] = { configuredCount: variants.length, variants };
      rolledCounts[slot] = {};
    }

    const renderIssues = [];
    const rolledAtMint = {};
    for (const id of charIds) {
      const character = pickCharacter(id);
      const picks = pickTokenVariants(id, traits, new Set(), character, false);
      const renderPicks = applyCoverageRules(picks, traits, character);
      for (const [slot, pick] of Object.entries(renderPicks)) {
        const name = pick.variant.name;
        rolledAtMint[slot] = rolledAtMint[slot] || {};
        rolledAtMint[slot][name] = (rolledAtMint[slot][name] || 0) + 1;
      }
      const issues = checkRenderPicks(renderPicks, traits);
      if (issues.length) renderIssues.push({ tokenId: id, issues });
    }

    const problems = [];
    for (const [slot, data] of Object.entries(slotReport)) {
      for (const v of data.variants) {
        if (v.status !== "OK" && !v.status.startsWith("OK (")) {
          problems.push({ slot, variant: v.name, file: v.file, status: v.status });
        }
      }
    }

    report[target.label] = {
      tokenCount: charIds.length,
      configuredSlots: Object.keys(slotReport).length,
      assetProblems: problems,
      renderIssueTokens: renderIssues.length,
      renderIssues: renderIssues.slice(0, 20),
      rolledAtMint,
      slots: slotReport,
    };
  }
  return report;
}

function pickDiverseSamples(ids, metaById, max = 16) {
  const buckets = new Map();
  for (const id of ids) {
    const m = metaById.get(id);
    const key = [m.paletteKey, m.hood, m.shirt, m.hair].join("|");
    if (!buckets.has(key)) buckets.set(key, id);
  }
  const out = [...buckets.values()];
  for (const id of ids) {
    if (out.length >= max) break;
    if (!out.includes(id)) out.push(id);
  }
  return out.slice(0, max);
}

function writeCharacterGalleries(traits, allTokenIds) {
  const galleryManifest = {};
  for (const target of CHARACTER_TARGETS) {
    const ids = allTokenIds.filter((id) => target.match(pickCharacter(id)));
    const metaById = new Map();
    for (const id of ids) {
      const r = renderTokenNew(id, traits);
      metaById.set(id, {
        paletteKey: r.paletteKey,
        hood: r.renderPicks.hood?.variant.name,
        shirt: r.renderPicks.shirt?.variant.name,
        hair: r.renderPicks.hair?.variant.name,
        issues: r.issues,
      });
    }
    const samples = pickDiverseSamples(ids, metaById, 16);
    const { cols, rows } = gridDims(samples.length);
    const W = cols * (TILE_SIZE + PADDING) + PADDING;
    const H = rows * (TILE_SIZE + PADDING + LABEL_H) + PADDING;
    const gallery = new PNG({ width: W, height: H });
    for (let i = 0; i < W * H; i++) {
      gallery.data[i * 4] = GALLERY_BG[0];
      gallery.data[i * 4 + 1] = GALLERY_BG[1];
      gallery.data[i * 4 + 2] = GALLERY_BG[2];
      gallery.data[i * 4 + 3] = 255;
    }

    const tiles = [];
    for (let n = 0; n < samples.length; n++) {
      const id = samples[n];
      const r = renderTokenNew(id, traits);
      const m = metaById.get(id);
      const label = `#${id} ${m.paletteKey.slice(0, 8)}`;
      blitTile(gallery, r.pngBuf, n % cols, Math.floor(n / cols), cols, label);
      tiles.push({
        tokenId: id,
        palette: r.paletteKey,
        renderIssues: r.issues,
        picks: Object.fromEntries(
          Object.entries(r.renderPicks).map(([s, p]) => [s, { variant: p.variant.name, file: p.file }])
        ),
      });
    }

    const outPath = path.join(GALLERY_DIR, `${target.label}.png`);
    fs.writeFileSync(outPath, PNG.sync.write(gallery));
    galleryManifest[target.label] = {
      file: outPath,
      population: ids.length,
      sampleCount: samples.length,
      tiles,
      samplesWithIssues: tiles.filter((t) => t.renderIssues.length > 0).length,
    };
    console.log(`  gallery ${target.label}: ${samples.length} samples (${ids.length} population)`);
  }
  return galleryManifest;
}

function buildTokenDiffPreview(traits, mintData) {
  const changes = [];
  for (let id = 1; id <= mintData.length; id++) {
    const c = pickCharacter(id);
    const key = characterKey(c);
    const expected = ON_CHAIN_CHARACTER_BYTES[key];
    const oldByte = decodeCharByte(mintData[id - 1].traitsHex);
    if (oldByte !== expected) {
      const record = buildMintRecord(id, traits, []);
      changes.push({
        tokenId: id,
        characterKey: key,
        oldByte,
        newByte: expected,
        oldLabel: BYTE_NAMES[oldByte] || `byte_${oldByte}`,
        newLabel: key,
        pixelsChanged: mintData[id - 1].pixelsHex !== record.pixelsHex,
        traitsHexChanged: mintData[id - 1].traitsHex !== record.traitsHex,
      });
    }
  }

  const samplePool = [
    ...changes.filter((c) => c.characterKey === "Chubby_Male").slice(0, 6),
    ...changes.filter((c) => c.characterKey === "SideProfile_Female").slice(0, 4),
    ...changes.filter((c) => c.characterKey === "SideProfile_Male").slice(0, 4),
    ...changes.filter((c) => !["Chubby_Male", "SideProfile_Female", "SideProfile_Male"].includes(c.characterKey)).slice(0, 6),
  ];

  const cols = 4;
  const rows = Math.ceil(samplePool.length / cols);
  const pairW = TILE_SIZE * 2 + 6;
  const W = cols * (pairW + PADDING) + PADDING;
  const H = rows * (TILE_SIZE + PADDING + LABEL_H) + PADDING;
  const sheet = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    sheet.data[i * 4] = GALLERY_BG[0];
    sheet.data[i * 4 + 1] = GALLERY_BG[1];
    sheet.data[i * 4 + 2] = GALLERY_BG[2];
    sheet.data[i * 4 + 3] = 255;
  }

  const sampleDetails = [];
  for (let n = 0; n < samplePool.length; n++) {
    const ch = samplePool[n];
    const id = ch.tokenId;
    const mintRow = mintData[id - 1];
    const old = renderTokenOldFromMint(id, mintRow);
    const neu = renderTokenNew(id, traits);
    const col = n % cols;
    const row = Math.floor(n / cols);
    const ox = PADDING + col * (pairW + PADDING);
    const oy = PADDING + row * (TILE_SIZE + PADDING + LABEL_H);

    blitAt(sheet, old.pngBuf, ox, oy);
    blitAt(sheet, neu.pngBuf, ox + TILE_SIZE + 6, oy);
    const label = `#${id} ${ch.oldByte}->${ch.newByte} px:${ch.pixelsChanged ? "CHG" : "same"}`;
    drawLabel(sheet, ox, oy + TILE_SIZE + 2, label);

    sampleDetails.push({
      ...ch,
      newRenderIssues: neu.issues,
      newRenderOk: neu.issues.length === 0,
      oldPalette: old.paletteKey,
      newPalette: neu.paletteKey,
      label: "OLD(left) NEW(right)",
    });
  }

  const diffPath = path.join(REVIEW_DIR, "regen-diff-preview.png");
  fs.writeFileSync(diffPath, PNG.sync.write(sheet));

  return {
    totalChanges: changes.length,
    byCharacter: changes.reduce((acc, c) => {
      acc[c.characterKey] = (acc[c.characterKey] || 0) + 1;
      return acc;
    }, {}),
    pixelsChangedCount: changes.filter((c) => c.pixelsChanged).length,
    traitsOnlyCount: changes.filter((c) => !c.pixelsChanged).length,
    samples: sampleDetails,
    diffImage: diffPath,
    allChanges: changes,
  };
}

function blitAt(gallery, pngBuf, ox, oy) {
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
}

function byteRegistryTable() {
  return Object.entries(ON_CHAIN_CHARACTER_BYTES)
    .sort((a, b) => a[1] - b[1])
    .map(([key, byte]) => ({ key, byte, reserved: false }));
}

function writeMarkdownReport(payload) {
  const lines = [];
  lines.push("# Pre-Regen Review Package (Dry Run)");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push("**No mint-data regen performed.**");
  lines.push("");

  lines.push("## Character Byte Registry (sign-off)");
  lines.push("");
  lines.push("| Byte | Registry Key | Status |");
  lines.push("|------|--------------|--------|");
  for (const row of payload.byteRegistry) {
    lines.push(`| ${row.byte} | \`${row.key}\` | ${row.reserved ? "RESERVED" : "active"} |`);
  }
  lines.push("");

  lines.push("## Token-Level Diff Preview");
  lines.push("");
  lines.push(`- Total tokens that would change on regen: **${payload.tokenDiff.totalChanges}**`);
  lines.push(`- Pixels would change: **${payload.tokenDiff.pixelsChangedCount}**`);
  lines.push(`- Traits-only change (pixels identical): **${payload.tokenDiff.traitsOnlyCount}**`);
  lines.push(`- Visual diff sheet: \`${path.relative(REVIEW_DIR, payload.tokenDiff.diffImage)}\` (OLD left, NEW right)`);
  lines.push("");
  lines.push("| Character | Count |");
  lines.push("|-----------|-------|");
  for (const [k, v] of Object.entries(payload.tokenDiff.byCharacter).sort((a, b) => ON_CHAIN_CHARACTER_BYTES[a[0]] - ON_CHAIN_CHARACTER_BYTES[b[0]])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("### Sample diffs");
  lines.push("");
  lines.push("| Token | Old→New byte | Pixels | New render OK |");
  lines.push("|-------|--------------|--------|---------------|");
  for (const s of payload.tokenDiff.samples) {
    lines.push(`| #${s.tokenId} | ${s.oldLabel} (${s.oldByte}) → ${s.newLabel} (${s.newByte}) | ${s.pixelsChanged ? "CHANGED" : "same"} | ${s.newRenderOk ? "✓" : "ISSUES"} |`);
  }
  lines.push("");

  lines.push("## Per-Character Galleries");
  lines.push("");
  for (const [label, info] of Object.entries(payload.galleries)) {
    lines.push(`### ${label}`);
    lines.push(`- File: \`galleries/${label}.png\``);
    lines.push(`- Population: ${info.population} tokens | Samples: ${info.sampleCount} | Render issues in samples: ${info.samplesWithIssues}`);
    lines.push("");
  }

  lines.push("## Trait / Variant Coverage");
  lines.push("");
  for (const [label, cov] of Object.entries(payload.coverage)) {
    lines.push(`### ${label} (${cov.tokenCount} tokens)`);
    const problems = cov.assetProblems;
    if (problems.length === 0 && cov.renderIssueTokens === 0) {
      lines.push("**All configured variants OK; zero render issues across full population.**");
    } else {
      if (problems.length) {
        lines.push(`**Asset problems (${problems.length}):**`);
        for (const p of problems) {
          lines.push(`- ${p.slot}/${p.variant}: ${p.file || "—"} → ${p.status}`);
        }
      }
      if (cov.renderIssueTokens) {
        lines.push(`**Render issues: ${cov.renderIssueTokens} tokens** (see coverage-report.json)`);
      }
    }
    lines.push("");
    lines.push("<details><summary>Configured slots</summary>");
    lines.push("");
    for (const [slot, data] of Object.entries(cov.slots)) {
      const bad = data.variants.filter((v) => !v.status.startsWith("OK"));
      if (bad.length === 0 && data.configuredCount <= 3) continue;
      lines.push(`**${slot}** (${data.configuredCount} configured):`);
      for (const v of data.variants) {
        const flag = v.status.startsWith("OK") ? "✓" : "✗";
        lines.push(`- ${flag} \`${v.name}\` → \`${v.file}\` [traits weight ${v.traitsWeight}, ${v.source}] ${v.status !== "OK" ? v.status : ""}`);
      }
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  fs.writeFileSync(path.join(REVIEW_DIR, "REVIEW.md"), lines.join("\n"));
}

function main() {
  console.log("Pre-regen review package (dry run)...");
  ensureDir(REVIEW_DIR);
  ensureDir(GALLERY_DIR);

  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const mintData = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
  const allTokenIds = Array.from({ length: mintData.length }, (_, i) => i + 1);

  console.log("Building coverage report...");
  const coverage = buildCoverageReport(traits, allTokenIds);

  console.log("Rendering per-character galleries...");
  const galleries = writeCharacterGalleries(traits, allTokenIds);

  console.log("Building token diff preview...");
  const tokenDiff = buildTokenDiffPreview(traits, mintData);

  const payload = {
    generatedAt: new Date().toISOString(),
    byteRegistry: byteRegistryTable(),
    coverage,
    galleries,
    tokenDiff: {
      totalChanges: tokenDiff.totalChanges,
      byCharacter: tokenDiff.byCharacter,
      pixelsChangedCount: tokenDiff.pixelsChangedCount,
      traitsOnlyCount: tokenDiff.traitsOnlyCount,
      diffImage: tokenDiff.diffImage,
      samples: tokenDiff.samples,
    },
  };

  fs.writeFileSync(path.join(REVIEW_DIR, "coverage-report.json"), JSON.stringify(coverage, null, 2));
  fs.writeFileSync(path.join(REVIEW_DIR, "token-diff-preview.json"), JSON.stringify(tokenDiff, null, 2));
  fs.writeFileSync(path.join(REVIEW_DIR, "byte-registry.json"), JSON.stringify(byteRegistryTable(), null, 2));
  writeMarkdownReport(payload);

  console.log("\nDone. Output:");
  console.log(`  ${REVIEW_DIR}/REVIEW.md`);
  console.log(`  ${REVIEW_DIR}/coverage-report.json`);
  console.log(`  ${REVIEW_DIR}/token-diff-preview.json`);
  console.log(`  ${REVIEW_DIR}/regen-diff-preview.png`);
  console.log(`  ${GALLERY_DIR}/*.png (${Object.keys(galleries).length} sheets)`);

  const totalAssetProblems = Object.values(coverage).reduce((n, c) => n + c.assetProblems.length, 0);
  const totalRenderIssues = Object.values(coverage).reduce((n, c) => n + c.renderIssueTokens, 0);
  console.log(`\nSummary: asset problems=${totalAssetProblems}, render issue tokens=${totalRenderIssues}, regen changes=${tokenDiff.totalChanges}`);
}

if (require.main === module) main();
