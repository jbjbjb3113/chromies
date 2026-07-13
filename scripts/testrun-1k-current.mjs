#!/usr/bin/env node
/**
 * Quick render — 1000 tokens, fresh range (#7001-#8000), REAL committed
 * config, no sandboxing whatsoever. Render + report only, no gates (nothing
 * changed since the last green gate run).
 *
 * KNOWN PRECONDITION (confirmed with user before running): Angular head-shape
 * is NOT live — HeroA Male/Female still have forcedSlots.head locking them to
 * Classic, so Angular is expected to show 0/1000 here. This is documented
 * state, not a bug. Hats (Baseball/Bucket/Bandana) and Male/Female_Hooded ARE
 * live at committed weight.
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

const { PALETTES, CHARACTERS } = require(path.join(REPO, "art-pipeline/chromies-config.js"));
const {
  resetGenerationStats,
  getAntiNoneStackFireTotal,
  getDedupeRerollFireTotal,
  getComboCapRerollFireTotal,
  renderPNG,
  renderSVG,
  TraitDedupeGuard,
  ComboCapGuard,
  assertHatArtDelivered,
} = require(path.join(REPO, "art-pipeline/generate.js"));
const {
  buildMintRecord,
  PayloadDedupeGuard,
  resetPayloadDedupeLog,
} = require(path.join(REPO, "art-pipeline/bridge-mint-data.js"));
const { isLegendaryToken, LEGENDARY_TOKEN_IDS } = require(path.join(REPO, "art-pipeline/legendary-token-ids.js"));
const { legendaryFinalExists } = require(path.join(REPO, "art-pipeline/legendary-finals.js"));

const GRID = require(path.join(REPO, "art-pipeline/chromies-config.js")).SETTINGS.grid;
const PX = GRID * GRID;

const OUT_ROOT = path.join(REPO, "chromies-engine/generated/testrun_1k_current");
const IMAGES = path.join(OUT_ROOT, "images");
const SVGS = path.join(OUT_ROOT, "svgs");
const SHEETS = path.join(OUT_ROOT, "contact_sheets");
const REPORT = path.join(REPO, "reports/testrun_1k_current_report.md");

const MAIN_COUNT = 1000;
const MAIN_START = 7001;
const MAIN_END = MAIN_START + MAIN_COUNT - 1;

function pad4(id) { return String(id).padStart(4, "0"); }

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
    const upscaled = await sharp(imgPath).resize(CELL, CELL, { kernel: sharp.kernel.nearest }).png().toBuffer();
    composites.push({ input: upscaled, left: x, top: y });
    const svg = Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="4" y="15" fill="#ddd" font-family="monospace" font-size="12">#${tokenId}</text></svg>`,
    );
    composites.push({ input: svg, left: x, top: y + CELL + 2 });
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 1 } } })
    .composite(composites).png().toFile(outPath);
  return outPath;
}

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(IMAGES, { recursive: true });
  fs.mkdirSync(SVGS, { recursive: true });
  fs.mkdirSync(SHEETS, { recursive: true });

  const traitsJson = JSON.parse(fs.readFileSync(path.join(REPO, "art-pipeline", "traits.json"), "utf8"));

  // Precondition checks — stop immediately, don't loop, if these fail.
  try {
    assertHatArtDelivered(traitsJson, CHARACTERS);
  } catch (err) {
    console.error("PRECONDITION FAILED: assertHatArtDelivered\n", err.message);
    process.exit(1);
  }
  const requiredFiles = [
    "male/HOOD_Male_Hooded.png", "female/HOOD_Female_Hooded.png",
    "male/HAT_Male_Baseball.png", "male/HAT_Male_Bucket.png", "male/HAT_Male_Bandana.png",
    "female/HAT_Female_Baseball.png", "female/HAT_Female_Bucket.png", "female/HAT_Female_Bandana.png",
    "chubby/HAT_Chubby_Baseball.png", "chubby/HAT_Chubby_Bucket.png", "chubby/HAT_Chubby_Bandana.png",
  ];
  const missing = requiredFiles.filter((f) => !fs.existsSync(path.join(REPO, "art-pipeline/components", f)));
  if (missing.length) {
    console.error("PRECONDITION FAILED: missing component file(s):\n  " + missing.join("\n  "));
    process.exit(1);
  }
  console.log("Preconditions PASS: assertHatArtDelivered OK, all required live-art files present on disk.");

  const legendaryInRange = LEGENDARY_TOKEN_IDS.filter((id) => id >= MAIN_START && id <= MAIN_END);
  console.log(`Legendary IDs in range [${MAIN_START}-${MAIN_END}]: ${legendaryInRange.join(", ") || "none"}`);

  resetGenerationStats();
  resetPayloadDedupeLog();
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();

  const rejects = [];
  const traitVectorMap = new Map();
  const duplicateVectors = [];
  const characterDist = {};
  const hatHits = {};
  const hatPoolTotals = { HeroA_Male: 0, HeroA_Female: 0, Chubby_Male: 0 };
  const headShapeHits = { HeroA_Male: { Classic: 0, Angular: 0, total: 0 }, HeroA_Female: { Classic: 0, Angular: 0, total: 0 } };
  const hoodHits = { Male_Hooded: 0, Female_Hooded: 0 };
  const hoodPoolTotals = { HeroA_Male: 0, HeroA_Female: 0 };

  const sheetTokenIds = [];
  let sheetIndex = 1;
  const sheets = [];

  for (let tokenId = MAIN_START; tokenId <= MAIN_END; tokenId++) {
    if (isLegendaryToken(tokenId) && !legendaryFinalExists(tokenId)) continue;
    try {
      const record = buildMintRecord(tokenId, traitsJson, [], dedupeGuard, comboCapGuard, payloadGuard);
      const buf = unpackPixels(record.pixelsHex);
      const palette = PALETTES[record.palette];
      if (!palette) throw new Error(`Unknown palette ${record.palette}`);
      const pngBuf = renderPNG(buf, palette);
      fs.writeFileSync(path.join(IMAGES, `chromie_${pad4(tokenId)}.png`), pngBuf);
      fs.writeFileSync(path.join(SVGS, `chromie_${pad4(tokenId)}.svg`), renderSVG(buf, palette));

      const charKey = record.character;
      characterDist[charKey] = (characterDist[charKey] || 0) + 1;

      const hatVal = record.traitsDecoded.hat?.value ?? "None";
      const headShapeVal = record.traitsDecoded.head_shape?.value;
      const hoodVal = record.traitsDecoded.hood?.value ?? "None";

      if (charKey === "HeroA_Male" || charKey === "HeroA_Female" || charKey === "Chubby_Male") {
        hatPoolTotals[charKey] += 1;
        if (hatVal !== "None") hatHits[hatVal] = (hatHits[hatVal] || 0) + 1;
      }
      if (headShapeHits[charKey] && (headShapeVal === "Classic" || headShapeVal === "Angular")) {
        headShapeHits[charKey][headShapeVal]++;
        headShapeHits[charKey].total++;
      }
      if (charKey === "HeroA_Male" || charKey === "HeroA_Female") {
        hoodPoolTotals[charKey] += 1;
        if (hoodVal === "Male_Hooded") hoodHits.Male_Hooded += 1;
        if (hoodVal === "Female_Hooded") hoodHits.Female_Hooded += 1;
      }

      const vecKey = `${record.pixelsHex}|${record.traitsHex}`.toLowerCase();
      if (traitVectorMap.has(vecKey)) duplicateVectors.push({ a: traitVectorMap.get(vecKey), b: tokenId });
      else traitVectorMap.set(vecKey, tokenId);

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
  }

  const runtimeSec = ((Date.now() - t0) / 1000).toFixed(1);
  const pct = (hits, total) => (total ? ((hits / total) * 100).toFixed(2) : "n/a");

  const lines = [
    "# Quick render — 1000 tokens, everything live, real committed config",
    "",
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Range:** #${MAIN_START}-#${MAIN_END} (${MAIN_COUNT} tokens), runtime ${runtimeSec}s`,
    "No sandboxing. No gates run this pass (nothing changed since the last green gate run).",
    "",
    "## Legendary IDs in range",
    "",
    `**${legendaryInRange.join(", #") || "none"}**`,
    "",
    "## Validation",
    "",
    `- Rejects: **${rejects.length}** (expect 0)`,
    `- Duplicate payload vectors: **${duplicateVectors.length}** (expect 0)`,
    "",
    "## Hat roll counts vs committed ladder (Baseball 4.5% / Bucket 1.2% / Bandana 1.2%)",
    "",
    "| Character pool | Total | Baseball | Bucket | Bandana | Baseball % | Bucket % | Bandana % |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [charKey, label, baseballName, bucketName, bandanaName] of [
    ["HeroA_Male", "HeroA Male", "Male_Baseball", "Male_Bucket", "Male_Bandana"],
    ["HeroA_Female", "HeroA Female", "Female_Baseball", "Female_Bucket", "Female_Bandana"],
    ["Chubby_Male", "Chubby", "Chubby_Baseball", "Chubby_Bucket", "Chubby_Bandana"],
  ]) {
    const total = hatPoolTotals[charKey];
    const bb = hatHits[baseballName] || 0, bk = hatHits[bucketName] || 0, bd = hatHits[bandanaName] || 0;
    lines.push(`| ${label} | ${total} | ${bb} | ${bk} | ${bd} | ${pct(bb, total)}% | ${pct(bk, total)}% | ${pct(bd, total)}% |`);
  }
  lines.push(
    "",
    "## Head-shape (Angular) roll counts — KNOWN NOT LIVE, expect 0",
    "",
    "**Confirmed before this render: `forcedSlots.head` still locks HeroA Male/Female to Classic in committed",
    "config. Angular was only ever exercised in sandboxed test scripts — never flipped to a real weight.",
    "0/1000 here is expected, documented state, not a bug.**",
    "",
    "| Archetype | Classic | Angular | Total |",
    "|---|---:|---:|---:|",
    `| HeroA_Male | ${headShapeHits.HeroA_Male.Classic} | ${headShapeHits.HeroA_Male.Angular} | ${headShapeHits.HeroA_Male.total} |`,
    `| HeroA_Female | ${headShapeHits.HeroA_Female.Classic} | ${headShapeHits.HeroA_Female.Angular} | ${headShapeHits.HeroA_Female.total} |`,
    "",
    "## Hood-up (Male_Hooded / Female_Hooded) roll counts vs committed weight (0.6% each)",
    "",
    "| Character pool | Total | Hood-up hits | Actual % | Committed % |",
    "|---|---:|---:|---:|---:|",
    `| HeroA Male | ${hoodPoolTotals.HeroA_Male} | ${hoodHits.Male_Hooded} | ${pct(hoodHits.Male_Hooded, hoodPoolTotals.HeroA_Male)}% | 0.6% |`,
    `| HeroA Female | ${hoodPoolTotals.HeroA_Female} | ${hoodHits.Female_Hooded} | ${pct(hoodHits.Female_Hooded, hoodPoolTotals.HeroA_Female)}% | 0.6% |`,
  );
  if (rejects.length) {
    lines.push("", "**REJECTS (fail loudly, not resolved):**");
    for (const r of rejects) lines.push(`- #${r.tokenId}: ${r.reason}`);
  }
  lines.push(
    "",
    "## Character distribution",
    "",
    "| Character | Count | % |",
    "|---|---:|---:|",
  );
  for (const [k, v] of Object.entries(characterDist).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} | ${((v / MAIN_COUNT) * 100).toFixed(2)}% |`);
  }
  lines.push(
    "",
    "## Guard stats",
    "",
    `- Anti-none-stack fires: ${getAntiNoneStackFireTotal()}`,
    `- Dedupe-reroll fires: ${getDedupeRerollFireTotal()}`,
    `- Combo-cap-reroll fires: ${getComboCapRerollFireTotal()}`,
    "",
    "## Contact sheets",
    "",
    `${sheets.length} sheets x 100 tokens -> \`contact_sheets/sheet_XX.png\``,
  );
  fs.writeFileSync(REPORT, `${lines.join("\n")}\n`);

  console.log(`\nDone in ${runtimeSec}s — rejects: ${rejects.length}, dup vectors: ${duplicateVectors.length}`);
  console.log(`Hat hits: ${JSON.stringify(hatHits)}`);
  console.log(`Head-shape Angular: HeroA_Male ${headShapeHits.HeroA_Male.Angular}/${headShapeHits.HeroA_Male.total}, HeroA_Female ${headShapeHits.HeroA_Female.Angular}/${headShapeHits.HeroA_Female.total}`);
  console.log(`Hood-up hits: Male_Hooded ${hoodHits.Male_Hooded}/${hoodPoolTotals.HeroA_Male}, Female_Hooded ${hoodHits.Female_Hooded}/${hoodPoolTotals.HeroA_Female}`);
  console.log(`Report: ${REPORT}`);
  console.log(`Images: ${IMAGES}`);
  console.log(`SVGs: ${SVGS}`);
  console.log(`Sheets: ${SHEETS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
