#!/usr/bin/env node
/** Payload-only duplicate census after encoder fix + dedupe guard. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
process.chdir(path.join(REPO, "art-pipeline"));
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));

const { SETTINGS } = require(path.join(REPO, "art-pipeline/chromies-config.js"));
const {
  buildMintRecord,
  PayloadDedupeGuard,
  resetPayloadDedupeLog,
  getPayloadDedupeLog,
} = require(path.join(REPO, "art-pipeline/bridge-mint-data.js"));
const { TraitDedupeGuard, ComboCapGuard, resetGenerationStats } = require(path.join(REPO, "art-pipeline/generate.js"));

const COUNT = 2000;
const START = 1;
const FULL = 5150;
const OUT = path.join(REPO, "reports/testrun_2000_post_fix_duplicate_analysis.json");

function visibleKey(record) {
  const parts = [`char:${record.character}`, `pal:${record.palette}`];
  for (const [k, v] of Object.entries(record.traitsDecoded)) {
    if (["character", "palette", "mutation", "drift"].includes(k)) continue;
    parts.push(`${k}:${v.value}`);
  }
  return parts.sort().join("|");
}

function main() {
  const traitsJson = JSON.parse(
    fs.readFileSync(path.join(REPO, "art-pipeline", SETTINGS.traitsFile), "utf8"),
  );
  resetGenerationStats();
  resetPayloadDedupeLog();
  const dedupe = new TraitDedupeGuard();
  const combo = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();
  const records = [];

  for (let i = 0; i < COUNT; i++) {
    const tokenId = START + i;
    const record = buildMintRecord(tokenId, traitsJson, [], dedupe, combo, payloadGuard);
    records.push({
      tokenId,
      pixelsHex: record.pixelsHex,
      traitsHex: record.traitsHex,
      character: record.character,
      palette: record.palette,
      traitsDecoded: record.traitsDecoded,
      visibleKey: visibleKey(record),
    });
  }

  const fullMap = new Map();
  const pixelMap = new Map();
  for (const r of records) {
    const fk = `${r.pixelsHex}|${r.traitsHex}`.toLowerCase();
    const pk = r.pixelsHex.toLowerCase();
    if (!fullMap.has(fk)) fullMap.set(fk, []);
    fullMap.get(fk).push(r);
    if (!pixelMap.has(pk)) pixelMap.set(pk, []);
    pixelMap.get(pk).push(r);
  }

  const fullGroups = [...fullMap.values()].filter((g) => g.length > 1);
  const visualOnly = [...pixelMap.values()].filter((g) => {
    if (g.length < 2) return false;
    return new Set(g.map((r) => r.traitsHex.toLowerCase())).size > 1;
  });

  const classified = fullGroups.map((g) => {
    const visible = new Set(g.map((r) => r.visibleKey));
    const pals = new Set(g.map((r) => r.palette));
    const palBytes = new Set(g.map((r) => r.traitsDecoded.palette?.byte));
    let cls = "roll_space";
    if (visible.size > 1 && (palBytes.size === 1 && pals.size > 1 || palBytes.size === 1)) {
      cls = "encoding_collapse";
    } else if (visible.size === 1) {
      cls = "roll_space";
    }
    return {
      tokenIds: g.map((r) => r.tokenId).sort((a, b) => a - b),
      classification: cls,
      visibleKeys: [...visible],
      palettes: [...pals],
    };
  });

  const extra = fullGroups.reduce((n, g) => n + g.length - 1, 0);
  const payloadLog = getPayloadDedupeLog();

  const out = {
    batchSize: COUNT,
    fullPayloadDuplicateGroups: fullGroups.length,
    fullPayloadDuplicateExtraInstances: extra,
    encodingCollapseGroups: classified.filter((g) => g.classification === "encoding_collapse").length,
    rollSpaceGroups: classified.filter((g) => g.classification === "roll_space").length,
    visualOnlyCollisionGroups: visualOnly.length,
    visualOnlyExtraInstances: visualOnly.reduce((n, g) => n + g.length - 1, 0),
    payloadDedupeRerolls: payloadLog.length,
    payloadDedupeLog: payloadLog,
    projectedAt5150: {
      fullPayloadExtraLinear: Math.round((extra / COUNT) * FULL),
      visualOnlyExtraLinear: Math.round(
        (visualOnly.reduce((n, g) => n + g.length - 1, 0) / COUNT) * FULL,
      ),
    },
    groups: classified,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out, null, 2));
}

main();
