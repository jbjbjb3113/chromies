#!/usr/bin/env node
/**
 * Wave-3 forced-preview renders for JB sign-off — "live" hats only (clean
 * preflight + real committed weight this pass): Female_Baseball (re-export
 * fix, weight still 0), Male_Bandana / Female_Bandana / Chubby_Bandana
 * (new intake, wired at 1.2%).
 *
 * 5 samples per hat x head shape (Classic/Angular where the archetype has
 * both; Chubby is Classic-only). All forcing is direct pick override — no
 * weights are touched, no chromies-config.js pools are mutated beyond what
 * was already committed this pass. Pipeline-only / preview-only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
process.chdir(path.join(REPO, "art-pipeline"));
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));

const { PALETTES } = require("./chromies-config.js");
const {
  pickCharacter,
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  compositeChromie,
  renderPNG,
} = require("./generate.js");

const traitsJson = JSON.parse(fs.readFileSync("traits.json", "utf8"));

const PALETTE_SPREAD = [
  "SIGNAL", "ACID", "CYAN", "GHOST", "BLOOD",
  "MOSS", "SIGNAL_BLONDE", "BLOOD_GREY", "CYAN_RED", "ACID_SHIRT_BLUE",
];

function bucketTokens(maxScan = 6000) {
  const buckets = { "HeroA/Male": [], "HeroA/Female": [], "Chubby/Male": [] };
  for (let tokenId = 1; tokenId <= maxScan; tokenId++) {
    const character = pickCharacter(tokenId);
    const key = `${character.name}/${character.gender}`;
    if (buckets[key] && buckets[key].length < 20) buckets[key].push(tokenId);
    if (Object.values(buckets).every((b) => b.length >= 20)) break;
  }
  return buckets;
}

function forcePicks(tokenId, character, overrides) {
  const picks = pickTokenVariants(tokenId, traitsJson, new Set(), character);
  for (const [slot, variantName] of Object.entries(overrides)) {
    const slotDef = traitsJson.slots[slot];
    const variant = slotDef.variants.find((v) => v.name === variantName);
    if (!variant) throw new Error(`token ${tokenId}: variant ${slot}=${variantName} not found`);
    picks[slot] = { variant, file: variant.file, buffer: null };
  }
  loadPickBuffers(picks, traitsJson);
  const renderPicks = applyCoverageRules(picks, traitsJson, character);
  return { character, picks, renderPicks };
}

function renderSample(outDir, filename, tokenId, character, overrides, paletteKey) {
  const { renderPicks } = forcePicks(tokenId, character, overrides);
  const palette = PALETTES[paletteKey];
  if (!palette) throw new Error(`unknown palette ${paletteKey}`);
  const buf = compositeChromie(renderPicks, traitsJson, tokenId);
  const png = renderPNG(buf, palette);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, filename), png);
  return renderPicks;
}

const LIVE_HATS = [
  { hat: "Female_Baseball", archetype: "HeroA/Female", genderTag: "Female", headVariant: { Classic: "HeroA_Female", Angular: "Female_Angular" } },
  { hat: "Male_Bandana", archetype: "HeroA/Male", genderTag: "Male", headVariant: { Classic: "HeroA", Angular: "Male_Angular" } },
  { hat: "Female_Bandana", archetype: "HeroA/Female", genderTag: "Female", headVariant: { Classic: "HeroA_Female", Angular: "Female_Angular" } },
  { hat: "Chubby_Bandana", archetype: "Chubby/Male", genderTag: "Chubby", headVariant: { Classic: "Chubby" } }, // Chubby has no Angular art
];

function buildWave3Preview(buckets) {
  const OUT = path.join(REPO, "derived_assets", "hat_preview_wave3");
  fs.mkdirSync(OUT, { recursive: true });
  const log = [];
  let tokenOffset = 0;

  for (const entry of LIVE_HATS) {
    const tokens = buckets[entry.archetype];
    const shapes = Object.keys(entry.headVariant);
    for (const shape of shapes) {
      const headName = entry.headVariant[shape];
      for (let i = 0; i < 5; i++) {
        const tokenId = tokens[tokenOffset % tokens.length];
        tokenOffset += 1;
        const paletteKey = PALETTE_SPREAD[i % PALETTE_SPREAD.length];
        const character = pickCharacter(tokenId);
        const filename = `${entry.hat}_${shape}_token${tokenId}_${paletteKey}.png`;
        // hood forced None so the hat is always visible — exclusion verified separately.
        const overrides = { head: headName, hat: entry.hat, hood: "None" };
        const renderPicks = renderSample(OUT, filename, tokenId, character, overrides, paletteKey);
        const actualHat = renderPicks.hat?.variant?.name;
        const actualHair = renderPicks.hair?.variant?.name ?? "None";
        if (actualHat !== entry.hat) throw new Error(`token ${tokenId}: expected hat=${entry.hat}, got ${actualHat}`);
        if (actualHair !== "None") throw new Error(`token ${tokenId}: hatSuppressesHair did not fire for ${entry.hat}, hair=${actualHair}`);
        log.push({
          hat: entry.hat, archetype: entry.archetype, shape, tokenId, palette: paletteKey,
          head: renderPicks.head?.variant?.name, hair: actualHair,
          file: `derived_assets/hat_preview_wave3/${filename}`,
        });
      }
    }
  }
  fs.writeFileSync(path.join(OUT, "preview_log.json"), `${JSON.stringify(log, null, 2)}\n`);
  console.log(`hat_preview_wave3: wrote ${log.length} samples to ${OUT}`);
  return log;
}

// Exclusion smoke: hat<->hood mutual exclusion + hatSuppressesHair, for each live hat.
function verifyExclusionRules(buckets) {
  for (const entry of LIVE_HATS) {
    const tokenId = buckets[entry.archetype][0];
    const character = pickCharacter(tokenId);
    const hoodVariantForArchetype = entry.genderTag === "Female" ? "Female_Classic"
      : entry.genderTag === "Chubby" ? "Chubby_Classic" : "Classic";

    const a = forcePicks(tokenId, character, { hood: hoodVariantForArchetype, hat: entry.hat }).renderPicks;
    if (a.hat?.variant?.name !== "None") throw new Error(`${entry.hat}: exclusion failed, hat=${a.hat?.variant?.name} (expected None when hood set)`);
    if (a.hood?.variant?.name !== hoodVariantForArchetype) throw new Error(`${entry.hat}: exclusion failed, hood=${a.hood?.variant?.name}`);

    const c = forcePicks(tokenId, character, {
      hood: "None", hat: entry.hat, hair: character.gender === "Female" ? "Female_Afro" : entry.genderTag === "Chubby" ? "Chubby_Afro" : "Male_Afro",
    }).renderPicks;
    if (c.hair?.variant?.name !== "None") throw new Error(`${entry.hat}: hatSuppressesHair failed, hair=${c.hair?.variant?.name}`);

    console.log(`Exclusion smoke PASS for ${entry.hat}: hat<->hood mutually exclusive (hood wins); hatSuppressesHair fires.`);
  }
}

const buckets = bucketTokens();
console.log("Bucketed tokens:", Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])));
verifyExclusionRules(buckets);
const log = buildWave3Preview(buckets);
console.log("All wave-3 forced-preview coverage assertions PASS.");
console.log(JSON.stringify({ sampleCount: log.length }, null, 2));
