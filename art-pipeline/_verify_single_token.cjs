// Diagnostic/build helper for scripts/anim/_expression_swap_source.py and
// scripts/verify/pipeline-parity-check.py — NOT part of the production pipeline.
// Calls the REAL production code path (bridge-mint-data.js's buildMintRecord(),
// which is what regen-5150-excl-legendary.js and the canonical mint-data batch write
// both use) for exactly one token, in ISOLATION (fresh, empty guards -- no cross-token
// dedupe/combo-cap state), so it can be compared against chromies-engine's Python
// regeneration of the same token (which is ALSO always isolated -- see
// engine/batch_guards.py::resolve_unique_traits, `if batch is None: ... skip dedupe/
// comboCap entirely`) or used as ground truth for a real, verified expression swap.
//
// This is deliberately NOT a from-scratch reimplementation: buildMintRecord/
// resolveUniqueTokenTraits/resolveTokenPixelBuffer/loadPickBuffers/buildPhase3Effects
// are require()'d verbatim from the real bridge-mint-data.js/generate.js files.
// Nothing about the trait-rolling or pixel-buffer algorithm is transcribed here --
// the only new orchestration is the render_picks.expression substitution in
// --swap-expression mode below (Task 2 of "Rework Prototype onto Canonical Bytes +
// JS Compositor"), which mirrors exactly what buildMintRecordOnce already does,
// minus the one substituted slot.
//
// Why isolated guards, not the real sequential state: reproducing the *exact*
// sequential dedupeGuard/comboCapGuard state that produced mint-data.json would
// require replaying buildMintRecord for tokens 1..N-1 first (in order, with
// legendary skips) to rebuild that state -- expensive per-token, and out of scope
// for a single-token call. Isolated-guard output is still meaningful: if it matches
// mint-data.json, the token's real roll never hit a dedupe/comboCap reroll, so it's
// safe to use as ground truth for that token (e.g. for an expression swap). If
// isolated-JS *also* fails to match mint-data.json, that's strong evidence the
// token's real roll *did* hit a dedupe/comboCap reroll (batch-state gap) -- callers
// must treat that as "skip this token", never as license to guess.
//
// "expression" is included in the output even though it is NOT part of on-chain
// traitsHex (absent from TRAIT_SLOTS/on-chain-trait-bytes entirely -- confirmed by
// inspection). It's read from a dedicated, independently-fresh-guarded
// resolveUniqueTokenTraits call (loadBuffers: false -- we only need the picked
// variant NAME here, not its pixel buffer) so that reading it never perturbs the
// guard state used to compute pixelsHex/traitsHex above.
//
// "expressionNeutralVariant" / "expressionSmileVariant" (added for build-smile-
// transition.py's variant-aware matching fix): the "expression" slot is NOT one
// name per role across the whole collection -- each character family has its own
// eligible pool (art-pipeline/chromies-config.js CHARACTERS[*].slotVariantPool.
// expression, e.g. HeroA/Female -> Female_Neutral/Female_Smile/..., Chubby ->
// Chubby_Neutral/Chubby_Smile/..., Zombie/Agent -> forced None, SideProfile ->
// Smile/Smirk only [no Neutral], Alien -> falls through to the bare generic
// Neutral/Smile/Frown/None since it has no slotVariantPool.expression override at
// all). These two fields resolve, for THIS token's actual rolled character, which
// (if any) eligible variant plays the "Neutral" role and which (if any) plays the
// "Smile" role -- via the real getEligibleVariants(slot, def, character) (now
// exported from generate.js specifically for this), never by constructing a
// candidate name like `${family}_Smile` and hoping it exists. Role identification
// within that real, already-eligible (weight>0) list is a same-family-only,
// case-insensitive substring match on "neutral"/"smile" -- if zero or more than
// one eligible variant matches a role, that role is null for this character
// (ambiguous/absent, never guessed). Both are null for legendary tokens (fixed
// final-buffer image, no render_picks/character at all).
//
// Usage:
//   node _verify_single_token.cjs <tokenId>
//     -> prints {"tokenId":N,"pixelsHex":"0x...","traitsHex":"0x...","traitsDecoded":{...},
//                "character":"...","palette":"...","expression":"...",
//                "expressionNeutralVariant":"..."|null,"expressionSmileVariant":"..."|null,
//                "isLegendary":bool,"mode":"isolated"} to stdout
//   node _verify_single_token.cjs <tokenId> --sequential-through
//     -> replays buildMintRecord for tokens 1..tokenId in order (skipping legendary IDs, same
//        as regen-5150-excl-legendary.js) with ONE shared guard set, so <tokenId>'s result
//        reflects the REAL sequential dedupe/comboCap state up to that point. Slower; use when
//        the isolated call above doesn't resolve the question. ("expression" is still read via
//        an independent fresh-guard call, same as isolated mode.)
//   node _verify_single_token.cjs <tokenId> --swap-expression <Name>
//     -> re-rolls <tokenId> in isolation (fresh guards) via the real pipeline, then re-renders
//        it with ONLY its "expression" render-pick swapped to <Name> (e.g. "Smile"), through the
//        real resolveTokenPixelBuffer/compositeChromie. Every other slot (hood, shirt, palette,
//        eyes, hair, ...) is left exactly as that isolated roll produced it. Prints
//        {"tokenId":N,"pixelsHex":"0x...","traitsHex":"0x...","traitsDecoded":{...},
//         "character":"...","palette":"...","expressionOverride":"Name","isLegendary":false}.
//        Refuses (throws) for legendary tokens -- they use a fixed final-buffer image with no
//        per-slot render_picks to override.

