#!/usr/bin/env node
/**
 * PREVIEW/REPORT ONLY — NOT mint-data. Sandboxed weight preview pending JB's
 * frequency ruling from these render sheets (HEAD_SHAPE Angular %, hat rarity ladder).
 *
 * All weight mutations below are applied IN-MEMORY ONLY (mutated live objects from
 * chromies-config.js / a fresh traits.json parse) inside this process. Nothing is
 * written back to art-pipeline/chromies-config.js or art-pipeline/traits.json — the
 * repo's committed state is untouched (fresh process, nothing persists past exit).
 *
 * Main batch: tokens 5001-6000 (fresh range — no overlap with testrun_2000 [1-2000]
 * or testrun_1k_weights [3001-4239]), payload-first path, previews + 10 contact sheets.
 *
 * Proposed sandbox weights:
 *   HEAD_SHAPE  HeroA Male + Female: Angular 27.5% / Classic 72.5% (midpoint of JB's 25-30%)
 *   HAT ladder  Baseball 4.5% / Cowboy 2.5% / Bucket 1.2% / Bandana 1.2% / Beanie 0.6% / None 90%
 *               — ONLY Male_Bucket has delivered art. The hard-fail art guard
 *               (assertHatArtDelivered) forbids weight>0 on undelivered NOT-FINAL
 *               stubs, so this render can only evidence the Bucket rung (1.2%) for
 *               HeroA Male. Baseball/Cowboy/Bandana/Beanie and all Female/Chubby hat
 *               art remain weight-0 until JB's art lands — reported explicitly below,
 *               not silently worked around.
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
  assertHatArtDelivered,
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

const OUT_ROOT = path.join(REPO, "chromies-engine/generated/testrun_hat_headshape_1k");
const IMAGES = path.join(OUT_ROOT, "images");
const SHEETS = path.join(OUT_ROOT, "contact_sheets");
const REPORT = path.join(REPO, "reports/testrun_hat_headshape_1k_report.md");

const MAIN_COUNT = 1000;
const MAIN_START = 5001;
const MAIN_END = MAIN_START + MAIN_COUNT - 1;

function pad4(id) {
  return String(id).padStart(4, "0");
}

function findCharacter(name, gender) {
  const c = CHARACTERS.find((x) => x.name === name && x.gender === gender);
  if (!c) throw new Error(`Character not found: ${name}/${gender}`);
  return c;
}

async function main() {
  fs.mkdirSync(IMAGES, { recursive: true });
  fs.mkdirSync(SHEETS, { recursive: true });

  // Fresh traitsJson parse — mutations here do not touch art-pipeline/traits.json on disk.
  const traitsJson = JSON.parse(fs.readFileSync(path.join(REPO, "art-pipeline", SETTINGS.traitsFile), "utf8"));

  const sandboxLog = { headShape: [], hat: [] };

  // -------------------------------------------------------------------------
  // SANDBOX — in-memory only. HEAD_SHAPE rolled trait for HeroA Male + Female.
  // -------------------------------------------------------------------------
  const heroAMale = findCharacter("HeroA", "Male");
  const heroAFemale = findCharacter("HeroA", "Female");

  const maleHeadForcedBefore = heroAMale.forcedSlots.head;
  delete heroAMale.forcedSlots.head;
  heroAMale.slotVariantPool.head = { HeroA: 72.5, Male_Angular: 27.5 };
  sandboxLog.headShape.push({ character: "HeroA/Male", forcedBefore: maleHeadForcedBefore, poolAfter: { ...heroAMale.slotVariantPool.head } });

  const femaleHeadForcedBefore = heroAFemale.forcedSlots.head;
  delete heroAFemale.forcedSlots.head;
  heroAFemale.slotVariantPool.head = { HeroA_Female: 72.5, Female_Angular: 27.5 };
  sandboxLog.headShape.push({ character: "HeroA/Female", forcedBefore: femaleHeadForcedBefore, poolAfter: { ...heroAFemale.slotVariantPool.head } });

  // -------------------------------------------------------------------------
  // SANDBOX — in-memory only. HAT rarity ladder — Bucket only (art-delivered).
  // -------------------------------------------------------------------------
  const proposedLadderPct = { Baseball: 4.5, Cowboy: 2.5, Bucket: 1.2, Bandana: 1.2, Beanie: 0.6 };
  const deliveredHats = { Male: ["Bucket"], Female: [], Chubby: [] };

  heroAMale.slotVariantPool.hat = { Male_Bucket: proposedLadderPct.Bucket, None: 100 - proposedLadderPct.Bucket };
  sandboxLog.hat.push({ character: "HeroA/Male", poolAfter: { ...heroAMale.slotVariantPool.hat }, note: "Only Male_Bucket has delivered art — Baseball/Cowboy/Bandana/Beanie stay weight 0 (NOT-FINAL, hard-fail guard)." });
  // HeroA/Female + Chubby/Male: no delivered hat art at all — hat pool intentionally NOT
  // added (stays None via the empty-eligible-variants fallback); full ladder cannot be
  // evidenced for these archetypes yet.

  console.log("SANDBOX (in-memory only, nothing written to disk):");
  console.log(JSON.stringify(sandboxLog, null, 2));
  console.log("Proposed full rarity ladder (for JB context — NOT fully evidenceable this run):", JSON.stringify(proposedLadderPct));

  // Hard-fail guard — must pass given only Male_Bucket carries weight > 0.
  assertHatArtDelivered(traitsJson, CHARACTERS);
  console.log("assertHatArtDelivered: PASS (no weight>0 hat variant is missing delivered art)");

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
  if (legendarySkipped.length) console.log(`  SKIP-WITH-NOTICE (no legendary-finals art yet): #${legendarySkipped.join(", #")}`);
  if (legendaryInjected.length) console.log(`  INJECTION PATH (verbatim final art): #${legendaryInjected.join(", #")}`);

  // -------------------------------------------------------------------------
  // Main batch: 5001-6000
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

  const headShapeHits = {
    HeroA_Male: { Classic: 0, Angular: 0, total: 0 },
    HeroA_Female: { Classic: 0, Angular: 0, total: 0 },
  };
  const hatHits = { Male_Bucket: 0, hatNoneTotal: 0 };
  let hoodHatCollisions = 0;

  const sheetTokenIds = [];
  let sheetIndex = 1;
  const sheets = [];

  const t0 = Date.now();
  console.log(`\nMain batch: ${MAIN_COUNT} tokens (#${MAIN_START}-#${MAIN_END})...`);

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

      characterDist[record.character] = (characterDist[record.character] || 0) + 1;

      const headShapeVal = record.traitsDecoded.head_shape?.value;
      const hatVal = record.traitsDecoded.hat?.value;
      const hoodVal = record.traitsDecoded.hood?.value;
      const charKey = record.character;

      if (headShapeHits[charKey] && (headShapeVal === "Classic" || headShapeVal === "Angular")) {
        headShapeHits[charKey][headShapeVal]++;
        headShapeHits[charKey].total++;
      }
      if (hatVal === "Male_Bucket") hatHits.Male_Bucket++;
      if (hatVal === "None" || hatVal === undefined) hatHits.hatNoneTotal++;
      if (hatVal && hatVal !== "None" && hoodVal && hoodVal !== "None") hoodHatCollisions++;

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
  console.log(`Main batch done in ${mainRuntimeSec}s — rejects: ${rejects.length}, dup vectors: ${duplicateVectors.length}, hood/hat collisions resolved: ${hoodHatCollisions}`);

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const angularRate = (charKey) => {
    const h = headShapeHits[charKey];
    return h.total ? ((h.Angular / h.total) * 100).toFixed(2) : "n/a";
  };
  const maleCount = characterDist["HeroA_Male"] || 0;
  const bucketRate = maleCount ? ((hatHits.Male_Bucket / maleCount) * 100).toFixed(2) : "n/a";

  const lines = [
    "# Test run 1k — HAT slot + HEAD_SHAPE (Angular) sandboxed weight preview",
    "",
    "**STATUS: PREVIEW ONLY — NOT MINT DATA — pending JB's frequency ruling from these sheets.**",
    "All weight changes below were applied in-memory for this render only. Nothing was written to",
    "`art-pipeline/chromies-config.js` or `art-pipeline/traits.json`. Repo committed state is unchanged.",
    "",
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Main batch:** #${MAIN_START}-#${MAIN_END} (${MAIN_COUNT} tokens), runtime ${mainRuntimeSec}s`,
    "",
    "## Legendary IDs in range",
    "",
    `Full Normie Legendary set: #${LEGENDARY_TOKEN_IDS.join(", #")}`,
    `In range [${MAIN_START}-${MAIN_END}]: **${legendaryInRange.join(", #") || "none"}**`,
    "",
    "## Validation",
    "",
    `- Rejects: **${rejects.length}** (expect 0)`,
    `- Full payload duplicate vectors: **${duplicateVectors.length}** (expect 0)`,
    `- Trait-only duplicates: **${traitOnlyDup}** (expected; pixel buffer carries seed uniqueness)`,
    `- Warnings: **${[...new Set(warnings)].length}**`,
    `- hat<->hood collisions resolved (hood wins, hat forced to None): **${hoodHatCollisions}**`,
    `- assertHatArtDelivered: **PASS**`,
  ];
  if (rejects.length) {
    lines.push("", "**REJECTS (fail loudly, not resolved):**");
    for (const r of rejects) lines.push(`- #${r.tokenId}: ${r.reason}`);
  }
  lines.push(
    "",
    "## HEAD_SHAPE roll stats vs proposed weight (Angular 27.5% / Classic 72.5%)",
    "",
    "| Archetype | Classic | Angular | Total | Angular % (actual) | Proposed |",
    "|-----------|--------:|--------:|------:|--------------------:|---------:|",
    `| HeroA/Male | ${headShapeHits.HeroA_Male.Classic} | ${headShapeHits.HeroA_Male.Angular} | ${headShapeHits.HeroA_Male.total} | ${angularRate("HeroA_Male")}% | 27.5% |`,
    `| HeroA/Female | ${headShapeHits.HeroA_Female.Classic} | ${headShapeHits.HeroA_Female.Angular} | ${headShapeHits.HeroA_Female.total} | ${angularRate("HeroA_Female")}% | 27.5% |`,
    "",
    "**QA note (visual, from Phase 0/1 forced-preview):** `HEAD_Male_Angular.png` differs from the committed",
    "Classic `HEAD_HeroA.png` by only **9 of 554 opaque pixels (1.6%)** — well inside even the collection's",
    "lenient similarity-flag threshold (pixel IoU ~98.4%, vs `pixel_iou_reject: 0.80` in",
    "`chromies-engine/similarity/thresholds.json`). The Female pair is more differentiated (47/614 union",
    "pixels, ~92% IoU, concentrated in the jaw/cheek region). **The delivered Male_Angular art may not read",
    "as a distinct head shape at the roll rate proposed — recommend JB re-check the male asset specifically",
    "before ruling on frequency.** This is a recommendation, not a decision made on JB's behalf.",
    "",
    "## HAT roll stats vs proposed rarity ladder",
    "",
    "**Only `Male_Bucket` has delivered art. The hard-fail guard (`assertHatArtDelivered`) forbids giving",
    "weight to Baseball/Cowboy/Bandana/Beanie or any Female/Chubby hat until art lands — so only the Bucket",
    "rung could be evidenced this run. Reported explicitly, not worked around.**",
    "",
    "| Variant | Character pool | Proposed % | Actual hits / HeroA-Male | Actual % |",
    "|---------|-----------------|-----------:|---------------------------:|---------:|",
    `| Male_Bucket | HeroA/Male hat | 1.2% | ${hatHits.Male_Bucket} / ${maleCount} | ${bucketRate}% |`,
    "| Male_Baseball | HeroA/Male hat | 4.5% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |",
    "| Male_Cowboy | HeroA/Male hat | 2.5% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |",
    "| Male_Bandana | HeroA/Male hat | 1.2% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |",
    "| Male_Beanie | HeroA/Male hat | 0.6% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |",
    "| Female_* / Chubby_* (all 5 each) | — | ladder proposed | — | **NOT EVIDENCED — no art delivered for any Female/Chubby hat, weight 0** |",
    "",
    "## Character / palette frequency (main batch)",
    "",
    "| Character | Count | % |",
    "|-----------|------:|--:|",
  );
  for (const [k, v] of Object.entries(characterDist).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} | ${((v / MAIN_COUNT) * 100).toFixed(2)}% |`);
  }
  lines.push(
    "",
    "## Guard stats (main batch)",
    "",
    `- Anti-none-stack fires: ${getAntiNoneStackFireTotal()}`,
    `- Dedupe-reroll fires: ${getDedupeRerollFireTotal()}`,
    `- Combo-cap-reroll fires: ${getComboCapRerollFireTotal()}`,
    "",
    "## Contact sheets",
    "",
    `${sheets.length} sheets x 100 tokens -> \`contact_sheets/sheet_XX.png\``,
    "",
    "## Heavyweight gates",
    "",
    "Run once, separately, after this render — see Phase 4 gate-check output. Not embedded in this script",
    "per session rules (gates once, fail loudly, report — don't resolve).",
    "",
    "**Nothing lands until JB rules on: HEAD_SHAPE Angular frequency (and re-checks the Male_Angular asset",
    "per the QA note above), and the hat rarity ladder (once Baseball/Cowboy/Bandana/Beanie art + any",
    "Female/Chubby hat art is delivered).**",
  );
  fs.writeFileSync(REPORT, `${lines.join("\n")}\n`);

  console.log(`\nReport: ${REPORT}`);
  console.log(`Images: ${IMAGES}`);
  console.log(`Sheets: ${SHEETS}`);
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
