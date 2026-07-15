#!/usr/bin/env node
// scripts/rig/_batch_expression_lookup.cjs
// One sequential pass over tokens 1..5150 mirroring bridge-mint-data.js guard state.
// Emits ONLY JSON to stdout: { "<tokenId>": "<expressionVariantName|null>", ... }
// Legendary IDs omitted. Payload-dedupe console noise suppressed.

const fs = require("fs");
const path = require("path");

const ART = path.join(__dirname, "..", "..", "art-pipeline");
const { SETTINGS } = require(path.join(ART, "chromies-config"));
const {
  encodeTraits,
  packPixels,
  packTotalPixels,
  countNonZeroNibbles,
  PayloadDedupeGuard,
} = require(path.join(ART, "bridge-mint-data"));
const {
  TraitDedupeGuard,
  ComboCapGuard,
  resolveUniqueTokenTraits,
  buildPhase3Effects,
  resolveTokenPixelBuffer,
} = require(path.join(ART, "generate"));
const { isLegendaryToken } = require(path.join(ART, "legendary-token-ids"));

const PAYLOAD_DEDUPE_MAX = 8;
const COLLECTION_SIZE = 5150;

function buildOnceWithExpression(tokenId, traitsJson, dedupe, combo, rollTokenId) {
  const { character, paletteKey, picks, renderPicks } = resolveUniqueTokenTraits(
    tokenId,
    traitsJson,
    dedupe,
    {
      comboCapGuard: combo,
      loadBuffers: !isLegendaryToken(tokenId),
      rollTokenId,
    },
  );

  const expression = renderPicks.expression ? renderPicks.expression.variant.name : null;
  const { driftMap } = buildPhase3Effects(rollTokenId, picks, null, character);
  const { buf } = resolveTokenPixelBuffer(
    isLegendaryToken(tokenId) ? tokenId : rollTokenId,
    traitsJson,
    renderPicks,
    driftMap,
    paletteKey,
  );

  const pixelsPacked = packPixels(buf);
  const { bytes: traitsPacked } = encodeTraits({
    character,
    paletteKey,
    picks: renderPicks,
    warnings: [],
  });
  packTotalPixels(traitsPacked, countNonZeroNibbles(pixelsPacked));

  return {
    expression,
    pixelsHex: `0x${pixelsPacked.toString("hex")}`,
    traitsHex: `0x${traitsPacked.toString("hex")}`,
  };
}

function resolveExpressionWithPayloadDedupe(tokenId, traitsJson, dedupe, combo, payload) {
  let lastPartner = null;
  for (let attempt = 0; attempt <= PAYLOAD_DEDUPE_MAX; attempt++) {
    const rollTokenId = isLegendaryToken(tokenId)
      ? tokenId
      : attempt === 0
        ? tokenId
        : `${tokenId}:payloadDedupe:${attempt}`;

    const built = buildOnceWithExpression(tokenId, traitsJson, dedupe, combo, rollTokenId);

    if (!payload) return built.expression;

    const fullKey = `${built.pixelsHex}|${built.traitsHex}`.toLowerCase();
    const pixelKey = built.pixelsHex.toLowerCase();
    const fullPartner = payload.full.get(fullKey);
    const pixelPartner = payload.pixels.get(pixelKey);

    if (!fullPartner && !pixelPartner) {
      payload.full.set(fullKey, tokenId);
      payload.pixels.set(pixelKey, tokenId);
      return built.expression;
    }

    lastPartner = fullPartner || pixelPartner;
    if (attempt === PAYLOAD_DEDUPE_MAX) {
      throw new Error(`Payload dedupe exhausted for token #${tokenId} (collides with #${lastPartner})`);
    }
  }
  throw new Error(`Payload dedupe failed for token #${tokenId}`);
}

function main() {
  const traitsJson = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const dedupe = new TraitDedupeGuard();
  const combo = new ComboCapGuard();
  const payload = new PayloadDedupeGuard();
  const out = {};

  const origLog = console.log;
  console.log = () => {};

  try {
    for (let tokenId = 1; tokenId <= COLLECTION_SIZE; tokenId++) {
      if (isLegendaryToken(tokenId)) continue;
      out[String(tokenId)] = resolveExpressionWithPayloadDedupe(
        tokenId,
        traitsJson,
        dedupe,
        combo,
        payload,
      );
    }
  } finally {
    console.log = origLog;
  }

  process.stdout.write(JSON.stringify(out));
}

main();
