// ============================================================================
// generate.js
// Generate a single Chromie from a token ID. Deterministic — same token ID
// always produces the same Chromie (palette + variants + character slot offsets).
// Coverage rules: original picks kept for metadata; rendering suppressions
// applied per-token (hood=Classic suppresses shirt/body, etc).
// Character system: top-level roll gates palette pool, forced slots, weight overrides.
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { ROLES, PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const { applyDriftToBuffer } = require("./phase3-variance");
const { isGoldToken } = require("./gold-token-ids");
const { getLegendaryForToken, isLegendaryToken } = require("./legendary-token-ids");
const { loadLegendaryFinalBuffer, formatColorUsage } = require("./legendary-finals");
const { characterKey } = require("./on-chain-character-bytes");

let antiNoneStackFireTotal = 0;
let dedupeRerollFireTotal = 0;
let comboCapRerollFireTotal = 0;
const dedupeRerollLog = [];
const comboCapRerollLog = [];

function resetAntiNoneStackStats() {
  antiNoneStackFireTotal = 0;
}

function resetDedupeRerollStats() {
  dedupeRerollFireTotal = 0;
  dedupeRerollLog.length = 0;
}

function resetComboCapRerollStats() {
  comboCapRerollFireTotal = 0;
  comboCapRerollLog.length = 0;
}

function resetGenerationStats() {
  resetAntiNoneStackStats();
  resetDedupeRerollStats();
  resetComboCapRerollStats();
}

function getAntiNoneStackFireTotal() {
  return antiNoneStackFireTotal;
}

function getDedupeRerollFireTotal() {
  return dedupeRerollFireTotal;
}

function getDedupeRerollLog() {
  return dedupeRerollLog;
}

function getComboCapRerollFireTotal() {
  return comboCapRerollFireTotal;
}

function getComboCapRerollLog() {
  return comboCapRerollLog;
}

const ANTI_STACK_CHARACTERS = new Set(["HeroA", "Chubby", "Zombie", "Alien"]);
const DEDUPE_REROLL_MAX = 5;
const COMBO_CAP_MAX = 60;
const COMBO_CAP_REROLL_MAX = 5;

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const ROLE_INDEX = Object.fromEntries(ROLES.map((r, i) => [r, i]));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromStr(s) {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) | 0;
  return seed;
}

function weightedPick(variants, rng) {
  const total = variants.reduce((s, v) => s + (v.weight || 0), 0);
  if (total <= 0) return variants[variants.length - 1];
  let r = rng() * total;
  for (const v of variants) {
    r -= (v.weight || 0);
    if (r < 0) return v;
  }
  return variants[variants.length - 1];
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function colorDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** Build drawColors lookup from a palette's 16 role colors (hex → role name). */
function paletteColorsToDrawColors(paletteColors) {
  const drawColors = {};
  for (let i = 0; i < paletteColors.length; i++) {
    const hex = paletteColors[i].toLowerCase();
    if (!drawColors[hex]) drawColors[hex] = ROLES[i];
  }
  return drawColors;
}

const ZOMBIE_EXTRACTION_COLORS = paletteColorsToDrawColors(PALETTES.ZOMBIE.colors);
const AGENT_EXTRACTION_COLORS = paletteColorsToDrawColors(PALETTES.AGENT.colors);

function isZombieAssetFile(file) {
  return String(file || "").replace(/\\/g, "/").includes("zombie/");
}

function isAgentAssetFile(file) {
  return String(file || "").replace(/\\/g, "/").startsWith("Agent/");
}

function isZombieComponent(slot, pick, character) {
  if (character?.name !== "Zombie") return false;
  return isZombieAssetFile(pick?.file || pick?.variant?.file);
}

function isAgentComponent(slot, pick, character) {
  if (character?.name !== "Agent") return false;
  return isAgentAssetFile(pick?.file || pick?.variant?.file);
}

function isLegendaryHeadVariant(pick) {
  return String(pick?.variant?.name || "").startsWith("Legendary_");
}

/** drawColors for extractToBuffer — character GPL assets use palette hexes, not SIGNAL. */
function resolveExtractionDrawColors(slot, pick, character, slotDef) {
  if (isZombieComponent(slot, pick, character)) return ZOMBIE_EXTRACTION_COLORS;
  if (isAgentComponent(slot, pick, character)) return AGENT_EXTRACTION_COLORS;
  if (pick?.variant?.drawColors) return pick.variant.drawColors;
  if (pick?.variant?.extractionPalette && PALETTES[pick.variant.extractionPalette]) {
    return paletteColorsToDrawColors(PALETTES[pick.variant.extractionPalette].colors);
  }
  return slotDef.drawColors;
}

function extractToBuffer(filePath, drawColors, opts = {}) {
  if (!fs.existsSync(filePath)) return null;
  const png = PNG.sync.read(fs.readFileSync(filePath));
  if (png.width !== GRID || png.height !== GRID) {
    console.warn(`  [WARN] ${path.basename(filePath)}: expected ${GRID}x${GRID}, got ${png.width}x${png.height}`);
    return null;
  }
  const targets = Object.entries(drawColors).map(([hex, role]) => ({
    rgb: hexToRgb(hex),
    slotIndex: ROLE_INDEX[role],
  }));
  const buf = new Uint8Array(PX);
  const t = SETTINGS.bgKnockoutThreshold;
  const skipRgbKnockout = opts.skipRgbKnockout === true;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
      if (a === 0 || (!skipRgbKnockout && r <= t && g <= t && b <= t)) continue;
      let best = null, bestDist = Infinity;
      for (const tgt of targets) {
        const d = colorDistance([r, g, b], tgt.rgb);
        if (d < bestDist) { bestDist = d; best = tgt; }
      }
      buf[y * GRID + x] = best.slotIndex;
    }
  }
  return buf;
}

function compositeChromie(picks, traits, tokenId = 0, driftMap = null) {
  // zOrder stack (back → front): hood 5 … hair 40, hood-up override 41, accessory 45
  const layers = Object.entries(picks)
    .map(([slot, pick]) => ({
      slot,
      zOrder: (pick.variant && typeof pick.variant.zOrder === "number")
        ? pick.variant.zOrder
        : traits.slots[slot].zOrder,
      buf: pick.buffer,
    }))
    .filter(l => l.buf !== null)
    .sort((a, b) => a.zOrder - b.zOrder);

  const buf = new Uint8Array(PX);
  for (const layer of layers) {
    let layerBuf = layer.buf;
    if (driftMap && driftMap[layer.slot]) {
      const { dx, dy } = driftMap[layer.slot];
      if (dx !== 0 || dy !== 0) {
        layerBuf = applyDriftToBuffer(layerBuf, dx, dy);
      }
    }
    for (let i = 0; i < PX; i++) {
      if (layerBuf[i] !== 0) buf[i] = layerBuf[i];
    }
  }
  return buf;
}

/**
 * Final 64×64 palette-index buffer for a token.
 * Legendaries: verbatim PNG from legendary-finals/ (no compositing).
 * All others: layer composite.
 */
function resolveTokenPixelBuffer(tokenId, traits, renderPicks, driftMap, paletteKey) {
  if (isLegendaryToken(tokenId)) {
    const result = loadLegendaryFinalBuffer(tokenId, paletteKey);
    return {
      buf: result.buf,
      legendaryFinal: true,
      colorUsage: result.colorUsage,
      sourcePath: result.sourcePath,
    };
  }
  return {
    buf: compositeChromie(renderPicks, traits, tokenId, driftMap),
    legendaryFinal: false,
  };
}

function renderSVG(buf, palette) {
  const cell = 1000 / GRID;
  let body = "";
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const idx = buf[y * GRID + x];
      let run = 1;
      while (x + run < GRID && buf[y * GRID + x + run] === idx) run++;
      if (idx !== 0) {
        body += `<rect x="${x * cell}" y="${y * cell}" width="${run * cell}" height="${cell}" fill="${palette.colors[idx]}"/>`;
      }
      x += run;
    }
  }
  const bg = palette.colors[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" shape-rendering="crispEdges"><rect width="1000" height="1000" fill="${bg}"/>${body}</svg>`;
}

