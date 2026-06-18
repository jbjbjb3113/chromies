// ============================================================================
// chromie-agent.js
// Natural-language Chromie iteration — Claude picks traits, pipeline renders.
//
// USAGE:
//   node chromie-agent.js "chubby guy with a hood, moss palette, angry expression"
//   ANTHROPIC_API_KEY=... node chromie-agent.js "refine prompt"  (via API/server)
// ============================================================================

const path = require("path");
const { createRequire } = require("module");

const repoRoot = path.resolve(__dirname, "..");
const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));
requireFromRoot("dotenv").config({ path: path.resolve(repoRoot, ".env") });
requireFromRoot("dotenv").config({ path: path.resolve(repoRoot, ".env.local") });

const fs = require("fs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickCharacter,
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  pickPalette,
  compositeChromie,
  renderPNG,
  upscalePNG,
  buildPhase3Effects,
  getMutationTier,
} = require("./generate");
const { overlayStrayPixels } = require("./phase3-variance");

const AGENT_DIR = path.resolve(__dirname, SETTINGS.outputDir, "agent");
const SAVED_DIR = path.join(AGENT_DIR, "saved");
const META_KEYS = new Set(["character", "gender", "palette", "rationale", "mtier", "tier"]);
const CLAUDE_MODEL = "claude-sonnet-4-6";
const FIXED_TOKEN_ID = 1;

function loadTraits() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, SETTINGS.traitsFile), "utf8"));
}

function buildCatalog(traits = loadTraits()) {
  const slots = {};
  for (const [slot, def] of Object.entries(traits.slots)) {
    slots[slot] = {
      zOrder: def.zOrder,
      variants: def.variants.map((v) => ({
        name: v.name,
        file: v.file,
        weight: v.weight ?? 0,
        group: v.group ?? null,
      })),
    };
  }

  const palettes = (traits.palettes || [])
    .filter((p) => (p.weight || 0) > 0)
    .map((p) => ({ name: p.name, weight: p.weight }));

  const characters = CHARACTERS.filter((c) => (c.weight || 0) > 0 || c.palettePool).map((c) => ({
    name: c.name,
    gender: c.gender ?? null,
    weight: c.weight ?? 0,
    palettePool: c.palettePool ?? null,
    forcedSlots: c.forcedSlots ?? {},
    slotVariantPool: c.slotVariantPool ?? null,
  }));

  return { slots, palettes, characters };
}

function buildSystemPrompt(catalog) {
  return `You are a Chromie trait composer for a 64×64 pixel-art NFT pipeline.

## Layer system
Each Chromie is composited from named slots (layers) sorted by z-order (low = behind). You pick one variant per slot from the catalog. Variant names must match exactly.

Key z-order (low → high): hood(5), shirt(6), bodytattoo(7), neck(8), body(9), head(10), necklace(12), tattoo(15), mask(20), beard(25), mustache(26), eyes(30), expression(31), earrings(32), glasses(35), hair(40).

## Characters
- HeroA (Male/Female): default human, full palette pool, all slots.
- Chubby (Male): always BODY_Chubby (torso+shirt baked in). Never shirtless. Shirt slot suppressed. No separate neck.
- Zombie: forced Zombie head+body, ZOMBIE palette only, no neck.
- Alien: forced Alien head/neck/body/eyes, ALIEN palette, no hair/beard/hood/glasses.
- SideProfile (Male/Female): side-view head; body=None; use SP_ hair/hood variants when available; default shirt SP_Crew or Crew; glasses mostly None until SP assets ready.
- Agent: forced Agent head/neck.

## Coverage rules (pipeline enforces these — avoid impossible combos)
- hood=Classic (or SP_Classic) → shirt suppressed, body often suppressed, bodytattoo suppressed.
- Chubby → shirt=None, body=Chubby always; do not suggest naked Chubby or separate Crew shirt.
- SideProfile → never naked; if hood=None and shirt=None, pipeline promotes default crew shirt.
- Tank shirt ↔ Tank body grouped (tank_female group for female tank).
- Necklace only visible when shirtless/tank and hood not Classic.
- Zombie: neck deleted at render; body forced Zombie.
- Alien: body forced Alien; skip shirtless rules.

## Palettes
Rollable palette families: SIGNAL (magenta), ACID (green), CYAN (blue), GHOST (purple), BLOOD (red), MOSS (olive) — each has base, _BLONDE, _GREY, _RED, and _SHIRT_* variants.
Character-locked: ALIEN, ZOMBIE, CAT (weight 0).

## Expression slot
Additive face overlay at z=31. Only variants in catalog exist. If user asks for an expression not in catalog, use expression=None and note in rationale.

## Output format
Return ONLY a single JSON object (no markdown, no preamble) with:
- "character": string (e.g. HeroA, Chubby, Zombie, Alien, SideProfile)
- "gender": "Male" | "Female" | null
- "palette": palette name from catalog (e.g. MOSS, SIGNAL_BLONDE)
- one key per slot you want to set (variant name string) — omit slots to leave pipeline defaults, but prefer explicit picks for described traits
- "rationale": brief string explaining choices

For refinement requests, start from previousTraits and apply the user's change; return the full updated JSON.

## Trait catalog (dynamic)
${JSON.stringify(catalog, null, 2)}`;
}