const fs = require("fs");
const { SETTINGS } = require("./chromies-config");
const { buildMintRecord, PayloadDedupeGuard, packPixels, encodeTraits, characterKey, countNonZeroNibbles, packTotalPixels } = require("./bridge-mint-data");
const {
  TraitDedupeGuard,
  ComboCapGuard,
  resolveUniqueTokenTraits,
  resolveTokenPixelBuffer,
  buildPhase3Effects,
  loadPickBuffers,
  getEligibleVariants,
} = require("./generate");
const { isLegendaryToken } = require("./legendary-token-ids");

function loadTraitsJson() {
  return JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
}

// Resolves, for THIS character's real eligible "expression" pool, which variant (if
// any) plays the "Neutral" role and which (if any) plays the "Smile" role -- see the
// module docstring's "expressionNeutralVariant / expressionSmileVariant" section.
// Never constructs a candidate name; only matches among variants getEligibleVariants
// itself says are real and eligible (weight > 0) for this exact character.
function expressionRoleVariants(character, traitsJson) {
  const def = traitsJson.slots.expression;
  const eligible = getEligibleVariants("expression", def, character) || [];
  const findRole = (needle) => {
    const matches = eligible.filter((v) => v.name.toLowerCase().includes(needle));
    return matches.length === 1 ? matches[0].name : null; // 0 or >1 matches -- absent/ambiguous, never guessed
  };
  return { neutral: findRole("neutral"), smile: findRole("smile") };
}

// Independent, freshly-guarded read of the "expression" render-pick name plus its
// family's Neutral/Smile role variants for tokenId -- never shares guard state with
// whatever call computed pixelsHex/traitsHex, so reading this can never perturb (or
// be perturbed by) that computation.
function expressionInfo(tokenId, traitsJson) {
  if (isLegendaryToken(tokenId)) {
    return { pick: null, neutralVariant: null, smileVariant: null }; // fixed final-buffer image
  }
  const { character, renderPicks } = resolveUniqueTokenTraits(
    tokenId,
    traitsJson,
    new TraitDedupeGuard(),
    { comboCapGuard: new ComboCapGuard(), loadBuffers: false, rollTokenId: tokenId },
  );
  const pick = renderPicks.expression ? renderPicks.expression.variant.name : null;
  const roles = expressionRoleVariants(character, traitsJson);
  return { pick, neutralVariant: roles.neutral, smileVariant: roles.smile };
}