function renderPNG(buf, palette, opts = {}) {
  const transparentIndex0 = opts.transparentIndex0 === true;
  const png = new PNG({ width: GRID, height: GRID });
  for (let i = 0; i < PX; i++) {
    const off = i * 4;
    if (transparentIndex0 && buf[i] === 0) {
      png.data[off] = 0;
      png.data[off + 1] = 0;
      png.data[off + 2] = 0;
      png.data[off + 3] = 0;
      continue;
    }
    const hex = palette.colors[buf[i]];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    png.data[off] = r;
    png.data[off + 1] = g;
    png.data[off + 2] = b;
    png.data[off + 3] = 255;
  }
  return PNG.sync.write(png);
}

function upscalePNG(srcBuf, scale) {
  const src = PNG.sync.read(srcBuf);
  const W = src.width * scale, H = src.height * scale;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
      const so = (sy * src.width + sx) * 4;
      const oo = (y * W + x) * 4;
      out.data[oo] = src.data[so];
      out.data[oo + 1] = src.data[so + 1];
      out.data[oo + 2] = src.data[so + 2];
      out.data[oo + 3] = src.data[so + 3];
    }
  }
  return PNG.sync.write(out);
}

// ============================================================================
// CHARACTER SYSTEM
// ============================================================================

function pickCharacter(tokenId) {
  if (!Array.isArray(CHARACTERS) || CHARACTERS.length === 0) {
    return null;
  }
  const rng = mulberry32(seedFromStr(`${tokenId}:character`));
  const total = CHARACTERS.reduce((s, c) => s + (c.weight || 0), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const c of CHARACTERS) {
    r -= (c.weight || 0);
    if (r < 0) return c;
  }
  return CHARACTERS[CHARACTERS.length - 1];
}

function resolveCharacter(tokenId, characterOverride = null, genderOverride = null) {
  if (!characterOverride && !genderOverride) {
    return pickCharacter(tokenId);
  }

  if (characterOverride && genderOverride) {
    const found = CHARACTERS.find(
      (c) =>
        c.name.toLowerCase() === characterOverride.toLowerCase() &&
        c.gender &&
        c.gender.toLowerCase() === genderOverride.toLowerCase(),
    );
    if (found) return found;
    console.warn(
      `  [WARN] no ${characterOverride} entry with gender "${genderOverride}" — falling back to name match`,
    );
  }

  let pool = CHARACTERS;

  if (characterOverride) {
    const namePool = pool.filter(
      (c) => c.name.toLowerCase() === characterOverride.toLowerCase(),
    );
    if (namePool.length === 0) {
      console.warn(`  [WARN] character "${characterOverride}" not found — using rolled character`);
      return pickCharacter(tokenId);
    }
    pool = namePool;
  }

  if (genderOverride) {
    const genderPool = pool.filter(
      (c) => c.gender && c.gender.toLowerCase() === genderOverride.toLowerCase(),
    );
    if (genderPool.length === 0) {
      console.warn(
        `  [WARN] no ${characterOverride || "matching"} entry with gender "${genderOverride}" — keeping ${pool[0]?.gender || "rolled"}`,
      );
      if (characterOverride) return pool[0];
      return pickCharacter(tokenId);
    }
    pool = genderPool;
  }

  // Character forced without gender — first name match (legacy gallery/quick-test behavior)
  if (characterOverride && !genderOverride) {
    return pool[0];
  }

  const rng = mulberry32(seedFromStr(`${tokenId}:character`));
  const total = pool.reduce((s, c) => s + (c.weight || 0), 0);
  if (total <= 0) return pool[0];
  let r = rng() * total;
  for (const c of pool) {
    r -= (c.weight || 0);
    if (r < 0) return c;
  }
  return pool[pool.length - 1];
}

// ============================================================================
// PALETTE PICK — respects character's palettePool if set
// ============================================================================

function pickPalette(tokenId, traits, character = null) {
  const legendary = getLegendaryForToken(tokenId);
  if (legendary) return legendary.palette;
  if (isGoldToken(tokenId)) return "GOLD";
  // If character locks to a specific palette pool, use it
  if (character && Array.isArray(character.palettePool) && character.palettePool.length > 0) {
    const rng = mulberry32(seedFromStr(`${tokenId}:palette`));
    const pool = character.palettePool;
    const idx = Math.floor(rng() * pool.length);
    return pool[idx].toUpperCase();
  }
  // Otherwise roll from traits.json palettes (excluding weight:0 palettes like ALIEN)
  const palettes = (traits.palettes || []).filter(p => (p.weight || 0) > 0);
  if (palettes.length === 0) return "SIGNAL";

  const shirtPalettes = palettes.filter(p => p.name.includes("_SHIRT_"));
  const otherPalettes = palettes.filter(p => !p.name.includes("_SHIRT_"));
  // ~60% of palette rolls land on _SHIRT_* entries; internal spread stays proportional.
  const SHIRT_BUCKET_WEIGHT = 60;
  const OTHER_BUCKET_WEIGHT = 40;

  let pool = palettes;
  if (shirtPalettes.length > 0 && otherPalettes.length > 0) {
    const bucketRng = mulberry32(seedFromStr(`${tokenId}:palette`));
    const bucketTotal = SHIRT_BUCKET_WEIGHT + OTHER_BUCKET_WEIGHT;
    pool = bucketRng() * bucketTotal < SHIRT_BUCKET_WEIGHT ? shirtPalettes : otherPalettes;
  }

  const rng = mulberry32(seedFromStr(`${tokenId}:palette:pick`));
  const total = pool.reduce((s, p) => s + (p.weight || 1), 0);
  let r = rng() * total;
  for (const p of pool) {
    r -= (p.weight || 1);
    if (r < 0) return p.name.toUpperCase();
  }
  return pool[pool.length - 1].name.toUpperCase();
}

// ============================================================================
// COVERAGE RULES
// ============================================================================

function isHoodNone(hoodName) {
  return !hoodName || hoodName === "None" || hoodName === "Female_None";
}

function hoodCoversTorso(hoodName) {
  return hoodName === "Classic" || hoodName === "SP_Classic" || hoodName === "SP_Classic_Female"
      || hoodName === "SP_Classic_Male"
      || hoodName === "Female_Classic" || hoodName === "Female_Hooded" || hoodName === "Male_Hooded"
      || hoodName === "Chubby_Classic"
      || hoodName === "Zombie_Classic" || hoodName === "Zombie_Hooded" || hoodName === "Zombie_Hoodie";
}

function hoodSuppressesHair(hoodName) {
  return isFemaleHood(hoodName) || hoodName === "Male_Hooded" || hoodName === "Chubby_Classic"
      || hoodName === "SP_Classic_Female" || hoodName === "SP_Classic_Male"
      || hoodName === "Zombie_Classic" || hoodName === "Zombie_Hooded" || hoodName === "Zombie_Hoodie";
}

function isFemaleHood(hoodName) {
  return hoodName === "Female_Classic" || hoodName === "Female_Hooded";
}

