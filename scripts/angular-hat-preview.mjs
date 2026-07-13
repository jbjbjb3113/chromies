#!/usr/bin/env node
/**
 * Phase 1 + Phase 2 forced-preview renders for JB sign-off.
 *
 * angular_preview/ — 10 samples per HEAD_SHAPE (Classic/Angular) x archetype
 *   (HeroA Male, HeroA Female) across varied palettes.
 * hat_preview/     — 10 samples per delivered hat (Male_Bucket only) x
 *   HEAD_SHAPE (Classic/Angular) x archetype (HeroA Male) across varied palettes.
 *
 * All forcing is done by directly overriding picks — no weights are touched,
 * no chromies-config.js pools are mutated. Pipeline-only / preview-only.
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

function bucketTokens(maxScan = 4000) {
  const buckets = { "HeroA/Male": [], "HeroA/Female": [] };
  for (let tokenId = 1; tokenId <= maxScan; tokenId++) {
    const character = pickCharacter(tokenId);
    const key = `${character.name}/${character.gender}`;
    if (buckets[key] && buckets[key].length < 40) buckets[key].push(tokenId);
    if (buckets["HeroA/Male"].length >= 40 && buckets["HeroA/Female"].length >= 40) break;
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

// ---------------------------------------------------------------------------
// angular_preview
// ---------------------------------------------------------------------------
function buildAngularPreview(buckets) {
  const OUT = path.join(REPO, "derived_assets", "angular_preview");
  fs.mkdirSync(OUT, { recursive: true });
  const log = [];
  const combos = [
    { archetype: "HeroA/Male", headVariant: { Classic: "HeroA", Angular: "Male_Angular" } },
    { archetype: "HeroA/Female", headVariant: { Classic: "HeroA_Female", Angular: "Female_Angular" } },
  ];
  for (const combo of combos) {
    const tokens = buckets[combo.archetype];
    for (const shape of ["Classic", "Angular"]) {
      const headName = combo.headVariant[shape];
      for (let i = 0; i < 10; i++) {
        const tokenId = tokens[i];
        const paletteKey = PALETTE_SPREAD[i % PALETTE_SPREAD.length];
        const character = pickCharacter(tokenId);
        const genderTag = combo.archetype.split("/")[1];
        const filename = `${genderTag}_${shape}_token${tokenId}_${paletteKey}.png`;
        const renderPicks = renderSample(OUT, filename, tokenId, character, { head: headName }, paletteKey);
        const actualHead = renderPicks.head?.variant?.name;
        if (actualHead !== headName) throw new Error(`token ${tokenId}: expected head=${headName}, got ${actualHead}`);
        log.push({ archetype: combo.archetype, shape, tokenId, palette: paletteKey, head: actualHead, file: `derived_assets/angular_preview/${filename}` });
      }
    }
  }
  fs.writeFileSync(path.join(OUT, "preview_log.json"), `${JSON.stringify(log, null, 2)}\n`);
  console.log(`angular_preview: wrote ${log.length} samples to ${OUT}`);
  return log;
}

// ---------------------------------------------------------------------------
// hat_preview (delivered hats only — Male_Bucket)
// ---------------------------------------------------------------------------
function buildHatPreview(buckets) {
  const OUT = path.join(REPO, "derived_assets", "hat_preview");
  fs.mkdirSync(OUT, { recursive: true });
  const log = [];
  const tokens = buckets["HeroA/Male"];
  for (const shape of ["Classic", "Angular"]) {
    const headName = shape === "Classic" ? "HeroA" : "Male_Angular";
    for (let i = 0; i < 10; i++) {
      const tokenId = tokens[10 + i]; // offset from angular_preview's token slice to avoid dup filenames/renders
      const paletteKey = PALETTE_SPREAD[i % PALETTE_SPREAD.length];
      const character = pickCharacter(tokenId);
      const filename = `Male_Bucket_${shape}_token${tokenId}_${paletteKey}.png`;
      // hood forced None here so the hat is visible — hat<->hood exclusion is verified separately below.
      const renderPicks = renderSample(OUT, filename, tokenId, character, { head: headName, hat: "Male_Bucket", hood: "None" }, paletteKey);
      const actualHat = renderPicks.hat?.variant?.name;
      const actualHair = renderPicks.hair?.variant?.name ?? "None";
      const actualHood = renderPicks.hood?.variant?.name ?? "None";
      if (actualHat !== "Male_Bucket") throw new Error(`token ${tokenId}: hat suppressed unexpectedly (hood=${actualHood}), got hat=${actualHat}`);
      if (actualHair !== "None") throw new Error(`token ${tokenId}: hatSuppressesHair did not fire, hair=${actualHair}`);
      log.push({
        hat: "Male_Bucket", shape, tokenId, palette: paletteKey,
        head: renderPicks.head?.variant?.name, hood: actualHood, hair: actualHair,
        file: `derived_assets/hat_preview/${filename}`,
      });
    }
  }
  fs.writeFileSync(path.join(OUT, "preview_log.json"), `${JSON.stringify(log, null, 2)}\n`);
  console.log(`hat_preview: wrote ${log.length} samples to ${OUT}`);
  return log;
}

// ---------------------------------------------------------------------------
// hat <-> hood mutual exclusion smoke (both directions) + hatSuppressesHair
// ---------------------------------------------------------------------------
function verifyExclusionRules(buckets) {
  const tokenId = buckets["HeroA/Male"][0];
  const character = pickCharacter(tokenId);

  // Direction A: hood forced non-None + hat forced non-None -> hat must yield to None.
  const a = forcePicks(tokenId, character, { hood: "Male_Hooded", hat: "Male_Bucket" }).renderPicks;
  if (a.hat?.variant?.name !== "None") throw new Error(`exclusion A failed: hat=${a.hat?.variant?.name}`);
  if (a.hood?.variant?.name !== "Male_Hooded") throw new Error(`exclusion A failed: hood=${a.hood?.variant?.name}`);

  // Direction B: hat forced non-None + hood forced non-None (reverse call order) -> same result.
  const b = forcePicks(tokenId, character, { hat: "Male_Bucket", hood: "Classic" }).renderPicks;
  if (b.hat?.variant?.name !== "None") throw new Error(`exclusion B failed: hat=${b.hat?.variant?.name}`);
  if (b.hood?.variant?.name !== "Classic") throw new Error(`exclusion B failed: hood=${b.hood?.variant?.name}`);

  // hatSuppressesHair: hat non-None + hood None -> hair forced to None, beard/mustache/tattoo untouched.
  const c = forcePicks(tokenId, character, {
    hood: "None", hat: "Male_Bucket", hair: "Male_Afro", beard: "Male_Full", mustache: "Male_Thick", tattoo: "Male_Scar",
  }).renderPicks;
  if (c.hair?.variant?.name !== "None") throw new Error(`hatSuppressesHair failed: hair=${c.hair?.variant?.name}`);
  if (c.beard?.variant?.name !== "Male_Full") throw new Error(`hatSuppressesHair over-suppressed beard: ${c.beard?.variant?.name}`);
  if (c.mustache?.variant?.name !== "Male_Thick") throw new Error(`hatSuppressesHair over-suppressed mustache: ${c.mustache?.variant?.name}`);
  if (c.tattoo?.variant?.name !== "Male_Scar") throw new Error(`hatSuppressesHair over-suppressed tattoo: ${c.tattoo?.variant?.name}`);

  console.log("Exclusion smoke PASS: hat<->hood mutually exclusive (both directions, hood wins); hatSuppressesHair fires (hair->None; beard/mustache/tattoo untouched).");
}

const buckets = bucketTokens();
console.log(`Bucketed tokens — HeroA/Male: ${buckets["HeroA/Male"].length}, HeroA/Female: ${buckets["HeroA/Female"].length}`);
verifyExclusionRules(buckets);
const angularLog = buildAngularPreview(buckets);
const hatLog = buildHatPreview(buckets);
console.log("All forced-preview coverage assertions PASS.");
console.log(JSON.stringify({ angularCount: angularLog.length, hatCount: hatLog.length }, null, 2));
