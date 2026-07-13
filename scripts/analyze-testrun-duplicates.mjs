#!/usr/bin/env node
/**
 * Analyze full-payload duplicates from testrun_2000 generation path.
 * Report-only — writes JSON + side-by-side thumbnails under reports/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));

const { SETTINGS } = require(path.join(REPO, "art-pipeline/chromies-config.js"));
const { buildMintRecord, TRAIT_SLOTS, PayloadDedupeGuard, resetPayloadDedupeLog, getPayloadDedupeLog } = require(path.join(REPO, "art-pipeline/bridge-mint-data.js"));
const { TraitDedupeGuard, ComboCapGuard, resetGenerationStats } = require(path.join(REPO, "art-pipeline/generate.js"));

const COUNT = 2000;
const START = 1;
const FULL_COLLECTION = 5150;
const IMG_DIR = path.join(REPO, "chromies-engine/generated/testrun_2000/images");
const OUT_DIR = path.join(REPO, "reports/testrun_2000_dup_analysis");
const JSON_OUT = path.join(OUT_DIR, "duplicate_analysis.json");

function traitVectorString(decoded) {
  return TRAIT_SLOTS.filter((s) => s.source !== "retired")
    .map((s) => `${s.key}=${decoded[s.key]?.value ?? "?"}`)
    .join(" | ");
}

function bytesHex(decoded) {
  return TRAIT_SLOTS.filter((s) => s.source !== "retired")
    .map((s) => `${s.key}:${decoded[s.key]?.byte ?? 0}`)
    .join(" ");
}

function replayBatch(count, start) {
  const traitsJson = JSON.parse(
    fs.readFileSync(path.join(REPO, "art-pipeline", SETTINGS.traitsFile), "utf8"),
  );
  resetGenerationStats();
  resetPayloadDedupeLog();
  const dedupe = new TraitDedupeGuard();
  const combo = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();
  const records = [];

  for (let i = 0; i < count; i++) {
    const tokenId = start + i;
    const warnings = [];
    const record = buildMintRecord(tokenId, traitsJson, warnings, dedupe, combo, payloadGuard);
    records.push({
      tokenId,
      seed: tokenId,
      pixelsHex: record.pixelsHex,
      traitsHex: record.traitsHex,
      character: record.character,
      palette: record.palette,
      traitsDecoded: record.traitsDecoded,
      traitVector: traitVectorString(record.traitsDecoded),
      traitBytes: bytesHex(record.traitsDecoded),
    });
  }
  return { records, payloadDedupeLog: getPayloadDedupeLog() };
}

function indexByPayload(records) {
  const fullMap = new Map();
  const pixelMap = new Map();

  for (const r of records) {
    const fullKey = `${r.pixelsHex}|${r.traitsHex}`.toLowerCase();
    const pixelKey = r.pixelsHex.toLowerCase();
    if (!fullMap.has(fullKey)) fullMap.set(fullKey, []);
    fullMap.get(fullKey).push(r);
    if (!pixelMap.has(pixelKey)) pixelMap.set(pixelKey, []);
    pixelMap.get(pixelKey).push(r);
  }

  const fullGroups = [...fullMap.values()].filter((g) => g.length > 1);
  const visualOnlyGroups = [...pixelMap.values()]
    .filter((g) => g.length > 1)
    .filter((g) => {
      const traits = new Set(g.map((r) => r.traitsHex.toLowerCase()));
      return traits.size > 1;
    });

  return { fullGroups, visualOnlyGroups };
}

function classifyFullGroup(group) {
  const traitsSet = new Set(group.map((r) => r.traitsHex.toLowerCase()));
  if (traitsSet.size === 1) {
    return {
      kind: "roll_space",
      label: "Identical trait vectors + identical pixels (full fingerprint collision)",
      traitsIdentical: true,
      pixelsIdentical: true,
    };
  }
  return {
    kind: "mixed_full",
    label: "Full payload match with differing trait encodings (unexpected)",
    traitsIdentical: false,
    pixelsIdentical: true,
  };
}

function comboKey(r) {
  const d = r.traitsDecoded;
  const slots = ["hood", "shirt", "body", "hair", "glasses", "eyes", "accessory", "necklace"];
  return slots.map((k) => `${k}:${d[k]?.value ?? "None"}`).join("|");
}

function thinCornerStats(records, fullGroups) {
  const dupIds = new Set(fullGroups.flat().map((r) => r.tokenId));
  const slotValueCounts = {};
  const slotValueDupCounts = {};

  for (const r of records) {
    for (const slot of TRAIT_SLOTS) {
      if (slot.source === "retired") continue;
      const val = r.traitsDecoded[slot.key]?.value ?? "?";
      const sk = `${slot.key}:${val}`;
      slotValueCounts[sk] = (slotValueCounts[sk] || 0) + 1;
      if (dupIds.has(r.tokenId)) {
        slotValueDupCounts[sk] = (slotValueDupCounts[sk] || 0) + 1;
      }
    }
  }

  const corners = Object.keys(slotValueDupCounts)
    .map((sk) => ({
      combo: sk,
      dupTokens: slotValueDupCounts[sk],
      totalInBatch: slotValueCounts[sk] || 0,
      dupRateInValue: slotValueDupCounts[sk] / (slotValueCounts[sk] || 1),
    }))
    .sort((a, b) => b.dupRateInValue - a.dupRateInValue || b.dupTokens - a.dupTokens);

  const comboCounts = {};
  for (const r of records) {
    const ck = comboKey(r);
    comboCounts[ck] = (comboCounts[ck] || 0) + 1;
  }
  const thinCombos = Object.entries(comboCounts)
    .filter(([, c]) => c === 1)
    .length;

  return { corners: corners.slice(0, 30), thinCombos, uniqueCombos: Object.keys(comboCounts).length };
}

async function makeGroupThumb(group, idx) {
  const SCALE = 8;
  const CELL = 64 * SCALE;
  const PAD = 12;
  const LABEL_H = 36;
  const n = group.length;
  const sheetW = n * (CELL + PAD) + PAD;
  const sheetH = CELL + LABEL_H + PAD;
  const composites = [];

  for (let i = 0; i < n; i++) {
    const r = group[i];
    const imgPath = path.join(IMG_DIR, `chromie_${String(r.tokenId).padStart(4, "0")}.png`);
    const src = fs.readFileSync(imgPath);
    const up = await sharp(src).resize(CELL, CELL, { kernel: sharp.kernel.nearest }).png().toBuffer();
    const x = PAD + i * (CELL + PAD);
    composites.push({ input: up, left: x, top: LABEL_H });
    const svg = Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="#111"/>` +
        `<text x="4" y="14" fill="#eee" font-family="monospace" font-size="11">#${r.tokenId} seed=${r.seed}</text>` +
        `<text x="4" y="28" fill="#aaa" font-family="monospace" font-size="9">${r.character} · ${r.palette}</text></svg>`,
    );
    composites.push({ input: svg, left: x, top: 4 });
  }

  const outPath = path.join(OUT_DIR, `dup_group_${String(idx + 1).padStart(2, "0")}.png`);
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
  return path.relative(REPO, outPath).replace(/\\/g, "/");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("Replaying batch…");
  const { records, payloadDedupeLog } = replayBatch(COUNT, START);
  const { fullGroups, visualOnlyGroups } = indexByPayload(records);

  const dupTokenCount = fullGroups.reduce((n, g) => n + g.length, 0);
  const extraInstances = fullGroups.reduce((n, g) => n + g.length - 1, 0);
  const pairCount = extraInstances;

  const groupsOut = [];
  for (let gi = 0; gi < fullGroups.length; gi++) {
    const group = fullGroups[gi].sort((a, b) => a.tokenId - b.tokenId);
    const classification = classifyFullGroup(group);
    const thumb = await makeGroupThumb(group, gi);
    groupsOut.push({
      groupIndex: gi + 1,
      tokenIds: group.map((r) => r.tokenId),
      seeds: group.map((r) => r.seed),
      traitsHex: group[0].traitsHex,
      pixelsHexPrefix: group[0].pixelsHex.slice(0, 42) + "…",
      traitVector: group[0].traitVector,
      traitBytes: group[0].traitBytes,
      classification,
      thumbnail: thumb,
      members: group.map((r) => ({
        tokenId: r.tokenId,
        seed: r.seed,
        character: r.character,
        palette: r.palette,
      })),
    });
  }

  const stats = thinCornerStats(records, fullGroups);
  const projectedExtra = Math.round((extraInstances / COUNT) * FULL_COLLECTION);
  const projectedGroups = Math.round((fullGroups.length / COUNT) * FULL_COLLECTION);

  const payload = {
    batchSize: COUNT,
    fullCollectionSize: FULL_COLLECTION,
    fullPayloadDuplicateGroups: fullGroups.length,
    fullPayloadDuplicateExtraInstances: extraInstances,
    duplicateTokenInstances: dupTokenCount,
    visualOnlyCollisionGroups: visualOnlyGroups.length,
    visualOnlyExtraInstances: visualOnlyGroups.reduce((n, g) => n + g.length - 1, 0),
    projectedAt5150: {
      extraInstancesLinear: projectedExtra,
      groupsLinear: projectedGroups,
      rateExtraPerToken: extraInstances / COUNT,
      rateGroupsPerToken: fullGroups.length / COUNT,
    },
    payloadDedupeRerolls: payloadDedupeLog.length,
    payloadDedupeLog,
    groups: groupsOut,
    thinCorners: stats,
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote ${JSON_OUT}`);
  console.log(`Groups: ${fullGroups.length}, extra instances: ${extraInstances}`);
  console.log(`Visual-only (pixels match, traits differ): ${visualOnlyGroups.length} groups`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