function applyCoverageRules(picks, traits, character = null, options = {}) {
  const metadataOnly = options.metadataOnly === true;
  const out = {};
  for (const [slot, pick] of Object.entries(picks)) {
    out[slot] = { variant: pick.variant, file: pick.file, buffer: pick.buffer };
  }
  const hoodPick  = out.hood  ? out.hood.variant.name  : null;
  const shirtPick = out.shirt ? out.shirt.variant.name : null;
  const bodyPick  = out.body  ? out.body.variant.name  : null;
  const shirtSlotDef = traits.slots.shirt;
  const bodySlotDef  = traits.slots.body;

  const extractSlotBuffer = (filePath, slot, variantName, slotDef) => {
    if (metadataOnly) return null;
    const relFile = path.relative(SETTINGS.componentsDir, filePath).replace(/\\/g, "/");
    const pick = { variant: { name: variantName }, file: relFile };
    return extractToBuffer(
      filePath,
      resolveExtractionDrawColors(slot, pick, character, slotDef),
      isZombieComponent(slot, pick, character) ? { skipRgbKnockout: true }
        : isAgentComponent(slot, pick, character) ? { skipRgbKnockout: true }
        : undefined,
    );
  };

  const suppressTo = (slot, slotDef) => {
    if (!slotDef) return;
    const noneV = slotDef.variants.find(v => v.name === "None");
    if (!noneV) return;
    const filePath = path.join(SETTINGS.componentsDir, noneV.file);
    out[slot] = {
      variant: noneV,
      file: noneV.file,
      buffer: extractSlotBuffer(filePath, slot, "None", slotDef),
    };
  };

  // Promote to the character default body — Female gets BODY_Female, everyone else BODY_Default
  const promoteToDefault = (slot, slotDef) => {
    if (!slotDef) return;
    const isFemale = character && character.gender === "Female";
    const defaultName = isFemale ? "Female" : "Default";
    const defaultV = slotDef.variants.find(v => v.name === defaultName)
                  || slotDef.variants.find(v => v.name === "Default");
    if (!defaultV) return;
    const filePath = path.join(SETTINGS.componentsDir, defaultV.file);
    out[slot] = {
      variant: defaultV,
      file: defaultV.file,
      buffer: extractSlotBuffer(filePath, slot, defaultName, slotDef),
    };
  };

  const promoteToNamed = (slot, slotDef, variantName) => {
    if (!slotDef) return;
    const variant = slotDef.variants.find(v => v.name === variantName);
    if (!variant) return;
    const filePath = path.join(SETTINGS.componentsDir, variant.file);
    out[slot] = {
      variant,
      file: variant.file,
      buffer: extractSlotBuffer(filePath, slot, variantName, slotDef),
    };
  };

  const pickSideProfileDefaultShirt = () => {
    const candidates = character?.gender === "Female"
      ? ["SP_Crew_Female"]
      : character?.gender === "Male"
        ? ["SP_Crew_Male"]
        : ["SP_Crew", "Crew"];
    for (const name of candidates) {
      const variant = shirtSlotDef.variants.find(v => v.name === name);
      if (!variant) continue;
      if (fs.existsSync(path.join(SETTINGS.componentsDir, variant.file))) return name;
    }
    return null;
  };

  const bodyTattooSlotDef = traits.slots.bodytattoo;
  const isZombie = character && character.name === "Zombie";
  if (isZombie) {
    delete out.neck;
    promoteToNamed("body", bodySlotDef, "Zombie");
  }

  if (isLegendaryHeadVariant(out.head)) {
    for (const slot of ["hair", "beard", "mustache", "eyes", "expression", "mask", "glasses"]) {
      suppressTo(slot, traits.slots[slot]);
    }
    return out;
  }

  const bodyVisible = () => {
    const b = out.body ? out.body.variant.name : null;
    return b === "Default" || b === "Female" || b === "Female_Tank" || b === "Alien" || b === "Zombie" || b === "Agent";
  };

  // Chubby — skip all general body/shirt coverage; torso is always chubby/BODY_Chubby.png.
  if (character && character.name === "Chubby") {
    delete out.neck;
    suppressTo("shirt", shirtSlotDef);
    promoteToNamed("body", bodySlotDef, "Chubby");
    suppressTo("bodytattoo", bodyTattooSlotDef);
    if (hoodSuppressesHair(hoodPick)) {
      suppressTo("hair", traits.slots.hair);
    }
    return out;
  }

  // SideProfile — body slot always None; shirt is SP crew (or rolled SP variant), never naked default.
  if (character && character.name === "SideProfile") {
    if (character.gender === "Male") {
      delete out.neck; // neck baked into SideProfile_Male head asset
    }
    suppressTo("body", bodySlotDef);
    suppressTo("bodytattoo", bodyTattooSlotDef);
    const finalHood = out.hood ? out.hood.variant.name : null;
    const finalShirt = out.shirt ? out.shirt.variant.name : null;
    if (hoodCoversTorso(finalHood)) {
      suppressTo("shirt", shirtSlotDef);
    } else if (isHoodNone(finalHood) && finalShirt === "None") {
      const defaultShirt = pickSideProfileDefaultShirt();
      if (defaultShirt) promoteToNamed("shirt", shirtSlotDef, defaultShirt);
    }
    const necklaceSlotDef = traits.slots.necklace;
    if (necklaceSlotDef) {
      const necklaceName = out.necklace ? out.necklace.variant.name : null;
      const keepSpNecklace = necklaceName && necklaceName.startsWith("SP_") && necklaceName !== "None";
      if (!keepSpNecklace) suppressTo("necklace", necklaceSlotDef);
    }
    return out;
  }

  // Alien — forced body slot always Alien; skip tank-shirt group / shirtless promotion rules.
  if (character && character.name === "Alien") {
    promoteToNamed("body", bodySlotDef, "Alien");
    return out;
  }

  // Tank_Female shirt pairs with Female_Tank body (also covers CLI/quick-test overrides).
  if (shirtPick === "Tank_Female") {
    promoteToNamed("body", bodySlotDef, "Female_Tank");
  }

  if (hoodCoversTorso(hoodPick)) {
    suppressTo("shirt", shirtSlotDef);
    if (!isZombie) suppressTo("body",  bodySlotDef);
    suppressTo("bodytattoo", bodyTattooSlotDef);
  } else if (isHoodNone(hoodPick) && shirtPick === "None" && bodyPick !== "Tank" && !isZombie) {
    promoteToDefault("body", bodySlotDef);
    // bodytattoo stays as rolled — body is visible
  } else if ((bodyPick === "Default" || bodyPick === "Female" || bodyPick === "Female_Tank" || bodyPick === "Zombie") && (!isHoodNone(hoodPick) || (shirtPick !== "None" && shirtPick !== "Tank_Female"))) {
    if (!isZombie) suppressTo("body", bodySlotDef);
    suppressTo("bodytattoo", bodyTattooSlotDef);
  }

  // Female hood variants — hair hidden under hood (hood-up or hood-down bib).
  if (hoodSuppressesHair(hoodPick)) {
    suppressTo("hair", traits.slots.hair);
  }

  // Final check — if body ended up None/Tank, suppress bodytattoo
  if (!bodyVisible()) {
    suppressTo("bodytattoo", bodyTattooSlotDef);
  }

  // Necklace — shows when shirtless or tank, suppressed on crew/hood
  const necklaceSlotDef = traits.slots.necklace;
  if (necklaceSlotDef) {
    const finalBody = out.body ? out.body.variant.name : null;
    const finalHood = out.hood ? out.hood.variant.name : null;
    const finalShirt = out.shirt ? out.shirt.variant.name : null;
    const necklaceVisible = !hoodCoversTorso(finalHood) &&
                            (finalShirt === "None" || finalShirt === "Tank" || finalShirt === "Tank_Female" || finalBody === "Tank" || finalBody === "Female_Tank");
    if (!necklaceVisible) {
      suppressTo("necklace", necklaceSlotDef);
    }
  }

  return out;
}

// ============================================================================
// VARIANT PICK — character-aware
// ============================================================================

function applyLegendaryHeadOverride(tokenId, picks, traits) {
  const legendary = getLegendaryForToken(tokenId);
  if (!legendary?.headVariant) return;
  const headDef = traits.slots.head;
  if (!headDef) return;
  const variant = headDef.variants.find((v) => v.name === legendary.headVariant);
  if (!variant) {
    console.warn(`  [WARN] legendary head variant "${legendary.headVariant}" not found in traits.json`);
    return;
  }
  picks.head = { variant, file: variant.file, buffer: null };
}

function getEligibleVariants(slot, def, character, opts = {}) {
  if (character && character.forcedSlots && character.forcedSlots[slot] !== undefined) {
    return null;
  }

  let variants = def.variants;
  if (character && character.slotWeightOverrides && character.slotWeightOverrides[slot]) {
    const overrides = character.slotWeightOverrides[slot];
    variants = def.variants.map(v => {
      if (overrides[v.name] !== undefined) {
        return { ...v, weight: Math.round((v.weight || 0) * overrides[v.name]) };
      }
      return v;
    });
  }

  if (character && character.slotVariantPool && character.slotVariantPool[slot]) {
    const poolDef = character.slotVariantPool[slot];
    if (Array.isArray(poolDef)) {
      const pool = new Set(poolDef);
      variants = variants.map(v => pool.has(v.name) ? v : { ...v, weight: 0 });
    } else {
      variants = variants.map(v =>
        poolDef[v.name] !== undefined ? { ...v, weight: poolDef[v.name] } : { ...v, weight: 0 }
      );
    }
  }

  let eligible = variants.filter(v => (v.weight || 0) > 0);
  if (opts.excludeNone) {
    eligible = eligible.filter(v => v.name !== "None");
  }
  if (opts.excludeNames?.length) {
    const blocked = new Set(opts.excludeNames);
    eligible = eligible.filter(v => !blocked.has(v.name));
  }
  return eligible;
}

