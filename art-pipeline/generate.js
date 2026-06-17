// ============================================================================
// generate.js
// Generate a single Chromie from a token ID. Deterministic — same token ID
// always produces the same Chromie (palette + variants + drift + mutation).
// Coverage rules: original picks kept for metadata; rendering suppressions
// applied per-token (hood=Classic suppresses shirt/body, etc).
// Character system: top-level roll gates palette pool, forced slots, weight overrides.
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { ROLES, PALETTES, SETTINGS, PHASE3, PIXEL_MUTATION, CHARACTERS } = require("./chromies-config");
const {
  pickDriftTier,
  getSlotDrift,
  getStrayPixels,
  applyDriftToBuffer,
  overlayStrayPixels,
} = require("./phase3-variance");
const {
  pickMutationTier,
  mutateLayer,
} = require("./pixel-mutation");

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

function extractToBuffer(filePath, drawColors) {
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
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
      if (a === 0 || (r <= t && g <= t && b <= t)) continue;
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

function compositeChromie(picks, traits, tokenId = 0, driftMap = null, mTier = null) {
  const layers = Object.entries(picks)
    .map(([slot, pick]) => ({
      slot,
      zOrder: traits.slots[slot].zOrder,
      buf: pick.buffer,
      mutationScale: (pick.variant && typeof pick.variant.mutationScale === "number")
        ? pick.variant.mutationScale
        : 1.0,
    }))
    .filter(l => l.buf !== null)
    .sort((a, b) => a.zOrder - b.zOrder);

  const buf = new Uint8Array(PX);
  for (const layer of layers) {
    let layerBuf = layer.buf;
    if (mTier && tokenId) {
      layerBuf = mutateLayer(layerBuf, tokenId, layer.slot, mTier, layer.mutationScale);
    }
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

function renderPNG(buf, palette) {
  const png = new PNG({ width: GRID, height: GRID });
  for (let i = 0; i < PX; i++) {
    const hex = palette.colors[buf[i]];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const off = i * 4;
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

// ============================================================================
// PALETTE PICK — respects character's palettePool if set
// ============================================================================

function pickPalette(tokenId, traits, character = null) {
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
  const rng = mulberry32(seedFromStr(`${tokenId}:palette`));
  const total = palettes.reduce((s, p) => s + (p.weight || 1), 0);
  let r = rng() * total;
  for (const p of palettes) {
    r -= (p.weight || 1);
    if (r < 0) return p.name.toUpperCase();
  }
  return palettes[palettes.length - 1].name.toUpperCase();
}

// ============================================================================
// COVERAGE RULES
// ============================================================================

function applyCoverageRules(picks, traits, character = null) {
  const out = {};
  for (const [slot, pick] of Object.entries(picks)) {
    out[slot] = { variant: pick.variant, file: pick.file, buffer: pick.buffer };
  }
  const hoodPick  = out.hood  ? out.hood.variant.name  : null;
  const shirtPick = out.shirt ? out.shirt.variant.name : null;
  const bodyPick  = out.body  ? out.body.variant.name  : null;
  const shirtSlotDef = traits.slots.shirt;
  const bodySlotDef  = traits.slots.body;

  const suppressTo = (slot, slotDef) => {
    if (!slotDef) return;
    const noneV = slotDef.variants.find(v => v.name === "None");
    if (!noneV) return;
    const filePath = path.join(SETTINGS.componentsDir, noneV.file);
    out[slot] = {
      variant: noneV,
      file: noneV.file,
      buffer: extractToBuffer(filePath, slotDef.drawColors),
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
      buffer: extractToBuffer(filePath, slotDef.drawColors),
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
      buffer: extractToBuffer(filePath, slotDef.drawColors),
    };
  };

  const pickSideProfileDefaultShirt = () => {
    const candidates = character?.gender === "Female"
      ? ["SP_Crew_Female"]
      : ["SP_Crew", "Crew"];
    for (const name of candidates) {
      const variant = shirtSlotDef.variants.find(v => v.name === name);
      if (!variant) continue;
      if (fs.existsSync(path.join(SETTINGS.componentsDir, variant.file))) return name;
    }
    return null;
  };

  const bodyTattooSlotDef = traits.slots.bodytattoo;
  const bodyVisible = () => {
    const b = out.body ? out.body.variant.name : null;
    return b === "Default" || b === "Female" || b === "Female_Tank" || b === "Alien";
  };

  // Chubby — skip all general body/shirt coverage; torso is always BODY_Chubby.png.
  if (character && character.name === "Chubby") {
    delete out.neck;
    suppressTo("shirt", shirtSlotDef);
    promoteToNamed("body", bodySlotDef, "Chubby");
    suppressTo("bodytattoo", bodyTattooSlotDef);
    const necklaceSlotDef = traits.slots.necklace;
    if (necklaceSlotDef) suppressTo("necklace", necklaceSlotDef);
    return out;
  }

  // SideProfile — body slot always None; shirt is SP crew (or rolled SP variant), never naked default.
  if (character && character.name === "SideProfile") {
    suppressTo("body", bodySlotDef);
    suppressTo("bodytattoo", bodyTattooSlotDef);
    const finalHood = out.hood ? out.hood.variant.name : null;
    const finalShirt = out.shirt ? out.shirt.variant.name : null;
    if (finalHood === "Classic" || finalHood === "SP_Classic") {
      suppressTo("shirt", shirtSlotDef);
    } else if (finalHood === "None" && finalShirt === "None") {
      const defaultShirt = pickSideProfileDefaultShirt();
      if (defaultShirt) promoteToNamed("shirt", shirtSlotDef, defaultShirt);
    }
    const necklaceSlotDef = traits.slots.necklace;
    if (necklaceSlotDef) suppressTo("necklace", necklaceSlotDef);
    return out;
  }

  if (hoodPick === "Classic") {
    suppressTo("shirt", shirtSlotDef);
    suppressTo("body",  bodySlotDef);
    suppressTo("bodytattoo", bodyTattooSlotDef);
  } else if (hoodPick === "None" && shirtPick === "None" && bodyPick !== "Tank") {
    promoteToDefault("body", bodySlotDef);
    // bodytattoo stays as rolled — body is visible
  } else if ((bodyPick === "Default" || bodyPick === "Female" || bodyPick === "Female_Tank") && (hoodPick !== "None" || (shirtPick !== "None" && shirtPick !== "Tank_Female"))) {
    suppressTo("body", bodySlotDef);
    suppressTo("bodytattoo", bodyTattooSlotDef);
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
    const necklaceVisible = (finalHood !== "Classic") &&
                            (finalShirt === "None" || finalShirt === "Tank_Female" || finalBody === "Tank" || finalBody === "Female_Tank");
    if (!necklaceVisible) {
      suppressTo("necklace", necklaceSlotDef);
    }
  }

  return out;
}

// ============================================================================
// VARIANT PICK — character-aware
// ============================================================================

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

    // Build effective weights — apply character slotWeightOverrides if present
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

    // slotVariantPool — if defined, ONLY these variant names are eligible for this slot.
    // Variants not in the pool are excluded entirely (weight set to 0).
    // Two forms:
    //   Array:  ["A", "B"]          — pool members keep their traits.json weight
    //   Object: { A: 15, B: 25 }    — pool members get the given weight, REPLACING
    //           the traits.json weight. Required for character-gated (weight 0)
    //           variants like SP_ side-profile assets.
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

    // Filter out zero-weight variants before rolling (avoids picking character-locked variants)
    const eligible = variants.filter(v => (v.weight || 0) > 0);
    if (eligible.length === 0) {
      // Fall back to None if everything filtered out
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

  // Load buffers
  if (loadBuffers) loadPickBuffers(picks, traits);
  return picks;
}

function loadPickBuffers(picks, traits) {
  for (const [slot, pick] of Object.entries(picks)) {
    const filePath = path.join(SETTINGS.componentsDir, pick.file);
    pick.buffer = extractToBuffer(filePath, traits.slots[slot].drawColors);
  }
}

// ============================================================================
// METADATA + MASTER LEDGER
// ============================================================================

const CHARACTER_TYPE_DISPLAY = {
  "HeroA": "Human",
  "Alien": "Alien",
  "Cat": "Cat",
  "Agent": "Agent",
};

function buildMetadata(tokenId, paletteKey, picks, tier, mTier, character = null) {
  const attributes = [];
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
  if (tier)  attributes.push({ trait_type: "Drift",    value: tier.name });
  if (mTier) attributes.push({ trait_type: "Mutation", value: mTier.name });
  return {
    tokenId,
    name: `Chromie #${String(tokenId).padStart(4, "0")}`,
    image: `${String(tokenId).padStart(4, "0")}.png`,
    attributes,
  };
}

function updateMaster(tokenId, paletteKey, picks, tier, mTier, character = null) {
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
  if (tier)  row.drift    = tier.name;
  if (mTier) row.mutation = mTier.name;

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
// PHASE 3 + MUTATION
// ============================================================================

function buildPhase3Effects(tokenId, picks, composedBuf, tierOverride = null, character = null) {
  let tier = pickDriftTier(tokenId);
  if (tierOverride) {
    const found = (PHASE3.driftTiers || []).find(t => t.name.toLowerCase() === tierOverride.toLowerCase());
    if (found) tier = found;
  }
  const driftMap = {};
  for (const slot of Object.keys(picks)) {
    driftMap[slot] = getSlotDrift(tokenId, slot, tier);
  }
  const strays = getStrayPixels(tokenId, composedBuf, tier);
  // Apply character-level slot drift overrides (fixed dx/dy regardless of tier)
  if (character && character.slotDriftOverrides) {
    for (const [slot, override] of Object.entries(character.slotDriftOverrides)) {
      if (picks[slot]) {
        driftMap[slot] = { dx: override.dx || 0, dy: override.dy || 0 };
      }
    }
  }

  return { tier, driftMap, strays };
}

function getMutationTier(tokenId, mtierOverride = null) {
  let mTier = pickMutationTier(tokenId);
  if (mtierOverride) {
    const found = (PIXEL_MUTATION.tiers || []).find(t => t.name.toLowerCase() === mtierOverride.toLowerCase());
    if (found) mTier = found;
  }
  return mTier;
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { tokenId: 1, palette: null, tier: null, mtier: null, skip: new Set(), character: null, gender: null, hair: null, hood: null, shirt: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--token" || a === "-t") result.tokenId = parseInt(args[++i], 10);
    else if (a === "--palette" || a === "-p") result.palette = args[++i].toUpperCase();
    else if (a === "--tier")  result.tier  = args[++i];
    else if (a === "--mtier") result.mtier = args[++i];
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
  const { tokenId, palette: paletteOverride, tier: tierOverride, mtier: mtierOverride, skip, character: characterOverride, gender: genderOverride, hair: hairOverride, hood: hoodOverride, shirt: shirtOverride } = parseArgs();
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

  const picks = pickTokenVariants(tokenId, traits, skip, character, false);

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

  loadPickBuffers(picks, traits);

  const renderPicks = applyCoverageRules(picks, traits, character);

  const mTier = getMutationTier(tokenId, mtierOverride);
  const baseBuf = compositeChromie(renderPicks, traits, 0, null, null);
  const { tier, driftMap, strays } = buildPhase3Effects(tokenId, picks, baseBuf, tierOverride, character);

  console.log(`  drift tier:    ${tier.name} (maxDrift=${tier.maxDrift}, strays=${strays.length})`);
  console.log(`  mutation tier: ${mTier.name} (paletteSwap=${(mTier.paletteSwap * 100).toFixed(0)}%)`);
  console.log(`\n  Picks (metadata):`);
  for (const [slot, pick] of Object.entries(picks)) {
    const status = pick.buffer ? "ok" : "MISSING FILE";
    const d = driftMap[slot] || { dx: 0, dy: 0 };
    const driftStr = (d.dx !== 0 || d.dy !== 0) ? ` drift(${d.dx},${d.dy})` : "";
    const scale = (pick.variant.mutationScale && pick.variant.mutationScale !== 1.0)
      ? ` ×${pick.variant.mutationScale}`
      : "";
    const renderName = renderPicks[slot] ? renderPicks[slot].variant.name : null;
    const renderStr = (renderName && renderName !== pick.variant.name) ? `  (rendered as ${renderName})` : "";
    console.log(`    ${slot.padEnd(10)} → ${pick.variant.name.padEnd(12)} (${pick.file})  [${status}]${driftStr}${scale}${renderStr}`);
  }

  let buf = compositeChromie(renderPicks, traits, tokenId, driftMap, mTier);
  buf = overlayStrayPixels(buf, strays);

  const tokensDir = path.join(SETTINGS.outputDir, "tokens");
  if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir, { recursive: true });
  const baseName = String(tokenId).padStart(4, "0");
  const pngBuf = renderPNG(buf, palette);
  fs.writeFileSync(path.join(tokensDir, `${baseName}.png`), pngBuf);
  fs.writeFileSync(path.join(tokensDir, `${baseName}_1024.png`), upscalePNG(pngBuf, 16));
  fs.writeFileSync(path.join(tokensDir, `${baseName}.svg`), renderSVG(buf, palette));
  fs.writeFileSync(path.join(tokensDir, `${baseName}.json`), JSON.stringify(buildMetadata(tokenId, paletteKey, picks, tier, mTier, character), null, 2));

  console.log(`\n  wrote tokens/${baseName}.{png,_1024.png,svg,json}`);
  updateMaster(tokenId, paletteKey, picks, tier, mTier, character);
  console.log(`  updated master.json + master.csv`);
}

if (require.main === module) main();

module.exports = {
  pickCharacter,
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  pickPalette,
  extractToBuffer,
  compositeChromie,
  renderSVG,
  renderPNG,
  upscalePNG,
  buildMetadata,
  updateMaster,
  buildPhase3Effects,
  getMutationTier,
};
