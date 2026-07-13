#!/usr/bin/env node
/** Force Male_Hooded previews + coverage smoke for JB sign-off. */
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
  pickPalette,
  compositeChromie,
  renderPNG,
} = require("./generate.js");

const OUT = path.join(REPO, "derived_assets", "male_hooded_preview");
const traitsJson = JSON.parse(fs.readFileSync("traits.json", "utf8"));

const SAMPLES = [
  { tokenId: 4, palette: "SIGNAL", label: "SIGNAL" },
  { tokenId: 8, palette: "ACID", label: "ACID" },
  { tokenId: 10, palette: "CYAN", label: "CYAN" },
  { tokenId: 12, palette: "GHOST", label: "GHOST" },
  { tokenId: 13, palette: "BLOOD", label: "BLOOD" },
  { tokenId: 16, palette: "MOSS", label: "MOSS" },
  { tokenId: 17, palette: "SIGNAL_BLONDE", label: "SIGNAL_BLONDE" },
  { tokenId: 18, palette: "BLOOD_BLONDE", label: "BLOOD_BLONDE" },
  { tokenId: 21, palette: "SIGNAL_SHIRT_RED", label: "SIGNAL_SHIRT_RED" },
  { tokenId: 26, palette: "ACID_SHIRT_BLUE", label: "ACID_SHIRT_BLUE" },
];

function forceMaleHooded(tokenId, paletteKey) {
  const character = pickCharacter(tokenId);
  if (character.name !== "HeroA" || character.gender !== "Male") {
    throw new Error(`token ${tokenId}: expected HeroA Male, got ${character.name}/${character.gender}`);
  }
  const picks = pickTokenVariants(tokenId, traitsJson, new Set(), character);
  const hoodDef = traitsJson.slots.hood;
  const variant = hoodDef.variants.find((v) => v.name === "Male_Hooded");
  if (!variant) throw new Error("Male_Hooded variant missing");
  picks.hood = { variant, file: variant.file, buffer: null };
  loadPickBuffers(picks, traitsJson);
  const renderPicks = applyCoverageRules(picks, traitsJson, character);
  const palette = PALETTES[paletteKey] || pickPalette(tokenId, character);
  const buf = compositeChromie(renderPicks, traitsJson, tokenId);
  return { character, picks, renderPicks, palette, buf };
}

function assertCoverage(renderPicks, tokenId) {
  const hood = renderPicks.hood?.variant?.name;
  const shirt = renderPicks.shirt?.variant?.name ?? "None";
  const body = renderPicks.body?.variant?.name ?? "None";
  const hair = renderPicks.hair?.variant?.name ?? "None";
  const necklace = renderPicks.necklace?.variant?.name ?? "None";
  const errors = [];
  if (hood !== "Male_Hooded") errors.push(`hood=${hood}`);
  if (shirt !== "None") errors.push(`shirt not suppressed: ${shirt}`);
  if (body !== "None") errors.push(`body not suppressed: ${body}`);
  if (hair !== "None") errors.push(`hair not suppressed: ${hair}`);
  if (necklace !== "None") errors.push(`necklace not suppressed: ${necklace}`);
  if (errors.length) throw new Error(`token ${tokenId}: ${errors.join("; ")}`);
}

fs.mkdirSync(OUT, { recursive: true });
const coverage = [];

for (const sample of SAMPLES) {
  const { renderPicks, palette, buf } = forceMaleHooded(sample.tokenId, sample.palette);
  assertCoverage(renderPicks, sample.tokenId);
  const png = renderPNG(buf, palette);
  const outPath = path.join(OUT, `token${sample.tokenId}_${sample.label}.png`);
  fs.writeFileSync(outPath, png);
  coverage.push({
    tokenId: sample.tokenId,
    palette: sample.palette,
    hood: renderPicks.hood.variant.name,
    shirt: renderPicks.shirt?.variant?.name ?? "None",
    body: renderPicks.body?.variant?.name ?? "None",
    hair: renderPicks.hair?.variant?.name ?? "None",
    necklace: renderPicks.necklace?.variant?.name ?? "None",
    file: path.relative(REPO, outPath).replace(/\\/g, "/"),
  });
}

fs.writeFileSync(path.join(OUT, "coverage_smoke.json"), `${JSON.stringify(coverage, null, 2)}\n`);
console.log(`Wrote ${SAMPLES.length} previews to ${OUT}`);
console.log("Coverage smoke: PASS (hoodCoversTorso + hoodSuppressesHair)");