function rollSlotVariant(tokenId, slot, traits, character, seedSuffix = "", opts = {}) {
  const def = traits.slots[slot];
  if (!def) return null;

  if (character && character.forcedSlots && character.forcedSlots[slot] !== undefined) {
    return null;
  }

  const eligible = getEligibleVariants(slot, def, character, opts);
  if (!eligible || eligible.length === 0) return null;

  const rng = mulberry32(seedFromStr(`${tokenId}:${slot}${seedSuffix}`));
  return weightedPick(eligible, rng);
}

function syncGroupForPick(picks, slot, variant, traits, character, skipSet = new Set()) {
  if (!variant?.group) return;
  const group = variant.group;
  for (const [slotName, def] of Object.entries(traits.slots)) {
    if (skipSet.has(slotName.toLowerCase())) continue;
    const forcedName = character?.forcedSlots?.[slotName];
    if (forcedName !== undefined) {
      if (slotName === "body" && group === "tank_female" && forcedName === "Female") {
        const tankBody = def.variants.find(v => v.name === "Female_Tank");
        if (tankBody) {
          picks[slotName] = { variant: tankBody, file: tankBody.file, buffer: null };
        }
      }
      continue;
    }
    if (picks[slotName] && picks[slotName].variant.group === group) continue;
    const grouped = def.variants.find(v => v.group === group);
    if (grouped) {
      picks[slotName] = { variant: grouped, file: grouped.file, buffer: null };
    }
  }
}

function isAntiNoneStackExempt(tokenId, character) {
  if (isGoldToken(tokenId)) return true;
  if (getLegendaryForToken(tokenId)) return true;
  if (!character) return true;
  if (character.name === "Agent") return true;
  return false;
}

function usesAntiNoneStacking(character) {
  return Boolean(character && ANTI_STACK_CHARACTERS.has(character.name));
}

function applyAntiNoneStacking(tokenId, picks, traits, character, options = {}) {
  if (isAntiNoneStackExempt(tokenId, character)) {
    return {
      picks,
      renderPicks: applyCoverageRules(picks, traits, character, options),
      fires: 0,
    };
  }
  if (!usesAntiNoneStacking(character)) {
    return {
      picks,
      renderPicks: applyCoverageRules(picks, traits, character, options),
      fires: 0,
    };
  }

  let workingPicks = picks;
  let fires = 0;
  const maxAttempts = 12;

  attemptLoop: for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const renderPicks = applyCoverageRules(workingPicks, traits, character, options);
    const hair = renderPicks.hair?.variant?.name ?? "None";
    const glasses = renderPicks.glasses?.variant?.name ?? "None";
    const shirt = renderPicks.shirt?.variant?.name ?? "None";

    if (!(hair === "None" && glasses === "None" && shirt === "None")) {
      return { picks: workingPicks, renderPicks, fires };
    }

    fires += 1;
    const hoodName = workingPicks.hood?.variant?.name ?? null;
    const hairSuppressed = hoodSuppressesHair(hoodName) || isLegendaryHeadVariant(workingPicks.head);
    const seedSuffix = `:restack:${attempt}`;

    if (!hairSuppressed) {
      const variant = rollSlotVariant(tokenId, "hair", traits, character, seedSuffix, { excludeNone: true });
      if (variant) {
        workingPicks = { ...workingPicks, hair: { variant, file: variant.file, buffer: null } };
        continue attemptLoop;
      }
    }

    if (character.name !== "Chubby" && character.name !== "Zombie") {
      const variant = rollSlotVariant(tokenId, "shirt", traits, character, seedSuffix, { excludeNone: true });
      if (variant) {
        workingPicks = { ...workingPicks, shirt: { variant, file: variant.file, buffer: null } };
        syncGroupForPick(workingPicks, "shirt", variant, traits, character);
        const afterShirt = applyCoverageRules(workingPicks, traits, character, options);
        const shirtAfter = afterShirt.shirt?.variant?.name ?? "None";
        if (shirtAfter !== "None") {
          continue attemptLoop;
        }
      }
    }

    const glassesVariant = rollSlotVariant(tokenId, "glasses", traits, character, seedSuffix, { excludeNone: true });
    if (glassesVariant) {
      workingPicks = {
        ...workingPicks,
        glasses: { variant: glassesVariant, file: glassesVariant.file, buffer: null },
      };
      continue attemptLoop;
    }

    if (character.name === "Zombie" || character.name === "Alien") {
      for (const slot of ["hood", "necklace", "accessory"]) {
        const variant = rollSlotVariant(tokenId, slot, traits, character, seedSuffix, { excludeNone: true });
        if (variant) {
          workingPicks = { ...workingPicks, [slot]: { variant, file: variant.file, buffer: null } };
          continue attemptLoop;
        }
      }
    }

    break;
  }

  return {
    picks: workingPicks,
    renderPicks: applyCoverageRules(workingPicks, traits, character, options),
    fires,
  };
}

function finalizeTokenTraits(tokenId, picks, traits, character, options = {}) {
  const applyAntiStack = options.applyAntiStack !== false;
  let antiStackFires = 0;
  let renderPicks;

  if (applyAntiStack) {
    const stackResult = applyAntiNoneStacking(tokenId, picks, traits, character, options);
    antiStackFires = stackResult.fires;
    antiNoneStackFireTotal += antiStackFires;
    renderPicks = stackResult.renderPicks;
    picks = stackResult.picks;
  } else {
    renderPicks = applyCoverageRules(picks, traits, character, options);
  }

  return { picks, renderPicks, antiStackFires };
}

function buildTraitVectorKey(character, paletteKey, renderPicks, traits) {
  const parts = [`char:${characterKey(character)}`, `pal:${paletteKey}`];
  for (const slot of Object.keys(traits.slots).sort()) {
    parts.push(`${slot}:${renderPicks[slot]?.variant?.name ?? "None"}`);
  }
  return parts.join("|");
}

function getRollableSlots(character, traits) {
  const slots = [];
  for (const slot of Object.keys(traits.slots)) {
    if (character?.forcedSlots?.[slot] !== undefined) continue;
    const eligible = getEligibleVariants(slot, traits.slots[slot], character);
    if (eligible && eligible.length > 1) slots.push(slot);
  }
  return slots.sort();
}

function getDedupeRerollCandidates(character, traits, renderPicks) {
  return getRollableSlots(character, traits).filter((slot) => {
    const current = renderPicks[slot]?.variant?.name ?? "None";
    const eligible = getEligibleVariants(slot, traits.slots[slot], character, {
      excludeNames: [current],
    });
    return eligible.length > 0;
  });
}


function clonePicksShallow(picks) {
  const out = {};
  for (const [slot, pick] of Object.entries(picks)) {
    out[slot] = { variant: pick.variant, file: pick.file, buffer: null };
  }
  return out;
}

function setPickVariant(picks, slot, variant, traits, character) {
  picks[slot] = { variant, file: variant.file, buffer: null };
  if (slot === "shirt") syncGroupForPick(picks, slot, variant, traits, character);
}

function applyStoredRerolls(picks, rerolls, traits, character) {
  for (const rr of rerolls) {
    setPickVariant(picks, rr.slot, rr.variant, traits, character);
  }
}

function collectUnusedSingleSlotResolutions(
  tokenId,
  picks,
  renderPicks,
  traits,
  character,
  paletteKey,
  dedupeGuard,
  options,
  rerolls,
) {
  const resolutions = [];
  const usedSlots = new Set(rerolls.map((r) => r.slot));
  let slots = getDedupeRerollCandidates(character, traits, renderPicks).filter((s) => !usedSlots.has(s));
  if (slots.length === 0) {
    slots = getDedupeRerollCandidates(character, traits, renderPicks);
  }

  for (const slot of slots.sort()) {
    const current = renderPicks[slot]?.variant?.name ?? "None";
    const eligible = getEligibleVariants(slot, traits.slots[slot], character, {
      excludeNames: [current],
    }).sort((a, b) => a.name.localeCompare(b.name));

    for (const variant of eligible) {
      const trialPicks = clonePicksShallow(picks);
      setPickVariant(trialPicks, slot, variant, traits, character);
      const { renderPicks: trialRender } = finalizeTokenTraits(
        tokenId,
        trialPicks,
        traits,
        character,
        { metadataOnly: options.metadataOnly, applyAntiStack: options.applyAntiStack },
      );
      const trialKey = buildTraitVectorKey(character, paletteKey, trialRender, traits);
      if (!dedupeGuard.seen.has(trialKey)) {
        resolutions.push({ slot, variant });
      }
    }
  }

  return resolutions;
}