async function callClaude({ description, previousTraits, catalog }) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env or your environment.");
  }

  let userContent = description;
  if (previousTraits && Object.keys(previousTraits).length > 0) {
    userContent = `Previous trait JSON:\n${JSON.stringify(previousTraits, null, 2)}\n\nRefinement request: ${description}`;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: buildSystemPrompt(catalog),
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new Error("Claude returned no text content");

  const jsonStr = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(`Claude returned invalid JSON:\n${text.slice(0, 800)}`);
  }
}

function validateAgentTraits(raw, traits, catalog) {
  const errors = [];
  const cleaned = {};

  if (raw.character) {
    const matches = catalog.characters.filter(
      (c) => c.name.toLowerCase() === String(raw.character).toLowerCase(),
    );
    if (matches.length === 0) errors.push(`Unknown character "${raw.character}"`);
    else cleaned.character = raw.character;
  }

  if (raw.gender != null && raw.gender !== "") cleaned.gender = raw.gender;

  if (raw.palette) {
    const pal = String(raw.palette).toUpperCase();
    if (!PALETTES[pal] && !catalog.palettes.find((p) => p.name === pal)) {
      errors.push(`Unknown palette "${raw.palette}"`);
    } else {
      cleaned.palette = pal;
    }
  }

  if (raw.rationale) cleaned.rationale = String(raw.rationale);
  if (raw.mtier) cleaned.mtier = raw.mtier;
  if (raw.tier) cleaned.tier = raw.tier;

  for (const [key, value] of Object.entries(raw)) {
    if (META_KEYS.has(key)) continue;
    const slotDef = traits.slots[key];
    if (!slotDef) {
      errors.push(`Unknown slot "${key}"`);
      continue;
    }
    const variantName = String(value);
    const found = slotDef.variants.find((v) => v.name === variantName);
    if (!found) {
      const valid = slotDef.variants.map((v) => v.name).join(", ");
      errors.push(`Invalid ${key} variant "${variantName}" — valid: ${valid}`);
      continue;
    }
    cleaned[key] = variantName;
  }

  if (errors.length > 0) {
    const err = new Error(`Trait validation failed:\n  - ${errors.join("\n  - ")}`);
    err.validationErrors = errors;
    throw err;
  }

  return cleaned;
}

function resolveCharacter(meta, tokenId = FIXED_TOKEN_ID) {
  if (meta.character) {
    const name = meta.character;
    const candidates = CHARACTERS.filter((c) => c.name.toLowerCase() === name.toLowerCase());
    if (candidates.length === 0) return pickCharacter(tokenId);
    if (meta.gender) {
      const byGender = candidates.find(
        (c) => c.gender && c.gender.toLowerCase() === String(meta.gender).toLowerCase(),
      );
      if (byGender) return byGender;
    }
    return candidates[0];
  }
  return pickCharacter(tokenId);
}

function applyAgentOverrides(picks, traits, agentTraits) {
  for (const [slot, variantName] of Object.entries(agentTraits)) {
    if (META_KEYS.has(slot)) continue;
    const slotDef = traits.slots[slot];
    if (!slotDef) continue;
    const found = slotDef.variants.find((v) => v.name === variantName);
    if (found) picks[slot] = { variant: found, file: found.file, buffer: null };
  }
}

