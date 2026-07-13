#!/usr/bin/env node
/** Ephemeral coverage audit — testrun_2000 generation path. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
process.chdir(path.join(REPO, "art-pipeline"));
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));

const { SETTINGS, CHARACTERS } = require("./chromies-config.js");
const { TraitDedupeGuard, ComboCapGuard } = require("./generate.js");
const { buildMintRecord, PayloadDedupeGuard } = require("./bridge-mint-data.js");

function getEligibleVariants(slot, def, character, opts = {}) {
  if (character?.forcedSlots?.[slot] !== undefined) return null;
  let variants = def.variants;
  if (character?.slotWeightOverrides?.[slot]) {
    const overrides = character.slotWeightOverrides[slot];
    variants = def.variants.map((v) =>
      overrides[v.name] !== undefined ? { ...v, weight: Math.round((v.weight || 0) * overrides[v.name]) } : v,
    );
  }
  if (character?.slotVariantPool?.[slot]) {
    const poolDef = character.slotVariantPool[slot];
    if (Array.isArray(poolDef)) {
      const pool = new Set(poolDef);
      variants = variants.map((v) => (pool.has(v.name) ? v : { ...v, weight: 0 }));
    } else {
      variants = variants.map((v) =>
        poolDef[v.name] !== undefined ? { ...v, weight: poolDef[v.name] } : { ...v, weight: 0 },
      );
    }
  }
  let eligible = variants.filter((v) => (v.weight || 0) > 0);
  if (opts.excludeNone) eligible = eligible.filter((v) => v.name !== "None");
  if (opts.excludeNames?.length) {
    const blocked = new Set(opts.excludeNames);
    eligible = eligible.filter((v) => !blocked.has(v.name));
  }
  return eligible;
}

const COUNT = 2000;
const START = 1;
const traitsJson = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
const MINT_SLOTS = [
  "hood", "shirt", "body", "bodytattoo", "necklace", "tattoo", "mask",
  "beard", "mustache", "eyes", "earrings", "glasses", "hair",
];

function hoodOutlineClass(name) {
  if (!name || name === "None" || name === "Female_None") return "none";
  if (name === "Female_Hooded" || name === "Zombie_Hooded" || name === "Zombie_Hoodie") return "hood_up";
  return "hood_bib";
}

function hairSilhouetteClass(name, suppressed) {
  if (suppressed || !name || name === "None") return "none";
  return name.replace(/^(Male_|Female_|Chubby_|Zombie_|SP_)/, "");
}

function hairSuppressedByHood(hoodName) {
  const isFemaleHood = hoodName === "Female_Classic" || hoodName === "Female_Hooded";
  return isFemaleHood || hoodName === "Chubby_Classic"
    || hoodName === "SP_Classic_Female" || hoodName === "SP_Classic_Male"
    || hoodName === "Zombie_Classic" || hoodName === "Zombie_Hooded" || hoodName === "Zombie_Hoodie";
}

function buildExpectedCounts() {
  const totalCharW = CHARACTERS.reduce((s, c) => s + c.weight, 0);
  const expected = {};
  for (const slot of MINT_SLOTS) expected[slot] = {};

  for (const char of CHARACTERS) {
    const charFrac = char.weight / totalCharW;
    for (const slot of MINT_SLOTS) {
      const def = traitsJson.slots[slot];
      if (!def) continue;

      if (char.forcedSlots?.[slot] !== undefined) {
        const forced = char.forcedSlots[slot];
        expected[slot][forced] = (expected[slot][forced] || 0) + COUNT * charFrac;
        continue;
      }

      const eligible = getEligibleVariants(slot, def, char);
      if (!eligible || eligible.length === 0) continue;
      const sumW = eligible.reduce((s, v) => s + (v.weight || 0), 0);
      for (const v of eligible) {
        const e = COUNT * charFrac * ((v.weight || 0) / sumW);
        expected[slot][v.name] = (expected[slot][v.name] || 0) + e;
      }
    }
  }
  return expected;
}

function allPositiveWeightVariants() {
  const out = {};
  for (const slot of MINT_SLOTS) {
    out[slot] = new Set();
    const def = traitsJson.slots[slot];
    for (const char of CHARACTERS) {
      if (char.forcedSlots?.[slot] !== undefined) {
        out[slot].add(char.forcedSlots[slot]);
        continue;
      }
      const eligible = getEligibleVariants(slot, def, char);
      if (!eligible) continue;
      for (const v of eligible) out[slot].add(v.name);
    }
  }
  return out;
}

function main() {
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();
  const actual = {};
  const charDist = {};
  const silhouettes = new Set();

  for (const slot of MINT_SLOTS) actual[slot] = {};

  for (let i = 0; i < COUNT; i++) {
    const tokenId = START + i;
    const record = buildMintRecord(tokenId, traitsJson, [], dedupeGuard, comboCapGuard, payloadGuard);
    charDist[record.character] = (charDist[record.character] || 0) + 1;

    for (const slot of MINT_SLOTS) {
      const val = record.traitsDecoded[slot]?.value ?? "None";
      actual[slot][val] = (actual[slot][val] || 0) + 1;
    }

    const hood = record.traitsDecoded.hood?.value ?? "None";
    const hair = record.traitsDecoded.hair?.value ?? "None";
    const mask = record.traitsDecoded.mask?.value ?? "None";
    const suppressed = hair === "None" && hairSuppressedByHood(hood);
    const silKey = [
      hairSilhouetteClass(hair, suppressed),
      hoodOutlineClass(hood),
      mask === "None" ? "none" : mask.replace(/^(Male_|Female_|Chubby_|Zombie_|SP_)/, ""),
    ].join("|");
    silhouettes.add(silKey);
  }

  const expected = buildExpectedCounts();
  const positiveVariants = allPositiveWeightVariants();
  const zeroRolls = [];
  const starved = [];

  for (const slot of MINT_SLOTS) {
    for (const name of positiveVariants[slot]) {
      const count = actual[slot][name] || 0;
      const exp = expected[slot][name] || 0;
      if (count === 0) {
        zeroRolls.push({ slot, name, expected_naive: +exp.toFixed(2) });
      } else if (exp > 0.5 && count < exp * 0.5) {
        starved.push({
          slot,
          name,
          actual: count,
          expected_naive: +exp.toFixed(2),
          rate_pct: +((count / exp) * 100).toFixed(1),
        });
      }
    }
  }

  zeroRolls.sort((a, b) => b.expected_naive - a.expected_naive || a.slot.localeCompare(b.slot));
  starved.sort((a, b) => a.rate_pct - b.rate_pct);

  const outPath = path.join(REPO, "reports", "_coverage_audit_out.json");
  const payload = { zeroRolls, starved, silhouetteDistinct: silhouettes.size, charDist, hoodCounts: actual.hood, slotRolls: actual };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`ZERO_ROLLS: ${zeroRolls.length}, STARVED: ${starved.length}, SILHOUETTES: ${silhouettes.size}`);
}

main();