function collectAnySingleSlotChanges(character, traits, renderPicks, rerolls, allowRepeatSlots = false) {
  const changes = [];
  const usedSlots = allowRepeatSlots ? new Set() : new Set(rerolls.map((r) => r.slot));
  let slots = getDedupeRerollCandidates(character, traits, renderPicks).filter((s) => !usedSlots.has(s));
  if (slots.length === 0) {
    slots = getDedupeRerollCandidates(character, traits, renderPicks);
  }

  for (const slot of slots.sort()) {
    const current = renderPicks[slot]?.variant?.name ?? "None";
    const eligible = getEligibleVariants(slot, traits.slots[slot], character, {
      excludeNames: [current],
    }).sort((a, b) => a.name.localeCompare(b.name));

    for (const variant of eligible) {
      changes.push({ slot, variant });
    }
  }

  return changes;
}

function traitKeyForPicks(tokenId, picks, traits, character, paletteKey, options) {
  const { renderPicks } = finalizeTokenTraits(
    tokenId,
    picks,
    traits,
    character,
    { metadataOnly: options.metadataOnly, applyAntiStack: options.applyAntiStack },
  );
  return buildTraitVectorKey(character, paletteKey, renderPicks, traits);
}

function planDedupeRerollStep(
  tokenId,
  traits,
  character,
  paletteKey,
  dedupeGuard,
  options,
  rerolls,
  remainingAttempts,
) {
  if (remainingAttempts <= 0) return null;

  const basePicks = pickTokenVariants(tokenId, traits, options.skipSet || new Set(), character, false);
  applyStoredRerolls(basePicks, rerolls, traits, character);

  const finalizeOpts = { metadataOnly: options.metadataOnly, applyAntiStack: options.applyAntiStack };
  const queue = [{ picks: basePicks, steps: [] }];
  const visited = new Set([traitKeyForPicks(tokenId, basePicks, traits, character, paletteKey, options)]);

  while (queue.length > 0) {
    const { picks: statePicks, steps } = queue.shift();
    if (steps.length >= remainingAttempts) continue;

    const { renderPicks: stateRender } = finalizeTokenTraits(
      tokenId,
      statePicks,
      traits,
      character,
      finalizeOpts,
    );

    for (const change of collectAnySingleSlotChanges(character, traits, stateRender, steps, true)) {
      const nextPicks = clonePicksShallow(statePicks);
      setPickVariant(nextPicks, change.slot, change.variant, traits, character);
      const nextKey = traitKeyForPicks(tokenId, nextPicks, traits, character, paletteKey, options);

      if (!dedupeGuard.seen.has(nextKey)) {
        return steps.length === 0 ? change : steps[0];
      }

      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        queue.push({ picks: nextPicks, steps: [...steps, change] });
      }
    }
  }

  return null;
}