// Task 2's expression swap: re-derive this exact token's real isolated roll, then
// substitute ONLY the "expression" render-pick before re-rendering through the real
// pixel-buffer resolver. Mirrors bridge-mint-data.js::buildMintRecordOnce's body
// verbatim except for that one substitution.
function buildRecordWithExpressionOverride(tokenId, traitsJson, expressionName) {
  if (isLegendaryToken(tokenId)) {
    throw new Error(`token ${tokenId} is legendary -- fixed final-buffer image, no expression render-pick to override`);
  }

  const rollId = tokenId; // isolated call -- see module docstring
  const { character, paletteKey, picks, renderPicks } = resolveUniqueTokenTraits(
    tokenId,
    traitsJson,
    new TraitDedupeGuard(),
    { comboCapGuard: new ComboCapGuard(), loadBuffers: true, rollTokenId: rollId },
  );

  const exprSlotDef = traitsJson.slots.expression;
  if (!exprSlotDef) throw new Error(`traits.json has no "expression" slot`);
  const exprVariant = exprSlotDef.variants.find((v) => v.name === expressionName);
  if (!exprVariant) {
    throw new Error(`expression variant ${JSON.stringify(expressionName)} not found in traits.json's "expression" slot`);
  }

  // Fresh pick object -- never mutate the original picks/renderPicks entries in place
  // beyond this one key, and load ONLY this slot's buffer via the real loadPickBuffers.
  renderPicks.expression = { variant: exprVariant, file: exprVariant.file, buffer: null };
  loadPickBuffers({ expression: renderPicks.expression }, traitsJson, character);

  const { driftMap } = buildPhase3Effects(rollId, picks, null, character);
  const { buf } = resolveTokenPixelBuffer(rollId, traitsJson, renderPicks, driftMap, paletteKey);

  const pixelsPacked = packPixels(buf);
  const { bytes: traitsPacked, decoded } = encodeTraits({
    character,
    paletteKey,
    picks: renderPicks,
    warnings: [],
  });
  packTotalPixels(traitsPacked, countNonZeroNibbles(pixelsPacked));

  return {
    tokenId,
    pixelsHex: `0x${pixelsPacked.toString("hex")}`,
    traitsHex: `0x${traitsPacked.toString("hex")}`,
    character: characterKey(character),
    palette: paletteKey,
    traitsDecoded: decoded,
    expressionOverride: expressionName,
    isLegendary: false,
  };
}

function main() {
  const tokenId = parseInt(process.argv[2], 10);
  const sequential = process.argv.includes("--sequential-through");
  const swapFlagIdx = process.argv.indexOf("--swap-expression");
  const swapExpression = swapFlagIdx !== -1 ? process.argv[swapFlagIdx + 1] : null;

  if (!Number.isInteger(tokenId) || tokenId < 1) {
    throw new Error("usage: node _verify_single_token.cjs <tokenId> [--sequential-through | --swap-expression <Name>]");
  }
  if (swapFlagIdx !== -1 && !swapExpression) {
    throw new Error("--swap-expression requires a variant name argument");
  }

  const traitsJson = loadTraitsJson();

  if (swapExpression) {
    const result = buildRecordWithExpressionOverride(tokenId, traitsJson, swapExpression);
    process.stdout.write(JSON.stringify(result));
    return;
  }

  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();
  const payloadGuard = new PayloadDedupeGuard();

  let record;
  if (sequential) {
    for (let id = 1; id <= tokenId; id++) {
      if (isLegendaryToken(id)) continue;
      record = buildMintRecord(id, traitsJson, [], dedupeGuard, comboCapGuard, payloadGuard);
    }
  } else {
    // Fresh guards scoped to this single call -- see module docstring above.
    record = buildMintRecord(tokenId, traitsJson, [], dedupeGuard, comboCapGuard, payloadGuard);
  }

  const exprInfo = expressionInfo(tokenId, traitsJson);
  process.stdout.write(JSON.stringify({
    tokenId: record.tokenId,
    pixelsHex: record.pixelsHex,
    traitsHex: record.traitsHex,
    traitsDecoded: record.traitsDecoded,
    character: record.character,
    palette: record.palette,
    expression: exprInfo.pick,
    expressionNeutralVariant: exprInfo.neutralVariant,
    expressionSmileVariant: exprInfo.smileVariant,
    payloadDedupeAttempt: record.payloadDedupeAttempt,
    isLegendary: isLegendaryToken(tokenId),
    mode: sequential ? "sequential-through" : "isolated",
  }));
}

main();