function renderFromAgentTraits(agentTraits, traits) {
  const tokenId = FIXED_TOKEN_ID;
  const character = resolveCharacter(agentTraits, tokenId);
  const paletteKey = agentTraits.palette || pickPalette(tokenId, traits, character);
  const palette = PALETTES[paletteKey];
  if (!palette?.colors) throw new Error(`Palette ${paletteKey} not defined`);

  const picks = pickTokenVariants(tokenId, traits, new Set(), character, false);
  applyAgentOverrides(picks, traits, agentTraits);

  loadPickBuffers(picks, traits, character);
  const renderPicks = applyCoverageRules(picks, traits, character);
  const mTier = getMutationTier(tokenId, agentTraits.mtier ?? null);
  const { tier, driftMap, strays } = buildPhase3Effects(
    tokenId,
    picks,
    compositeChromie(renderPicks, traits, 0, null, null),
    agentTraits.tier ?? null,
    character,
  );

  let buf = compositeChromie(renderPicks, traits, tokenId, driftMap, mTier);
  buf = overlayStrayPixels(buf, strays);
  const pngBuf = renderPNG(buf, palette, {
    transparentIndex0: character?.name === "Zombie",
  });

  if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `agent_${stamp}`;
  const outPath = path.join(AGENT_DIR, `${base}.png`);
  const outPath1024 = path.join(AGENT_DIR, `${base}_1024.png`);
  fs.writeFileSync(outPath, pngBuf);
  fs.writeFileSync(outPath1024, upscalePNG(pngBuf, 16));

  const slotSummary = {};
  for (const [slot, pick] of Object.entries(renderPicks)) {
    slotSummary[slot] = pick.variant.name;
  }

  return {
    traits: agentTraits,
    slotSummary,
    paletteKey,
    character: character
      ? `${character.name}${character.gender ? ` (${character.gender})` : ""}`
      : "unknown",
    drift: tier.name,
    mutation: mTier.name,
    imagePath: outPath,
    imageFilename: `${base}.png`,
    imageUrl: `/image/${base}.png`,
    image1024Filename: `${base}_1024.png`,
  };
}

async function runAgent({ description, previousTraits = null }) {
  const traits = loadTraits();
  const catalog = buildCatalog(traits);
  const raw = await callClaude({ description, previousTraits, catalog });
  const agentTraits = validateAgentTraits(raw, traits, catalog);
  const result = renderFromAgentTraits(agentTraits, traits);
  return result;
}

function printSummary(result) {
  console.log("\n── Chromie Agent ──");
  if (result.traits.rationale) console.log(`Rationale: ${result.traits.rationale}`);
  console.log(`Character: ${result.character}`);
  console.log(`Palette:   ${result.paletteKey}`);
  console.log(`Drift:     ${result.drift} | Mutation: ${result.mutation}`);
  console.log("\nSlots (after coverage rules):");
  for (const [slot, name] of Object.entries(result.slotSummary).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${slot.padEnd(12)} → ${name}`);
  }
  console.log(`\nOutput: ${result.imagePath}`);
  console.log(`        ${result.imagePath.replace(/\.png$/, "_1024.png")}`);
}

function saveAgentImage(filename) {
  const src = path.join(AGENT_DIR, filename);
  if (!fs.existsSync(src)) throw new Error(`Image not found: ${filename}`);
  if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });
  const dest = path.join(SAVED_DIR, filename);
  fs.copyFileSync(src, dest);
  const src1024 = src.replace(/\.png$/, "_1024.png");
  if (fs.existsSync(src1024)) {
    fs.copyFileSync(src1024, path.join(SAVED_DIR, path.basename(src1024)));
  }
  return dest;
}

async function main() {
  const description = process.argv.slice(2).join(" ").trim();
  if (!description) {
    console.error("Usage: node chromie-agent.js \"describe your chromie\"");
    process.exit(1);
  }

  try {
    const result = await runAgent({ description });
    printSummary(result);
  } catch (err) {
    console.error(`\n[agent error] ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  AGENT_DIR,
  SAVED_DIR,
  buildCatalog,
  buildSystemPrompt,
  validateAgentTraits,
  renderFromAgentTraits,
  runAgent,
  saveAgentImage,
  printSummary,
};