function enumerateDirectUnusedAssignments(
  tokenId,
  traits,
  character,
  paletteKey,
  dedupeGuard,
  options,
) {
  const rollable = getRollableSlots(character, traits);
  if (rollable.length === 0) return [];

  const lists = rollable.map((slot) => {
    return getEligibleVariants(slot, traits.slots[slot], character)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const assignments = [];
  const finalizeOpts = { metadataOnly: options.metadataOnly, applyAntiStack: options.applyAntiStack };

  function walk(slotIdx, chosen) {
    if (slotIdx === rollable.length) {
      const trialPicks = pickTokenVariants(tokenId, traits, options.skipSet || new Set(), character, false);
      for (const [slot, variant] of Object.entries(chosen)) {
        setPickVariant(trialPicks, slot, variant, traits, character);
      }
      const { renderPicks } = finalizeTokenTraits(tokenId, trialPicks, traits, character, finalizeOpts);
      const key = buildTraitVectorKey(character, paletteKey, renderPicks, traits);
      if (!dedupeGuard.seen.has(key)) {
        assignments.push({ picks: trialPicks, renderPicks, key, chosen: { ...chosen } });
      }
      return;
    }

    const slot = rollable[slotIdx];
    for (const variant of lists[slotIdx]) {
      chosen[slot] = variant;
      walk(slotIdx + 1, chosen);
    }
  }

  walk(0, {});
  assignments.sort((a, b) => a.key.localeCompare(b.key));
  return assignments;
}

function assignDirectUnusedVector(
  tokenId,
  traits,
  character,
  paletteKey,
  dedupeGuard,
  options,
) {
  const assignments = enumerateDirectUnusedAssignments(
    tokenId,
    traits,
    character,
    paletteKey,
    dedupeGuard,
    options,
  );
  if (assignments.length === 0) return null;

  const rng = mulberry32(seedFromStr(`${tokenId}:dedupe:direct`));
  return assignments[Math.floor(rng() * assignments.length)];
}

function buildNearDupComboKey(character, renderPicks) {
  return [
    characterKey(character),
    renderPicks.hair?.variant?.name ?? "None",
    renderPicks.glasses?.variant?.name ?? "None",
    renderPicks.shirt?.variant?.name ?? "None",
  ].join("|");
}

function isComboCapExempt(tokenId, character) {
  if (isGoldToken(tokenId)) return true;
  if (getLegendaryForToken(tokenId)) return true;
  if (!character) return true;
  if (["Agent", "Alien", "Zombie"].includes(character.name)) return true;
  return false;
}

class ComboCapGuard {
  constructor(maxPerCombo = COMBO_CAP_MAX) {
    this.maxPerCombo = maxPerCombo;
    this.counts = new Map();
  }

  isAtCap(comboKey) {
    return (this.counts.get(comboKey) || 0) >= this.maxPerCombo;
  }

  register(comboKey) {
    this.counts.set(comboKey, (this.counts.get(comboKey) || 0) + 1);
  }
}

function comboCapSlotOrder(picks, renderPicks, character) {
  const hoodName = renderPicks.hood?.variant?.name ?? picks.hood?.variant?.name ?? null;
  const hairSuppressed = hoodSuppressesHair(hoodName) || isLegendaryHeadVariant(picks.head);
  const hoodCovers = hoodCoversTorso(hoodName);

  const slotOrder = [];
  if (!hairSuppressed) slotOrder.push("hair");
  slotOrder.push("glasses");
  if (!hoodCovers) {
    slotOrder.push("shirt");
  } else {
    slotOrder.push("hood", "shirt");
  }
  return slotOrder;
}

function findComboCapResolution(
  tokenId,
  attempt,
  picks,
  renderPicks,
  traits,
  character,
  paletteKey,
  comboCapGuard,
  dedupeGuard,
  options,
) {
  const slotOrder = comboCapSlotOrder(picks, renderPicks, character);
  const finalizeOpts = { metadataOnly: options.metadataOnly, applyAntiStack: options.applyAntiStack };
  const maxSlots = attempt >= 2 ? 2 : 1;

  function trialCandidate(trialPicks) {
    const { picks: trialFinalPicks, renderPicks: trialRender } = finalizeTokenTraits(
      tokenId,
      trialPicks,
      traits,
      character,
      finalizeOpts,
    );
    const trialCombo = buildNearDupComboKey(character, trialRender);
    const trialTraitKey = buildTraitVectorKey(character, paletteKey, trialRender, traits);
    if (!comboCapGuard.isAtCap(trialCombo) && !dedupeGuard.seen.has(trialTraitKey)) {
      return { picks: trialFinalPicks, renderPicks: trialRender, comboKey: trialCombo };
    }
    return null;
  }

  function eligibleForSlot(slot) {
    const current = renderPicks[slot]?.variant?.name ?? "None";
    return getEligibleVariants(slot, traits.slots[slot], character, {
      excludeNone: slot !== "hood",
      excludeNames: [current],
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  const candidates = [];

  for (const slot of slotOrder) {
    for (const variant of eligibleForSlot(slot)) {
      const trialPicks = clonePicksShallow(picks);
      setPickVariant(trialPicks, slot, variant, traits, character);
      const result = trialCandidate(trialPicks);
      if (result) {
        candidates.push({ ...result, slot, variant, slots: [slot] });
      }
    }
  }

  if (maxSlots >= 2) {
    for (let i = 0; i < slotOrder.length; i++) {
      for (let j = i + 1; j < slotOrder.length; j++) {
        const slotA = slotOrder[i];
        const slotB = slotOrder[j];
        for (const variantA of eligibleForSlot(slotA)) {
          for (const variantB of eligibleForSlot(slotB)) {
            const trialPicks = clonePicksShallow(picks);
            setPickVariant(trialPicks, slotA, variantA, traits, character);
            setPickVariant(trialPicks, slotB, variantB, traits, character);
            const result = trialCandidate(trialPicks);
            if (result) {
              candidates.push({
                ...result,
                slot: `${slotA}+${slotB}`,
                variant: { name: `${variantA.name}+${variantB.name}` },
                slots: [slotA, slotB],
              });
            }
          }
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.comboKey.localeCompare(b.comboKey));
  const rng = mulberry32(seedFromStr(`${tokenId}:comboCap:${attempt}`));
  return candidates[Math.floor(rng() * candidates.length)];
}

function commitResolvedTraits(
  tokenId,
  traits,
  dedupeGuard,
  comboCapGuard,
  options,
  resolved,
) {
  const {
    character,
    paletteKey,
    picks,
    renderPicks,
    antiStackFires,
    dedupeRerolls = [],
  } = resolved;

  let workingPicks = picks;
  let workingRender = renderPicks;
  const comboCapRerolls = [];

  if (comboCapGuard && !isComboCapExempt(tokenId, character)) {
    for (let attempt = 1; attempt <= COMBO_CAP_REROLL_MAX; attempt++) {
      const comboKey = buildNearDupComboKey(character, workingRender);
      if (!comboCapGuard.isAtCap(comboKey)) break;

      const originalCombo = comboKey;
      const resolution = findComboCapResolution(
        tokenId,
        attempt,
        workingPicks,
        workingRender,
        traits,
        character,
        paletteKey,
        comboCapGuard,
        dedupeGuard,
        options,
      );
      if (!resolution) {
        if (attempt >= COMBO_CAP_REROLL_MAX) {
          throw new Error(
            `Combo cap: token #${tokenId} no under-cap resolution for "${originalCombo}" after ${COMBO_CAP_REROLL_MAX} attempts`,
          );
        }
        continue;
      }

      workingPicks = resolution.picks;
      workingRender = resolution.renderPicks;

      comboCapRerollFireTotal += 1;
      const entry = {
        tokenId,
        originalCombo,
        slot: resolution.slot,
        variant: resolution.variant.name,
        attempt,
      };
      comboCapRerollLog.push(entry);
      comboCapRerolls.push(entry);
      if (options.logComboCapRerolls !== false) {
        console.log(
          `  [combo-cap-reroll] #${tokenId} "${originalCombo}" → ${resolution.slot}=${resolution.variant.name} (:comboCap:${attempt}, attempt ${attempt}/${COMBO_CAP_REROLL_MAX})`,
        );
      }
    }

    const finalCombo = buildNearDupComboKey(character, workingRender);
    if (comboCapGuard.isAtCap(finalCombo)) {
      throw new Error(
        `Combo cap: token #${tokenId} could not diverge from "${finalCombo}" within ${COMBO_CAP_REROLL_MAX} attempts`,
      );
    }
  }

  const traitKey = buildTraitVectorKey(character, paletteKey, workingRender, traits);
  if (dedupeGuard.seen.has(traitKey)) {
    const partner = dedupeGuard.seen.get(traitKey);
    throw new Error(
      `Duplicate trait vector at token #${tokenId} (collides with #${partner})\n  ${traitKey}`,
    );
  }

  dedupeGuard.seen.set(traitKey, tokenId);
  if (comboCapGuard && !isComboCapExempt(tokenId, character)) {
    comboCapGuard.register(buildNearDupComboKey(character, workingRender));
  }

  return {
    character,
    paletteKey,
    picks: workingPicks,
    renderPicks: workingRender,
    antiStackFires,
    dedupeRerolls,
    comboCapRerolls,
  };
}

class TraitDedupeGuard {
  constructor() {
    this.seen = new Map();
  }

  assert(tokenId, character, paletteKey, renderPicks, traits) {
    const key = buildTraitVectorKey(character, paletteKey, renderPicks, traits);
    if (this.seen.has(key)) {
      const prevTokenId = this.seen.get(key);
      throw new Error(
        `Duplicate trait vector at token #${tokenId} (collides with #${prevTokenId})\n  ${key}`,
      );
    }
    this.seen.set(key, tokenId);
    return key;
  }
}

function resolveUniqueTokenTraits(tokenId, traits, dedupeGuard, options = {}) {
  const metadataOnly = options.metadataOnly === true;
  const skipSet = options.skipSet || new Set();
  const comboCapGuard = options.comboCapGuard || null;
  const rollId = options.rollTokenId || tokenId;
  const character = options.character || pickCharacter(rollId);
  const paletteKey = options.paletteKey || pickPalette(rollId, traits, character);
  const loadBuffers = options.loadBuffers !== false && !isLegendaryToken(tokenId) && !metadataOnly;
  const rerolls = [];

  for (let dedupeAttempt = 0; dedupeAttempt <= DEDUPE_REROLL_MAX; dedupeAttempt++) {
    const picks = pickTokenVariants(rollId, traits, skipSet, character, loadBuffers);
    applyStoredRerolls(picks, rerolls, traits, character);

    const { picks: finalPicks, renderPicks, antiStackFires } = finalizeTokenTraits(
      tokenId,
      picks,
      traits,
      character,
      { metadataOnly, applyAntiStack: options.applyAntiStack },
    );

    const key = buildTraitVectorKey(character, paletteKey, renderPicks, traits);

    if (!dedupeGuard.seen.has(key)) {
      return commitResolvedTraits(tokenId, traits, dedupeGuard, comboCapGuard, options, {
        character,
        paletteKey,
        picks: finalPicks,
        renderPicks,
        antiStackFires,
        dedupeRerolls: rerolls,
      });
    }

    if (dedupeAttempt >= DEDUPE_REROLL_MAX) {
      const partner = dedupeGuard.seen.get(key);
      const direct = assignDirectUnusedVector(
        tokenId,
        traits,
        character,
        paletteKey,
        dedupeGuard,
        { ...options, skipSet },
      );
      if (direct) {
        dedupeRerollFireTotal += 1;
        const changedSlots = Object.keys(direct.chosen).map(
          (slot) => `${slot}=${direct.chosen[slot].name}`,
        );
        const entry = {
          tokenId,
          partnerId: partner,
          slot: changedSlots.join(", "),
          variant: "direct-assign",
          attempt: dedupeAttempt + 1,
        };
        dedupeRerollLog.push(entry);
        if (options.logDedupeRerolls !== false) {
          console.log(
            `  [dedupe-reroll] #${tokenId} collides with #${partner} → direct assign {${changedSlots.join(", ")}} (attempt ${dedupeAttempt + 1}/${DEDUPE_REROLL_MAX}+direct)`,
          );
        }
        return commitResolvedTraits(tokenId, traits, dedupeGuard, comboCapGuard, options, {
          character,
          paletteKey,
          picks: direct.picks,
          renderPicks: direct.renderPicks,
          antiStackFires: 0,
          dedupeRerolls: [...rerolls, { direct: true, chosen: direct.chosen }],
        });
      }
      throw new Error(
        `Duplicate trait vector at token #${tokenId} after ${dedupeAttempt} dedupe reroll(s) (collides with #${partner})\n  ${key}`,
      );
    }

    const partner = dedupeGuard.seen.get(key);
    const attemptNum = dedupeAttempt + 1;
    const remainingAttempts = DEDUPE_REROLL_MAX - rerolls.length;
    const planned = planDedupeRerollStep(
      tokenId,
      traits,
      character,
      paletteKey,
      dedupeGuard,
      { ...options, skipSet },
      rerolls,
      remainingAttempts,
    );

    let choice = planned;
    if (!choice) {
      const direct = assignDirectUnusedVector(
        tokenId,
        traits,
        character,
        paletteKey,
        dedupeGuard,
        { ...options, skipSet },
      );
      if (direct) {
        dedupeRerollFireTotal += 1;
        const changedSlots = Object.keys(direct.chosen).map(
          (slot) => `${slot}=${direct.chosen[slot].name}`,
        );
        const entry = {
          tokenId,
          partnerId: partner,
          slot: changedSlots.join(", "),
          variant: "direct-assign",
          attempt: attemptNum,
        };
        dedupeRerollLog.push(entry);
        if (options.logDedupeRerolls !== false) {
          console.log(
            `  [dedupe-reroll] #${tokenId} collides with #${partner} → direct assign {${changedSlots.join(", ")}} (:dedupe:direct, attempt ${attemptNum}/${DEDUPE_REROLL_MAX})`,
          );
        }
        return commitResolvedTraits(tokenId, traits, dedupeGuard, comboCapGuard, options, {
          character,
          paletteKey,
          picks: direct.picks,
          renderPicks: direct.renderPicks,
          antiStackFires: 0,
          dedupeRerolls: [...rerolls, { direct: true, chosen: direct.chosen }],
        });
      }

      let resolutions = collectUnusedSingleSlotResolutions(
        tokenId,
        picks,
        renderPicks,
        traits,
        character,
        paletteKey,
        dedupeGuard,
        options,
        rerolls,
      );
      if (resolutions.length === 0) {
        resolutions = collectAnySingleSlotChanges(character, traits, renderPicks, rerolls);
      }
      if (resolutions.length === 0) {
        throw new Error(
          `Duplicate trait vector at token #${tokenId} (collides with #${partner}) — no dedupe path within ${DEDUPE_REROLL_MAX} rerolls\n  ${key}`,
        );
      }
      const rng = mulberry32(seedFromStr(`${tokenId}:dedupe:${attemptNum}`));
      choice = resolutions[Math.floor(rng() * resolutions.length)];
    }

    rerolls.push({ slot: choice.slot, variant: choice.variant, attempt: attemptNum, partnerId: partner });
    dedupeRerollFireTotal += 1;
    const entry = {
      tokenId,
      partnerId: partner,
      slot: choice.slot,
      variant: choice.variant.name,
      attempt: attemptNum,
    };
    dedupeRerollLog.push(entry);
    if (options.logDedupeRerolls !== false) {
      console.log(
        `  [dedupe-reroll] #${tokenId} collides with #${partner} → ${choice.slot}=${choice.variant.name} (:dedupe:${attemptNum}, attempt ${attemptNum}/${DEDUPE_REROLL_MAX})`,
      );
    }
  }

  throw new Error(`resolveUniqueTokenTraits exhausted rerolls for token #${tokenId}`);
}

function pickTokenVariants(tokenId, traits, skipSet = new Set(), character = null, loadBuffers = true) {
  const picks = {};

  for (const [slot, def] of Object.entries(traits.slots)) {
    if (skipSet.has(slot.toLowerCase())) continue;

    // If character forces this slot, apply it directly — no roll
    if (character && character.forcedSlots && character.forcedSlots[slot] !== undefined) {
      const forcedName = character.forcedSlots[slot];
      const forcedVariant = def.variants.find(v => v.name === forcedName);
      if (forcedVariant) {
        picks[slot] = { variant: forcedVariant, file: forcedVariant.file, buffer: null };
        continue;
      }
    }

    const eligible = getEligibleVariants(slot, def, character);
    if (!eligible || eligible.length === 0) {
      const noneV = def.variants.find(v => v.name === "None");
      if (noneV) picks[slot] = { variant: noneV, file: noneV.file, buffer: null };
      continue;
    }

    const rng = mulberry32(seedFromStr(`${tokenId}:${slot}`));
    const variant = weightedPick(eligible, rng);
    picks[slot] = { variant, file: variant.file, buffer: null };
  }

  // Group coordination (tank shirt ↔ tank body)
  const activeGroups = new Set();
  for (const pick of Object.values(picks)) {
    if (pick.variant.group) activeGroups.add(pick.variant.group);
  }
  for (const group of activeGroups) {
    for (const [slot, def] of Object.entries(traits.slots)) {
      if (skipSet.has(slot.toLowerCase())) continue;
      const forcedName = character?.forcedSlots?.[slot];
      if (forcedName !== undefined) {
        // HeroA Female forces body: Female — still upgrade to Female_Tank when tank shirt rolls.
        if (slot === "body" && group === "tank_female" && forcedName === "Female") {
          const tankBody = def.variants.find(v => v.name === "Female_Tank");
          if (tankBody) {
            picks[slot] = { variant: tankBody, file: tankBody.file, buffer: null };
          }
        }
        continue;
      }
      if (picks[slot] && picks[slot].variant.group === group) continue;
      const grouped = def.variants.find(v => v.group === group);
      if (grouped) {
        picks[slot] = { variant: grouped, file: grouped.file, buffer: null };
      }
    }
  }
  // Orphan cleanup
  for (const [slot, pick] of Object.entries(picks)) {
    if (!pick.variant.group) continue;
    const groupAnchoredElsewhere = Object.entries(picks).some(([s, p]) =>
      s !== slot && p.variant.group === pick.variant.group
    );
    if (!groupAnchoredElsewhere) {
      const def = traits.slots[slot];
      const noneVariant = def.variants.find(v => v.name === "None");
      if (noneVariant) {
        picks[slot] = { variant: noneVariant, file: noneVariant.file, buffer: null };
      }
    }
  }

  applyLegendaryHeadOverride(tokenId, picks, traits);

  // Load buffers
  if (loadBuffers) loadPickBuffers(picks, traits, character);
  return picks;
}

function loadPickBuffers(picks, traits, character = null) {
  for (const [slot, pick] of Object.entries(picks)) {
    const filePath = path.join(SETTINGS.componentsDir, pick.file);
    const slotDef = traits.slots[slot];
    pick.buffer = extractToBuffer(
      filePath,
      resolveExtractionDrawColors(slot, pick, character, slotDef),
      isZombieComponent(slot, pick, character) ? { skipRgbKnockout: true }
        : isAgentComponent(slot, pick, character) ? { skipRgbKnockout: true }
        : undefined,
    );
  }
}

// ============================================================================
// METADATA + MASTER LEDGER
// ============================================================================

const CHARACTER_TYPE_DISPLAY = {
  "HeroA": "Human",
  "Alien": "Alien",
  "Cat": "Cat",
  "Zombie": "Zombie",
  "Agent": "Agent",
};

function buildMetadata(tokenId, paletteKey, picks, character = null) {
  const attributes = [];
  const legendary = getLegendaryForToken(tokenId);
  if (legendary) {
    attributes.push({ trait_type: "Tier", value: legendary.tier });
    attributes.push({ trait_type: "Artist", value: legendary.artist });
  }
  if (character) {
    const typeDisplay = CHARACTER_TYPE_DISPLAY[character.name] || character.name;
    attributes.push({ trait_type: "Type", value: typeDisplay });
    if (character.gender) attributes.push({ trait_type: "Gender", value: character.gender });
  }
  attributes.push({ trait_type: "Palette", value: paletteKey });
  for (const [slot, pick] of Object.entries(picks)) {
    const traitType = slot.charAt(0).toUpperCase() + slot.slice(1);
    attributes.push({ trait_type: traitType, value: pick.variant.name });
  }
  return {
    tokenId,
    name: `Chromie #${String(tokenId).padStart(4, "0")}`,
    image: `${String(tokenId).padStart(4, "0")}.png`,
    attributes,
  };
}

function updateMaster(tokenId, paletteKey, picks, character = null) {
  const masterJsonPath = path.join(SETTINGS.outputDir, "master.json");
  const masterCsvPath = path.join(SETTINGS.outputDir, "master.csv");
  const row = {
    tokenId,
    name: `Chromie #${String(tokenId).padStart(4, "0")}`,
  };
  if (character) {
    row.type = CHARACTER_TYPE_DISPLAY[character.name] || character.name;
    if (character.gender) row.gender = character.gender;
  }
  row.palette = paletteKey;
  for (const [slot, pick] of Object.entries(picks)) {
    row[slot] = pick.variant.name;
  }

  let rows = [];
  if (fs.existsSync(masterJsonPath)) {
    try {
      rows = JSON.parse(fs.readFileSync(masterJsonPath, "utf8"));
      if (!Array.isArray(rows)) rows = [];
    } catch (e) { rows = []; }
  }
  rows = rows.filter(r => r.tokenId !== tokenId);
  rows.push(row);
  rows.sort((a, b) => a.tokenId - b.tokenId);
  fs.writeFileSync(masterJsonPath, JSON.stringify(rows, null, 2));
  const columns = [];
  const seen = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) { seen.add(k); columns.push(k); }
    }
  }
  const csvLines = [columns.join(",")];
  for (const r of rows) {
    csvLines.push(columns.map(c => {
      const v = r[c] === undefined ? "" : String(r[c]);
      if (v.includes(",") || v.includes('"')) return `"${v.replace(/"/g, '""')}"`;
      return v;
    }).join(","));
  }
  fs.writeFileSync(masterCsvPath, csvLines.join("\n"));
}

// ============================================================================
// CHARACTER SLOT OFFSETS (legacy slotDriftOverrides — not drift-tier noise)
// ============================================================================

function buildPhase3Effects(tokenId, picks, composedBuf, character = null) {
  const driftMap = {};
  if (character && character.slotDriftOverrides) {
    for (const [slot, override] of Object.entries(character.slotDriftOverrides)) {
      if (picks[slot]) {
        driftMap[slot] = { dx: override.dx || 0, dy: override.dy || 0 };
      }
    }
  }
  return { driftMap };
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { tokenId: 1, palette: null, skip: new Set(), character: null, gender: null, hair: null, hood: null, shirt: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--token" || a === "-t") result.tokenId = parseInt(args[++i], 10);
    else if (a === "--palette" || a === "-p") result.palette = args[++i].toUpperCase();
    else if (a === "--character") result.character = args[++i];
    else if (a === "--gender") result.gender = args[++i];
    else if (a === "--hair") result.hair = args[++i];
    else if (a === "--hood") result.hood = args[++i];
    else if (a === "--shirt") result.shirt = args[++i];
    else if (a === "--skip") args[++i].split(",").forEach(s => result.skip.add(s.trim().toLowerCase()));
    else if (a.startsWith("--skip=")) a.slice(7).split(",").forEach(s => result.skip.add(s.trim().toLowerCase()));
  }
  return result;
}

function main() {
  const { tokenId, palette: paletteOverride, skip, character: characterOverride, gender: genderOverride, hair: hairOverride, hood: hoodOverride, shirt: shirtOverride } = parseArgs();
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));

  // Pick character
  let character = pickCharacter(tokenId);
  if (characterOverride) {
    const found = (CHARACTERS || []).find(c => c.name.toLowerCase() === characterOverride.toLowerCase());
    if (found) character = found;
  }
  if (genderOverride && character) {
    const found = (CHARACTERS || []).find(c =>
      c.name === character.name &&
      c.gender && c.gender.toLowerCase() === genderOverride.toLowerCase()
    );
    if (found) character = found;
    else console.warn(`  no ${character.name} entry with gender "${genderOverride}" — keeping ${character.gender || "rolled"}`);
  }

  const paletteKey = paletteOverride || pickPalette(tokenId, traits, character);
  const palette = PALETTES[paletteKey];
  if (!palette || !palette.colors) {
    console.error(`palette ${paletteKey} not defined or missing colors`);
    process.exit(1);
  }

  const charLabel = character ? ` | character: ${character.name}${character.gender ? ` (${character.gender})` : ""}` : "";
  console.log(`Generating Chromie #${tokenId} (palette: ${paletteKey}${paletteOverride ? " — forced" : ""}${charLabel})`);
  if (skip.size > 0) console.log(`  skip: ${[...skip].join(", ")}`);

  const picks = pickTokenVariants(tokenId, traits, skip, character, !isLegendaryToken(tokenId));

  if (hairOverride) {
    const hairDef = traits.slots.hair;
    const found = hairDef.variants.find(v => v.name === hairOverride);
    if (found) {
      picks.hair = { variant: found, file: found.file, buffer: null };
    } else {
      console.warn(`  [WARN] hair variant "${hairOverride}" not found`);
    }
  }
  if (picks.hair) console.log(`  [hair] ${picks.hair.variant.name}`);

  if (hoodOverride) {
    const hoodDef = traits.slots.hood;
    const found = hoodDef.variants.find(v => v.name === hoodOverride);
    if (found) {
      picks.hood = { variant: found, file: found.file, buffer: null };
    } else {
      console.warn(`  [WARN] hood variant "${hoodOverride}" not found`);
    }
  }
  if (picks.hood) console.log(`  [hood] ${picks.hood.variant.name}`);

  if (shirtOverride) {
    const shirtDef = traits.slots.shirt;
    const found = shirtDef.variants.find(v => v.name === shirtOverride);
    if (found) {
      picks.shirt = { variant: found, file: found.file, buffer: null };
      console.log(`  [shirt] ${found.name}`);
    } else {
      console.warn(`  [WARN] shirt variant "${shirtOverride}" not found`);
    }
  }

  if (!isLegendaryToken(tokenId)) {
    loadPickBuffers(picks, traits, character);
  }

  const { renderPicks, antiStackFires } = finalizeTokenTraits(tokenId, picks, traits, character);
  if (antiStackFires > 0) {
    console.log(`  [anti-none-stack] rule fired ${antiStackFires} time(s)`);
  }

  const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);

  console.log(`\n  Picks (metadata):`);
  for (const [slot, pick] of Object.entries(picks)) {
    const status = isLegendaryToken(tokenId) ? "legendary-final" : (pick.buffer ? "ok" : "MISSING FILE");
    const d = driftMap[slot] || { dx: 0, dy: 0 };
    const driftStr = (d.dx !== 0 || d.dy !== 0) ? ` offset(${d.dx},${d.dy})` : "";
    const renderName = renderPicks[slot] ? renderPicks[slot].variant.name : null;
    const renderStr = (renderName && renderName !== pick.variant.name) ? `  (rendered as ${renderName})` : "";
    console.log(`    ${slot.padEnd(10)} → ${pick.variant.name.padEnd(12)} (${pick.file})  [${status}]${driftStr}${renderStr}`);
  }

  const pixelResult = resolveTokenPixelBuffer(tokenId, traits, renderPicks, driftMap, paletteKey);
  const buf = pixelResult.buf;
  if (pixelResult.legendaryFinal) {
    console.log(`\n  [legendary-final] ${pixelResult.sourcePath}`);
    console.log(`  [legendary-final] colors: ${formatColorUsage(pixelResult.colorUsage)}`);
  }

  const tokensDir = path.join(SETTINGS.outputDir, "tokens");
  if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir, { recursive: true });
  const baseName = String(tokenId).padStart(4, "0");
  const pngBuf = renderPNG(buf, palette, {
    transparentIndex0: character?.name === "Zombie",
  });
  fs.writeFileSync(path.join(tokensDir, `${baseName}.png`), pngBuf);
  fs.writeFileSync(path.join(tokensDir, `${baseName}_1024.png`), upscalePNG(pngBuf, 16));
  fs.writeFileSync(path.join(tokensDir, `${baseName}.svg`), renderSVG(buf, palette));
  fs.writeFileSync(path.join(tokensDir, `${baseName}.json`), JSON.stringify(buildMetadata(tokenId, paletteKey, picks, character), null, 2));

  console.log(`\n  wrote tokens/${baseName}.{png,_1024.png,svg,json}`);
  updateMaster(tokenId, paletteKey, picks, character);
  console.log(`  updated master.json + master.csv`);
}

if (require.main === module) main();

module.exports = {
  pickCharacter,
  resolveCharacter,
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  applyAntiNoneStacking,
  finalizeTokenTraits,
  buildTraitVectorKey,
  buildNearDupComboKey,
  TraitDedupeGuard,
  ComboCapGuard,
  resolveUniqueTokenTraits,
  resetAntiNoneStackStats,
  resetDedupeRerollStats,
  resetComboCapRerollStats,
  resetGenerationStats,
  getAntiNoneStackFireTotal,
  getDedupeRerollFireTotal,
  getDedupeRerollLog,
  getComboCapRerollFireTotal,
  getComboCapRerollLog,
  COMBO_CAP_MAX,
  COMBO_CAP_REROLL_MAX,
  pickPalette,
  resolveExtractionDrawColors,
  extractToBuffer,
  isZombieAssetFile,
  isZombieComponent,
  isAgentAssetFile,
  isAgentComponent,
  compositeChromie,
  resolveTokenPixelBuffer,
  renderSVG,
  renderPNG,
  upscalePNG,
  buildMetadata,
  updateMaster,
  buildPhase3Effects,
};
