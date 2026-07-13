#!/usr/bin/env node
/**
 * Wave-3 confirm render — 500 tokens, fresh range (#6001-#6500), using the
 * REAL committed config (no sandboxing — Bandana is live at 1.2% for
 * HeroA Male/Female + Chubby; Baseball/Bucket/Cowboy/Beanie stay at their
 * committed 0). Confirms: per-hat roll rate vs the 1.2% ladder ruling,
 * hair-suppression + hood-exclusion firing on every hat token, 0 rejects,
 * 0 dup vectors.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

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

const REPORT = path.join(REPO, "reports/confirm_render_wave3_500_report.md");

const COUNT = 500;
const START = 6001;
const END = START + COUNT - 1;

async function main() {
  const traitsJson = JSON.parse(fs.readFileSync(path.join(REPO, "art-pipeline", "traits.json"), "utf8"));

  // Real committed config — no in-memory weight mutation this run.
  assertHatArtDelivered(traitsJson, CHARACTERS);
  console.log("assertHatArtDelivered: PASS (real committed config)");

  const legendaryInRange = LEGENDARY_TOKEN_IDS.filter((id) => id >= START && id <= END);
  console.log(`Legendary IDs in range [${START}-${END}]: ${legendaryInRange.join(", ") || "none"}`);

  resetGenerationStats();
  resetPayloadDedupeLog();
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();

  const rejects = [];
  const traitVectorMap = new Map();
  const duplicateVectors = [];
  const characterDist = {};
  const hatHits = { Female_Baseball: 0, Male_Bandana: 0, Female_Bandana: 0, Chubby_Bandana: 0, None: 0, other: 0 };
  const hatPoolTotals = { HeroA_Male: 0, HeroA_Female: 0, Chubby_Male: 0 };
  let hairSuppressionChecked = 0;
  let hairSuppressionFired = 0;
  let hoodHatCollisionsChecked = 0;
  let hoodHatCollisionsResolved = 0;
  const violations = [];

  const t0 = Date.now();
  for (let tokenId = START; tokenId <= END; tokenId++) {
    if (isLegendaryToken(tokenId) && !legendaryFinalExists(tokenId)) continue;
    try {
      const record = buildMintRecord(tokenId, traitsJson, [], dedupeGuard, comboCapGuard, payloadGuard);
      characterDist[record.character] = (characterDist[record.character] || 0) + 1;

      const hatVal = record.traitsDecoded.hat?.value ?? "None";
      const hoodVal = record.traitsDecoded.hood?.value ?? "None";
      const hairVal = record.traitsDecoded.hair?.value ?? "None";
      const charKey = record.character;

      if (charKey === "HeroA_Male" || charKey === "HeroA_Female" || charKey === "Chubby_Male") {
        hatPoolTotals[charKey] += 1;
      }
      if (hatHits[hatVal] !== undefined) hatHits[hatVal] += 1;
      else if (hatVal === "None") hatHits.None += 1;
      else hatHits.other += 1;

      if (hatVal !== "None") {
        hairSuppressionChecked += 1;
        if (hairVal === "None") hairSuppressionFired += 1;
        else violations.push(`#${tokenId}: hat=${hatVal} but hair=${hairVal} (hatSuppressesHair did not fire)`);
      }

      // hood/hat exclusion can only be *observed* here if both happened to roll non-None
      // pre-resolution; post-resolution one of them is always forced to None. We confirm
      // via the decoded state: never both non-None simultaneously. "Female_None" is the
      // literal no-hood variant name for HeroA Female (mirrors generate.js isHoodNone()) —
      // must be treated as None here too, or every Female hat token false-flags.
      const isHoodNoneVal = hoodVal === "None" || hoodVal === "Female_None" || !hoodVal;
      const isHatNoneVal = hatVal === "None" || !hatVal;
      if (!isHoodNoneVal || !isHatNoneVal) {
        hoodHatCollisionsChecked += 1;
        if (!isHoodNoneVal && !isHatNoneVal) {
          violations.push(`#${tokenId}: hood=${hoodVal} AND hat=${hatVal} both non-None (exclusion did not fire)`);
        } else {
          hoodHatCollisionsResolved += 1;
        }
      }

      const vecKey = `${record.pixelsHex}|${record.traitsHex}`.toLowerCase();
      if (traitVectorMap.has(vecKey)) duplicateVectors.push({ a: traitVectorMap.get(vecKey), b: tokenId });
      else traitVectorMap.set(vecKey, tokenId);
    } catch (err) {
      rejects.push({ tokenId, reason: err.message?.split("\n")[0] || String(err) });
    }
  }
  const runtimeSec = ((Date.now() - t0) / 1000).toFixed(1);

  const bandanaRate = (charKey, hits) => (hatPoolTotals[charKey] ? ((hits / hatPoolTotals[charKey]) * 100).toFixed(2) : "n/a");

  const lines = [
    "# Wave-3 confirm render — 500 tokens, real committed config",
    "",
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Range:** #${START}-#${END} (${COUNT} tokens), runtime ${runtimeSec}s`,
    "No sandboxing this run — Bandana is committed live at 1.2%; Baseball/Bucket/Cowboy/Beanie committed at 0.",
    "",
    "## Legendary IDs in range",
    "",
    `In range: **${legendaryInRange.join(", #") || "none"}**`,
    "",
    "## Validation",
    "",
    `- Rejects: **${rejects.length}** (expect 0)`,
    `- Duplicate payload vectors: **${duplicateVectors.length}** (expect 0)`,
    `- assertHatArtDelivered: **PASS**`,
    "",
    "## Hat roll rate vs ruled ladder (1.2% Bandana)",
    "",
    "| Character pool | Total | Bandana hits | Actual % | Ruled % |",
    "|---|---:|---:|---:|---:|",
    `| HeroA_Male | ${hatPoolTotals.HeroA_Male} | ${hatHits.Male_Bandana} | ${bandanaRate("HeroA_Male", hatHits.Male_Bandana)}% | 1.2% |`,
    `| HeroA_Female | ${hatPoolTotals.HeroA_Female} | ${hatHits.Female_Bandana} | ${bandanaRate("HeroA_Female", hatHits.Female_Bandana)}% | 1.2% |`,
    `| Chubby_Male | ${hatPoolTotals.Chubby_Male} | ${hatHits.Chubby_Bandana} | ${bandanaRate("Chubby_Male", hatHits.Chubby_Bandana)}% | 1.2% |`,
    "",
    `Female_Baseball hits: **${hatHits.Female_Baseball}** (weight 0 this pass — Baseball rung not flipped; expect 0)`,
    `Other/unexpected hat values: **${hatHits.other}**`,
    "",
    "## Coverage-rule firing",
    "",
    `- hatSuppressesHair checked on ${hairSuppressionChecked} hat-wearing tokens, fired on **${hairSuppressionFired}** (expect ${hairSuppressionChecked})`,
    `- hat<->hood mutual exclusion checked on ${hoodHatCollisionsChecked} tokens with hood and/or hat non-None, resolved (never both simultaneously) on **${hoodHatCollisionsResolved}** (expect ${hoodHatCollisionsChecked})`,
  ];
  if (violations.length) {
    lines.push("", "**COVERAGE-RULE VIOLATIONS (fail loudly, not resolved):**");
    for (const v of violations) lines.push(`- ${v}`);
  } else {
    lines.push("", "**No coverage-rule violations.**");
  }
  if (rejects.length) {
    lines.push("", "**REJECTS:**");
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
    lines.push(`| ${k} | ${v} | ${((v / COUNT) * 100).toFixed(2)}% |`);
  }
  lines.push(
    "",
    "## Guard stats",
    "",
    `- Anti-none-stack fires: ${getAntiNoneStackFireTotal()}`,
    `- Dedupe-reroll fires: ${getDedupeRerollFireTotal()}`,
    `- Combo-cap-reroll fires: ${getComboCapRerollFireTotal()}`,
  );
  fs.writeFileSync(REPORT, `${lines.join("\n")}\n`);
  console.log(`Rejects: ${rejects.length}, dup vectors: ${duplicateVectors.length}, runtime ${runtimeSec}s`);
  console.log(`Hat hits — Male_Bandana: ${hatHits.Male_Bandana}/${hatPoolTotals.HeroA_Male}, Female_Bandana: ${hatHits.Female_Bandana}/${hatPoolTotals.HeroA_Female}, Chubby_Bandana: ${hatHits.Chubby_Bandana}/${hatPoolTotals.Chubby_Male}, Female_Baseball: ${hatHits.Female_Baseball}`);
  console.log(`hatSuppressesHair fired ${hairSuppressionFired}/${hairSuppressionChecked}; hood/hat exclusion resolved ${hoodHatCollisionsResolved}/${hoodHatCollisionsChecked}`);
  console.log(`Report: ${REPORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
