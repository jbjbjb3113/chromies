#!/usr/bin/env node
/**
 * Candidate reveal-dataset regeneration from CURRENT pipeline state.
 *
 * STAGING ONLY — does not touch art-pipeline/output/mint-data.json (the
 * canonical batch-write path) or public/data/mint-data.json (the live-synced
 * reveal source). Per SESSION_HANDOFF.md, mint-data regen is FROZEN pending
 * the legendary-finals gate (see art-pipeline/legendary-finals/SOURCES.md:
 * all 9 legendary slots currently fail on-chain palette validation — 6 have
 * delivered art but the NORMIE_* registry palettes are still shared greyscale
 * placeholders, not per-artist colors; 3 have no delivered art at all).
 *
 * This script regenerates the 5,141 NON-legendary tokens only, using the
 * exact same buildMintRecord() + guard stack as bridge-mint-data.js, for JB's
 * visual review. Legendary token IDs are skipped entirely (not stubbed).
 *
 * USAGE: node regen-5150-excl-legendary.js
 */
const fs = require("fs");
const path = require("path");
const { SETTINGS } = require("./chromies-config");
const {
  buildMintRecord,
  PayloadDedupeGuard,
  resetPayloadDedupeLog,
  getPayloadDedupeLog,
} = require("./bridge-mint-data");
const {
  resetGenerationStats,
  getAntiNoneStackFireTotal,
  getDedupeRerollFireTotal,
  getComboCapRerollFireTotal,
  TraitDedupeGuard,
  ComboCapGuard,
} = require("./generate");
const { LEGENDARY_TOKEN_IDS, LEGENDARY_ASSIGNMENTS } = require("./legendary-token-ids");

const COUNT = 5150;
const START = 1;
const OUT_DIR = path.resolve(__dirname, "..", "chromies-engine", "generated", "regen_5150_current");

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const traitsJson = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const legendarySet = new Set(LEGENDARY_TOKEN_IDS);

  resetGenerationStats();
  resetPayloadDedupeLog();
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();

  const records = [];
  const rejects = [];
  const t0 = Date.now();

  console.log(`Building candidate mint data for tokens ${START}-${START + COUNT - 1}, excluding ${legendarySet.size} legendary slots: ${[...legendarySet].sort((a, b) => a - b).join(", ")}`);

  for (let tokenId = START; tokenId < START + COUNT; tokenId++) {
    if (legendarySet.has(tokenId)) continue;
    try {
      const record = buildMintRecord(tokenId, traitsJson, [], dedupeGuard, comboCapGuard, payloadGuard);
      records.push({ tokenId: record.tokenId, pixelsHex: record.pixelsHex, traitsHex: record.traitsHex });
    } catch (err) {
      rejects.push({ tokenId, reason: err.message?.split("\n")[0] || String(err) });
    }
    if (records.length % 1000 === 0) console.log(`  ${records.length} built...`);
  }

  const jsonPath = path.join(OUT_DIR, "mint-data-excl-legendary.json");
  const csvPath = path.join(OUT_DIR, "mint-data-excl-legendary.csv");
  fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));
  const csvLines = ["tokenId,pixelsHex,traitsHex"];
  for (const r of records) csvLines.push(`${r.tokenId},${r.pixelsHex.slice(2)},${r.traitsHex.slice(2)}`);
  fs.writeFileSync(csvPath, csvLines.join("\n"));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nWrote ${records.length} records in ${elapsed}s`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${csvPath}`);
  console.log(`Rejects: ${rejects.length}`);
  for (const r of rejects) console.log(`  #${r.tokenId}: ${r.reason}`);
  console.log(`Anti-none-stack fires: ${getAntiNoneStackFireTotal()}`);
  console.log(`Dedupe-reroll fires: ${getDedupeRerollFireTotal()}`);
  console.log(`Combo-cap-reroll fires: ${getComboCapRerollFireTotal()}`);
  console.log(`Payload dedupe rerolls: ${getPayloadDedupeLog().length}`);
  console.log(`\nLegendary slots excluded (gate not cleared — see legendary-finals/SOURCES.md):`);
  for (const a of LEGENDARY_ASSIGNMENTS) console.log(`  #${a.tokenId} ${a.artist} (${a.palette})`);
}

main();
