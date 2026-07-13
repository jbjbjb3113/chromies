#!/usr/bin/env node
/**
 * Payload-first preview test render: tokens 1–2000.
 * Preview/report only — NOT mint-data batch.
 * Output: chromies-engine/generated/testrun_2000/
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

const { SETTINGS, PALETTES } = require(path.join(REPO, "art-pipeline/chromies-config.js"));
const {
  pickCharacter,
  resolveUniqueTokenTraits,
  TraitDedupeGuard,
  ComboCapGuard,
  resetGenerationStats,
  getAntiNoneStackFireTotal,
  getDedupeRerollFireTotal,
  getComboCapRerollFireTotal,
  renderPNG,
  upscalePNG,
} = require(path.join(REPO, "art-pipeline/generate.js"));
const { buildMintRecord, packPixels, PayloadDedupeGuard, resetPayloadDedupeLog, getPayloadDedupeLog } = require(path.join(REPO, "art-pipeline/bridge-mint-data.js"));
const { isLegendaryToken, LEGENDARY_TOKEN_IDS } = require(path.join(REPO, "art-pipeline/legendary-token-ids.js"));
const { PNG } = require("pngjs");

const COUNT = 2000;
const START = 1;
const OUT_ROOT = path.join(REPO, "chromies-engine/generated/testrun_2000");
const IMAGES = path.join(OUT_ROOT, "images");
const LEGENDARY_8X = path.join(OUT_ROOT, "legendary_8x");
const SHEETS = path.join(OUT_ROOT, "contact_sheets");
const REPORT = path.join(REPO, "reports/testrun_2000_report.md");
const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const LEGENDARY_IN_RANGE = [45, 264, 603, 1173, 1294];

function unpackPixels(hex) {
  const packed = Buffer.from(hex.replace(/^0x/i, ""), "hex");
  const out = new Uint8Array(PX);
  for (let i = 0; i < PX; i++) {
    const byteIndex = i >> 1;
    out[i] = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
  }
  return out;
}

function pad4(id) {
  return String(id).padStart(4, "0");
}

async function buildContactSheet(tokenIds, sheetIndex) {
  const COLS = 10;
  const ROWS = 10;
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
    const imgPath = path.join(IMAGES, `chromie_${pad4(tokenId)}.png`);
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

  const outPath = path.join(SHEETS, `sheet_${String(sheetIndex).padStart(2, "0")}.png`);
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
  return outPath;
}

function writeReport(data) {
  const lines = [
    "# Test run 2000 — payload-first preview",
    "",
    `**Date:** ${data.date}`,
    `**Status:** ${data.status}`,
    `**Output:** \`chromies-engine/generated/testrun_2000/\``,
    "",
    "## Summary",
    "",
    `- Tokens rendered: **${data.count}** (#${START}–#${START + data.count - 1})`,
    `- Runtime: **${data.runtimeSec}s** (${data.msPerToken} ms/token)`,
    `- Validation rejects: **${data.rejects.length}**`,
    `- Full payload duplicates (pixelsHex+traitsHex): **${data.duplicateVectors.length}**`,
    `- Trait-only duplicates (traitsHex): **${data.traitOnlyDup}**`,
    `- Warnings: **${data.warnings.length}**`,
    "",
    "## Legendary injection (in-range)",
    "",
    "| Token | Path | 8× export |",
    "|------:|------|-----------|",
  ];
  for (const id of LEGENDARY_IN_RANGE) {
    lines.push(`| ${id} | \`legendary-finals/${pad4(id)}.png\` | \`legendary_8x/chromie_${pad4(id)}_8x.png\` |`);
  }
  lines.push("", "## Validation", "");
  if (data.rejects.length === 0) {
    lines.push("**PASS** — zero rejects.");
  } else {
    lines.push("**FAIL** — rejects:");
    for (const r of data.rejects) lines.push(`- #${r.tokenId}: ${r.reason}`);
  }
  lines.push("", "## Duplicate payload check", "");
  if (data.duplicateVectors.length === 0) {
    lines.push("**PASS** — all 2000 full mint payloads (pixelsHex+traitsHex) unique.");
  } else {
    lines.push(`**NOTE** — ${data.duplicateVectors.length} full-payload collision(s) (traits differ in pixels):`);
    for (const d of data.duplicateVectors.slice(0, 20)) {
      lines.push(`- #${d.a} ↔ #${d.b}`);
    }
  }
  lines.push("", `Trait-only duplicates (same traitsHex, different pixels): **${data.traitOnlyDup}** — expected; pixel buffer carries seed uniqueness.`);
  lines.push("", "## Palette frequency (top 20)", "", "| Palette | Count | % |", "|---------|------:|--:|");
  for (const [k, v] of data.paletteTop) {
    lines.push(`| ${k} | ${v} | ${((v / data.count) * 100).toFixed(2)}% |`);
  }
  lines.push("", "## Character / archetype frequency", "", "| Character | Count | % |", "|-----------|------:|--:|");
  for (const [k, v] of data.characterTop) {
    lines.push(`| ${k} | ${v} | ${((v / data.count) * 100).toFixed(2)}% |`);
  }
  lines.push(
    "",
    "## Guard stats",
    "",
    `- Anti-none-stack fires: ${data.guardStats.antiNone}`,
    `- Dedupe-reroll fires: ${data.guardStats.dedupe}`,
    `- Combo-cap-reroll fires: ${data.guardStats.comboCap}`,
    "",
    "## Contact sheets",
    "",
    `${data.sheets.length} sheets × 100 tokens → \`contact_sheets/sheet_XX.png\``,
    "",
    "**Constraints honored:** preview only, no mint-data batch, no merkle/contract changes.",
  );
  fs.writeFileSync(REPORT, `${lines.join("\n")}\n`);
}

async function main() {
  fs.mkdirSync(IMAGES, { recursive: true });
  fs.mkdirSync(SHEETS, { recursive: true });
  fs.mkdirSync(LEGENDARY_8X, { recursive: true });

  const traitsJson = JSON.parse(
    fs.readFileSync(path.join(REPO, "art-pipeline", SETTINGS.traitsFile), "utf8"),
  );

  resetGenerationStats();
  resetPayloadDedupeLog();
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();

  const paletteDist = {};
  const characterDist = {};
  const traitVectorMap = new Map();
  const traitOnlyMap = new Map();
  let traitOnlyDup = 0;
  const duplicateVectors = [];
  const rejects = [];
  const warnings = [];
  const sheetTokenIds = [];
  let sheetIndex = 1;
  const sheets = [];

  const t0 = Date.now();
  console.log(`Test render ${COUNT} tokens (${START}–${START + COUNT - 1})…`);

  for (let i = 0; i < COUNT; i++) {
    const tokenId = START + i;
    try {
      const record = buildMintRecord(tokenId, traitsJson, warnings, dedupeGuard, comboCapGuard, payloadGuard);
      const buf = unpackPixels(record.pixelsHex);
      const palette = PALETTES[record.palette];
      if (!palette) throw new Error(`Unknown palette ${record.palette}`);
      const pngBuf = renderPNG(buf, palette);
      fs.writeFileSync(path.join(IMAGES, `chromie_${pad4(tokenId)}.png`), pngBuf);

      if (isLegendaryToken(tokenId)) {
        console.log(`  [legendary] #${tokenId} ← injection path, palette ${record.palette}`);
      }

      if (LEGENDARY_IN_RANGE.includes(tokenId)) {
        const up = upscalePNG(pngBuf, 8);
        fs.writeFileSync(path.join(LEGENDARY_8X, `chromie_${pad4(tokenId)}_8x.png`), up);
      }

      paletteDist[record.palette] = (paletteDist[record.palette] || 0) + 1;
      characterDist[record.character] = (characterDist[record.character] || 0) + 1;

      const vecKey = `${record.pixelsHex}|${record.traitsHex}`.toLowerCase();
      const traitKey = record.traitsHex.toLowerCase();
      if (traitVectorMap.has(vecKey)) {
        duplicateVectors.push({ kind: "full", a: traitVectorMap.get(vecKey), b: tokenId });
      } else {
        traitVectorMap.set(vecKey, tokenId);
      }
      if (traitOnlyMap.has(traitKey)) {
        traitOnlyDup += 1;
      } else {
        traitOnlyMap.set(traitKey, tokenId);
      }

      sheetTokenIds.push(tokenId);
      if (sheetTokenIds.length === 100) {
        sheets.push(await buildContactSheet([...sheetTokenIds], sheetIndex));
        sheetTokenIds.length = 0;
        sheetIndex += 1;
      }
    } catch (err) {
      rejects.push({ tokenId, reason: err.message?.split("\n")[0] || String(err) });
    }

    if ((i + 1) % 250 === 0 || i + 1 === COUNT) {
      console.log(`  ${i + 1}/${COUNT}`);
    }
  }

  const runtimeSec = ((Date.now() - t0) / 1000).toFixed(1);
  const paletteTop = Object.entries(paletteDist).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const characterTop = Object.entries(characterDist).sort((a, b) => b[1] - a[1]);

  writeReport({
    date: new Date().toISOString().slice(0, 10),
    status: rejects.length === 0 ? "COMPLETE" : "COMPLETE_WITH_REJECTS",
    count: COUNT,
    runtimeSec,
    msPerToken: ((Date.now() - t0) / COUNT).toFixed(1),
    rejects,
    duplicateVectors,
    traitOnlyDup,
    warnings: [...new Set(warnings)],
    paletteTop,
    characterTop,
    guardStats: {
      antiNone: getAntiNoneStackFireTotal(),
      dedupe: getDedupeRerollFireTotal(),
      comboCap: getComboCapRerollFireTotal(),
    },
    sheets,
  });

  console.log(`\nDone in ${runtimeSec}s`);
  console.log(`  Images: ${IMAGES}`);
  console.log(`  Report: ${REPORT}`);
  console.log(`  Rejects: ${rejects.length}, duplicate vectors: ${duplicateVectors.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
