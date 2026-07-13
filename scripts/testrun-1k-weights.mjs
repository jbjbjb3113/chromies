#!/usr/bin/env node
/**
 * PREVIEW/REPORT ONLY — NOT mint-data. Sandboxed weight preview pending JB's weight-pass ruling.
 *
 * All weight mutations below are applied IN-MEMORY ONLY (mutated live objects from
 * chromies-config.js / a fresh traits.json parse) inside this process. Nothing is
 * written back to art-pipeline/chromies-config.js or art-pipeline/traits.json — the
 * repo's on-disk / committed state is never touched, so there is nothing to revert.
 *
 * Main batch:  tokens 3001–4000, payload-first path, previews + 10 contact sheets.
 * Side batch:  100 HeroA-Male tokens (scanned from 4001+, legendary excluded) with
 *              Male_Hooded hood-pool weight bumped 0.6% → ~3% → one contact sheet
 *              (HOODUP_3PCT_PREVIEW) for JB's frequency-ruling evidence.
 *
 * Output: chromies-engine/generated/testrun_1k_weights/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
process.chdir(path.join(REPO, "art-pipeline"));
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));

const chromiesConfig = require(path.join(REPO, "art-pipeline/chromies-config.js"));
const { SETTINGS, PALETTES, CHARACTERS } = chromiesConfig;
const {
  resetGenerationStats,
  getAntiNoneStackFireTotal,
  getDedupeRerollFireTotal,
  getComboCapRerollFireTotal,
  renderPNG,
  TraitDedupeGuard,
  ComboCapGuard,
} = require(path.join(REPO, "art-pipeline/generate.js"));
const {
  buildMintRecord,
  PayloadDedupeGuard,
  resetPayloadDedupeLog,
} = require(path.join(REPO, "art-pipeline/bridge-mint-data.js"));
const { isLegendaryToken, LEGENDARY_TOKEN_IDS } = require(path.join(REPO, "art-pipeline/legendary-token-ids.js"));
const { legendaryFinalExists } = require(path.join(REPO, "art-pipeline/legendary-finals.js"));

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

const OUT_ROOT = path.join(REPO, "chromies-engine/generated/testrun_1k_weights");
const IMAGES = path.join(OUT_ROOT, "images");
const SHEETS = path.join(OUT_ROOT, "contact_sheets");
const HOODUP_DIR = path.join(OUT_ROOT, "hoodup_3pct_preview");
const REPORT = path.join(REPO, "reports/testrun_1k_weights_report.md");

const MAIN_COUNT = 1000;
const MAIN_START = 3001;
const MAIN_END = MAIN_START + MAIN_COUNT - 1;

function pad4(id) {
  return String(id).padStart(4, "0");
}

// ---------------------------------------------------------------------------
// SANDBOX — in-memory only, never written to disk.
// ---------------------------------------------------------------------------

const DEAD_LEGACY = {
  hair: ["Mohawk", "Pompadour", "MrT", "Afro", "Dreads", "Surfer", "FadeRight", "Buns", "AZVet"],
  eyes: ["Signal", "BlackEye", "MakeUp", "RunningMascara", "Stoned"],
};

function zeroDeadLegacyWeights(traitsJson) {
  const changes = [];
  for (const [slot, names] of Object.entries(DEAD_LEGACY)) {
    const variants = traitsJson.slots[slot]?.variants || [];
    for (const name of names) {
      const v = variants.find((x) => x.name === name);
      if (!v) { changes.push({ slot, name, before: null, after: null, note: "NOT FOUND" }); continue; }
      changes.push({ slot, name, before: v.weight, after: 0 });
      v.weight = 0;
    }
  }
  return changes;
}

function findCharacter(name, gender) {
  const c = CHARACTERS.find((x) => x.name === name && x.gender === gender);
  if (!c) throw new Error(`Character not found: ${name}/${gender}`);
  return c;
}

async function main() {
  fs.mkdirSync(IMAGES, { recursive: true });
  fs.mkdirSync(SHEETS, { recursive: true });
  fs.mkdirSync(HOODUP_DIR, { recursive: true });

  const sandboxLog = { deadLegacy: [], azvet: [], hoodup: null };

  // Fresh traitsJson parse — mutations here do not touch art-pipeline/traits.json on disk.
  const traitsJson = JSON.parse(fs.readFileSync(path.join(REPO, "art-pipeline", SETTINGS.traitsFile), "utf8"));
  sandboxLog.deadLegacy = zeroDeadLegacyWeights(traitsJson);

  // Live CHARACTERS singleton (shared with generate.js's require cache) — mutated in place.
  const sideProfileFemale = findCharacter("SideProfile", "Female");
  const azvetFemaleBefore = sideProfileFemale.slotVariantPool.hair.SP_AZVet_Female;
  sideProfileFemale.slotVariantPool.hair.SP_AZVet_Female = 35; // ~5x bump — coverage-audit zero-roll evidence
  sandboxLog.azvet.push({
    character: "SideProfile/Female", slot: "hair", name: "SP_AZVet_Female",
    before: azvetFemaleBefore, after: 35,
  });

  const chubbyMale = findCharacter("Chubby", "Male");
  const azvetChubbyBefore = chubbyMale.slotVariantPool.hair.Chubby_AZVet;
  chubbyMale.slotVariantPool.hair.Chubby_AZVet = azvetChubbyBefore * 2;
  sandboxLog.azvet.push({
    character: "Chubby/Male", slot: "hair", name: "Chubby_AZVet",
    before: azvetChubbyBefore, after: azvetChubbyBefore * 2,
  });

  console.log("SANDBOX (in-memory only, nothing written to disk):");
  console.log(JSON.stringify(sandboxLog, null, 2));

  // -------------------------------------------------------------------------
  // Legendary-in-range confirmation
  // -------------------------------------------------------------------------
  const legendaryInRange = LEGENDARY_TOKEN_IDS.filter((id) => id >= MAIN_START && id <= MAIN_END);
  const legendarySkipped = [];
  const legendaryInjected = [];
  for (const id of legendaryInRange) {
    if (legendaryFinalExists(id)) legendaryInjected.push(id);
    else legendarySkipped.push(id);
  }
  console.log(`Legendary IDs in range [${MAIN_START}-${MAIN_END}]: ${legendaryInRange.join(", ") || "none"}`);
  if (legendarySkipped.length) {
    console.log(`  SKIP-WITH-NOTICE (no legendary-finals art yet): #${legendarySkipped.join(", #")}`);
  }
  if (legendaryInjected.length) {
    console.log(`  INJECTION PATH (verbatim final art): #${legendaryInjected.join(", #")}`);
  }

  // -------------------------------------------------------------------------
  // Main batch: 3001–4000
  // -------------------------------------------------------------------------
  resetGenerationStats();
  resetPayloadDedupeLog();
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();

  const rejects = [];
  const warnings = [];
  const skippedLegendary = [];
  const traitVectorMap = new Map();
  const traitOnlyMap = new Map();
  let traitOnlyDup = 0;
  const duplicateVectors = [];
  const characterDist = {};
  const paletteDist = {};

  const azvetHits = { SP_AZVet_Female: 0, Chubby_AZVet: 0 };
  const deadLegacyHits = {};
  for (const [slot, names] of Object.entries(DEAD_LEGACY)) {
    for (const name of names) deadLegacyHits[`${slot}:${name}`] = 0;
  }

  const sheetTokenIds = [];
  let sheetIndex = 1;
  const sheets = [];

  const t0 = Date.now();
  console.log(`\nMain batch: ${MAIN_COUNT} tokens (#${MAIN_START}-#${MAIN_END})…`);

  for (let tokenId = MAIN_START; tokenId <= MAIN_END; tokenId++) {
    if (isLegendaryToken(tokenId) && !legendaryFinalExists(tokenId)) {
      skippedLegendary.push(tokenId);
      console.log(`  [skip-with-notice] #${tokenId} legendary slot, no final art yet — excluded from render/reject count`);
      continue;
    }
    try {
      const record = buildMintRecord(tokenId, traitsJson, warnings, dedupeGuard, comboCapGuard, payloadGuard);
      const buf = unpackPixels(record.pixelsHex);
      const palette = PALETTES[record.palette];
      if (!palette) throw new Error(`Unknown palette ${record.palette}`);
      const pngBuf = renderPNG(buf, palette);
      fs.writeFileSync(path.join(IMAGES, `chromie_${pad4(tokenId)}.png`), pngBuf);

      paletteDist[record.palette] = (paletteDist[record.palette] || 0) + 1;
      characterDist[record.character] = (characterDist[record.character] || 0) + 1;

      const hair = record.traitsDecoded.hair?.value;
      const eyes = record.traitsDecoded.eyes?.value;
      if (hair === "SP_AZVet_Female") azvetHits.SP_AZVet_Female++;
      if (hair === "Chubby_AZVet") azvetHits.Chubby_AZVet++;
      if (DEAD_LEGACY.hair.includes(hair)) deadLegacyHits[`hair:${hair}`]++;
      if (DEAD_LEGACY.eyes.includes(eyes)) deadLegacyHits[`eyes:${eyes}`]++;

      const vecKey = `${record.pixelsHex}|${record.traitsHex}`.toLowerCase();
      const traitKey = record.traitsHex.toLowerCase();
      if (traitVectorMap.has(vecKey)) {
        duplicateVectors.push({ a: traitVectorMap.get(vecKey), b: tokenId });
      } else {
        traitVectorMap.set(vecKey, tokenId);
      }
      if (traitOnlyMap.has(traitKey)) traitOnlyDup += 1;
      else traitOnlyMap.set(traitKey, tokenId);

      sheetTokenIds.push(tokenId);
      if (sheetTokenIds.length === 100) {
        sheets.push(await buildContactSheet([...sheetTokenIds], IMAGES, path.join(SHEETS, `sheet_${String(sheetIndex).padStart(2, "0")}.png`)));
        sheetTokenIds.length = 0;
        sheetIndex += 1;
      }
    } catch (err) {
      rejects.push({ tokenId, reason: err.message?.split("\n")[0] || String(err) });
    }
  }

  if (sheetTokenIds.length > 0) {
    sheets.push(await buildContactSheet([...sheetTokenIds], IMAGES, path.join(SHEETS, `sheet_${String(sheetIndex).padStart(2, "0")}.png`)));
    sheetTokenIds.length = 0;
    sheetIndex += 1;
  }

  const mainRuntimeSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Main batch done in ${mainRuntimeSec}s — rejects: ${rejects.length}, dup vectors: ${duplicateVectors.length}`);

  // -------------------------------------------------------------------------
  // Side batch: HOODUP_3PCT_PREVIEW — 100 HeroA-Male tokens, Male_Hooded @ ~3%
  // -------------------------------------------------------------------------
  const heroAMale = findCharacter("HeroA", "Male");
  const hoodBefore = { ...heroAMale.slotVariantPool.hood };
  heroAMale.slotVariantPool.hood = { Classic: 20, Male_Hooded: 3, None: 77 };
  sandboxLog.hoodup = { character: "HeroA/Male", slot: "hood", before: hoodBefore, after: { ...heroAMale.slotVariantPool.hood } };
  console.log(`\nSide-batch sandbox — HeroA/Male hood pool: ${JSON.stringify(hoodBefore)} → ${JSON.stringify(heroAMale.slotVariantPool.hood)}`);

  const hoodupDedupeGuard = new TraitDedupeGuard();
  const hoodupComboCapGuard = new ComboCapGuard();
  const hoodupWarnings = [];
  const hoodupTokenIds = [];
  const hoodupRejects = [];
  let hoodupHits = 0;
  let scanId = MAIN_END + 1;
  const SIDE_BATCH_SIZE = 100;
  const scanned = [];

  const { pickCharacter } = require(path.join(REPO, "art-pipeline/generate.js"));

  while (hoodupTokenIds.length < SIDE_BATCH_SIZE && scanId < MAIN_END + 20000) {
    if (isLegendaryToken(scanId)) { scanId++; continue; }
    const character = pickCharacter(scanId);
    scanned.push(scanId);
    if (character.name === "HeroA" && character.gender === "Male") {
      hoodupTokenIds.push(scanId);
    }
    scanId++;
  }
  console.log(`Side batch: found ${hoodupTokenIds.length} HeroA-Male tokens by scanning IDs #${MAIN_END + 1}-#${scanId - 1} (${scanned.length} scanned)`);

  const t1 = Date.now();
  for (const tokenId of hoodupTokenIds) {
    try {
      const record = buildMintRecord(tokenId, traitsJson, hoodupWarnings, hoodupDedupeGuard, hoodupComboCapGuard, null);
      const buf = unpackPixels(record.pixelsHex);
      const palette = PALETTES[record.palette];
      const pngBuf = renderPNG(buf, palette);
      fs.writeFileSync(path.join(HOODUP_DIR, `chromie_${pad4(tokenId)}.png`), pngBuf);
      if (record.traitsDecoded.hood?.value === "Male_Hooded") hoodupHits++;
    } catch (err) {
      hoodupRejects.push({ tokenId, reason: err.message?.split("\n")[0] || String(err) });
    }
  }
  const hoodupRuntimeSec = ((Date.now() - t1) / 1000).toFixed(1);

  const hoodupSheetPath = await buildContactSheet(hoodupTokenIds, HOODUP_DIR, path.join(HOODUP_DIR, "HOODUP_3PCT_PREVIEW.png"));
  console.log(`HOODUP_3PCT_PREVIEW: ${hoodupHits}/${hoodupTokenIds.length} Male_Hooded hits (${((hoodupHits / hoodupTokenIds.length) * 100).toFixed(1)}%) — sheet: ${hoodupSheetPath}`);

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const totalCharWeight = CHARACTERS.reduce((s, c) => s + (c.weight || 0), 0);
  const spFemaleFrac = findCharacter("SideProfile", "Female").weight / totalCharWeight;
  const chubbyFrac = findCharacter("Chubby", "Male").weight / totalCharWeight;
  const spFemaleHairPoolAfter = findCharacter("SideProfile", "Female").slotVariantPool.hair;
  const spFemaleHairSumAfter = Object.values(spFemaleHairPoolAfter).reduce((s, w) => s + w, 0);
  const chubbyHairPoolAfter = findCharacter("Chubby", "Male").slotVariantPool.hair;
  const chubbyHairSumAfter = Object.values(chubbyHairPoolAfter).reduce((s, w) => s + w, 0);

  const expectedAzvetFemale = MAIN_COUNT * spFemaleFrac * (35 / spFemaleHairSumAfter);
  const expectedAzvetChubby = MAIN_COUNT * chubbyFrac * (azvetChubbyBefore * 2 / chubbyHairSumAfter);

  const lines = [
    "# Test run 1k — sandboxed weight preview (payload-first)",
    "",
    "**STATUS: PREVIEW ONLY — NOT MINT DATA — pending JB's weight-pass ruling.**",
    "All weight changes below were applied in-memory for this render only. Nothing was written to",
    "`art-pipeline/chromies-config.js` or `art-pipeline/traits.json`. Repo is unchanged / committed-clean.",
    "",
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Main batch:** #${MAIN_START}-#${MAIN_END} (${MAIN_COUNT} tokens), runtime ${mainRuntimeSec}s`,
    `**Side batch:** ${hoodupTokenIds.length} HeroA-Male tokens (scanned #${MAIN_END + 1}+), runtime ${hoodupRuntimeSec}s`,
    "",
    "## Legendary IDs in range",
    "",
    `Full Normie Legendary set: #${LEGENDARY_TOKEN_IDS.join(", #")}`,
    `In range [${MAIN_START}-${MAIN_END}]: **${legendaryInRange.join(", #") || "none"}**`,
  ];
  if (legendaryInRange.length) {
    for (const id of legendaryInRange) {
      lines.push(
        legendaryFinalExists(id)
          ? `- #${id}: **injection path** (verbatim final art rendered)`
          : `- #${id}: **skip-with-notice** — no \`legendary-finals/${pad4(id)}.png\` yet (DOPEMIND/UPCOMING2 have no head asset). Excluded from render + reject count.`,
      );
    }
  }
  lines.push(
    "",
    "## Main batch — validation",
    "",
    `- Rejects: **${rejects.length}** (expect 0)`,
    `- Legendary skip-with-notice: **${skippedLegendary.length}** (#${skippedLegendary.join(", #") || "—"})`,
    `- Full payload duplicate vectors: **${duplicateVectors.length}** (expect 0)`,
    `- Trait-only duplicates: **${traitOnlyDup}** (expected; pixel buffer carries seed uniqueness)`,
    `- Warnings: **${[...new Set(warnings)].length}**`,
  );
  if (rejects.length) {
    lines.push("", "**REJECTS (fail loudly, not resolved):**");
    for (const r of rejects) lines.push(`- #${r.tokenId}: ${r.reason}`);
  }
  lines.push(
    "",
    "## Roll stats — sandboxed weights vs expected",
    "",
    "| Variant | Character pool | Before → After weight | Actual (this run) | Naive expected |",
    "|---------|-----------------|------------------------|-------------------:|----------------:|",
    `| SP_AZVet_Female | SideProfile/Female hair | ${azvetFemaleBefore} → 35 | ${azvetHits.SP_AZVet_Female} | ${expectedAzvetFemale.toFixed(2)} |`,
    `| Chubby_AZVet | Chubby/Male hair | ${azvetChubbyBefore} → ${azvetChubbyBefore * 2} | ${azvetHits.Chubby_AZVet} | ${expectedAzvetChubby.toFixed(2)} |`,
    "",
    "### 14 dead-legacy weights (zeroed) — actual hits (expect 0 for all; unreachable via any active character pool prior to this change too)",
    "",
    "| Slot | Variant | Actual hits |",
    "|------|---------|-------------:|",
  );
  for (const [key, count] of Object.entries(deadLegacyHits)) {
    const [slot, name] = key.split(":");
    lines.push(`| ${slot} | ${name} | ${count} |`);
  }
  lines.push(
    "",
    "## HOODUP_3PCT_PREVIEW — Male_Hooded frequency-ruling evidence",
    "",
    "**This is evidence for JB's frequency ruling, not a proposed weight change.**",
    "",
    `- HeroA/Male hood pool (sandboxed): \`${JSON.stringify(hoodBefore)}\` → \`${JSON.stringify(heroAMale.slotVariantPool.hood)}\``,
    `- Committed/natural rate: **0.6%** of HeroA Male hood pool`,
    `- Sandboxed preview rate: **~3%**`,
    `- Batch: ${hoodupTokenIds.length} HeroA-Male tokens, scanned from #${MAIN_END + 1} onward (legendary IDs excluded from scan)`,
    `- Male_Hooded hits: **${hoodupHits} / ${hoodupTokenIds.length}** (${((hoodupHits / hoodupTokenIds.length) * 100).toFixed(1)}%)`,
    `- Rejects in side batch: **${hoodupRejects.length}**`,
    `- Contact sheet: \`chromies-engine/generated/testrun_1k_weights/hoodup_3pct_preview/HOODUP_3PCT_PREVIEW.png\``,
  );
  if (hoodupRejects.length) {
    lines.push("", "**Side-batch rejects:**");
    for (const r of hoodupRejects) lines.push(`- #${r.tokenId}: ${r.reason}`);
  }
  lines.push(
    "",
    "## Character / palette frequency (main batch)",
    "",
    "| Character | Count | % |",
    "|-----------|------:|--:|",
  );
  for (const [k, v] of Object.entries(characterDist).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} | ${((v / MAIN_COUNT) * 100).toFixed(2)}% |`);
  }
  lines.push("", "## Guard stats (main batch)", "",
    `- Anti-none-stack fires: ${getAntiNoneStackFireTotal()}`,
    `- Dedupe-reroll fires: ${getDedupeRerollFireTotal()}`,
    `- Combo-cap-reroll fires: ${getComboCapRerollFireTotal()}`,
    "",
    "## Contact sheets",
    "",
    `${sheets.length} sheets × 100 tokens → \`contact_sheets/sheet_XX.png\` (main batch)`,
    `1 sheet × ${hoodupTokenIds.length} tokens → \`hoodup_3pct_preview/HOODUP_3PCT_PREVIEW.png\` (side batch)`,
    "",
    "## Heavyweight gates",
    "",
    "Run once, separately, after this render — see follow-up gate-check output. Not embedded in this script",
    "per session rules (gates once, fail loudly, report — don't resolve).",
    "",
    "**Nothing lands until JB rules on: SP_AZVet_Female routing/weight, Chubby_AZVet 2x, dead-legacy zeroing, Male_Hooded frequency.**",
  );
  fs.writeFileSync(REPORT, `${lines.join("\n")}\n`);

  console.log(`\nReport: ${REPORT}`);
  console.log(`Images: ${IMAGES}`);
  console.log(`Sheets: ${SHEETS}`);
  console.log(`Hoodup preview: ${HOODUP_DIR}`);
}

function unpackPixels(hex) {
  const packed = Buffer.from(hex.replace(/^0x/i, ""), "hex");
  const out = new Uint8Array(PX);
  for (let i = 0; i < PX; i++) {
    const byteIndex = i >> 1;
    out[i] = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
  }
  return out;
}

async function buildContactSheet(tokenIds, srcDir, outPath) {
  const COLS = 10;
  const ROWS = Math.ceil(tokenIds.length / COLS);
  const SCALE = 6;
  const CELL = GRID * SCALE;
  const LABEL_H = 20;
  const PAD = 6;
  const sheetW = COLS * (CELL + PAD) + PAD;
  const sheetH = ROWS * (CELL + LABEL_H + PAD) + PAD;
  const composites = [];

  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (CELL + PAD);
    const y = PAD + row * (CELL + LABEL_H + PAD);
    const imgPath = path.join(srcDir, `chromie_${pad4(tokenId)}.png`);
    const upscaled = await sharp(imgPath)
      .resize(CELL, CELL, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    composites.push({ input: upscaled, left: x, top: y });
    const svg = Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="4" y="15" fill="#ddd" font-family="monospace" font-size="12">#${tokenId}</text></svg>`,
    );
    composites.push({ input: svg, left: x, top: y + CELL + 2 });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
  return outPath;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
