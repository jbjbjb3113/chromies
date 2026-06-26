// ============================================================================
// legendary-token-ids.js
// Pre-assigned Normie Legendary palette slots — exactly 9 tokens in the 5,150 collection.
//
// Five tokens use fixed Chromie IDs; four Normie reference IDs exceed the collection
// (or are #0) and resolve to deterministic random Chromie IDs via per-artist seeds.
// Re-run bridge-mint-data.js after any change to assignments or seeds.
// ============================================================================

const { COLLECTION_SIZE, GOLD_TOKEN_IDS } = require("./gold-token-ids");

const TIER = "Normie Legendary";

/** @type {ReadonlyArray<{ palette: string, artist: string, normieRef: number, tokenId?: number, seed?: string }>} */
const NORMIE_LEGENDARY_DEFS = Object.freeze([
  { palette: "NORMIE_SNOWFRO",     artist: "Snowfro",      normieRef: 45,   tokenId: 45,   headVariant: "Legendary_Snowfro",     headFile: "legendary/NORMIE_0045_Snowfro.png" },
  { palette: "NORMIE_ACK",         artist: "a.c.k.",       normieRef: 603,  tokenId: 603,  headVariant: "Legendary_ACK",         headFile: "legendary/NORMIE_0603_ACK.png" },
  { palette: "NORMIE_SERC",        artist: "Serc",         normieRef: 4354, tokenId: 4354, headVariant: "Legendary_Serc",        headFile: "legendary/NORMIE_4354_Serc.png" },
  { palette: "NORMIE_JACKBUTCHER", artist: "Jack Butcher", normieRef: 4698, tokenId: 4698, headVariant: "Legendary_JackButcher", headFile: "legendary/NORMIE_4698_JackButcher.png" },
  { palette: "NORMIE_TIMPERS",     artist: "Timpers",      normieRef: 5974, seed: "chromies-legendary-timpers-v1",  headVariant: "Legendary_Timpers", headFile: "legendary/NORMIE_5974_Timpers.png" },
  { palette: "NORMIE_DEEKAY",      artist: "Deekay",       normieRef: 6576, seed: "chromies-legendary-deekay-v1",   headVariant: "Legendary_Deekay",  headFile: "legendary/NORMIE_6576_Deekay.png" },
  { palette: "NORMIE_PIV",         artist: "PIV",          normieRef: 7409, seed: "chromies-legendary-piv-v1",      headVariant: "Legendary_PIV",     headFile: "legendary/NORMIE_7409_PIV.png" },
  { palette: "NORMIE_UPCOMING1",   artist: "Coming Soon",  normieRef: 9993, seed: "chromies-legendary-upcoming1-v1" },
  { palette: "NORMIE_UPCOMING2",   artist: "Coming Soon",  normieRef: 0,    seed: "chromies-legendary-upcoming2-v1" },
]);

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

function buildExcludedTokenIds() {
  const excluded = new Set(GOLD_TOKEN_IDS);
  for (const def of NORMIE_LEGENDARY_DEFS) {
    if (def.tokenId != null) excluded.add(def.tokenId);
  }
  return excluded;
}

function pickDeterministicTokenId(seed, excluded) {
  const pool = [];
  for (let tokenId = 1; tokenId <= COLLECTION_SIZE; tokenId++) {
    if (!excluded.has(tokenId)) pool.push(tokenId);
  }
  if (pool.length === 0) {
    throw new Error(`Normie Legendary assignment: no free token IDs for seed "${seed}"`);
  }
  const rng = mulberry32(seedFromStr(seed));
  return pool[Math.floor(rng() * pool.length)];
}

function buildLegendaryAssignments() {
  const excluded = buildExcludedTokenIds();
  const assignments = [];

  for (const def of NORMIE_LEGENDARY_DEFS) {
    let tokenId = def.tokenId;
    if (tokenId == null) {
      tokenId = pickDeterministicTokenId(def.seed, excluded);
      excluded.add(tokenId);
    }
    assignments.push(Object.freeze({
      palette: def.palette,
      artist: def.artist,
      normieRef: def.normieRef,
      tokenId,
      tier: TIER,
      seed: def.seed || null,
      headVariant: def.headVariant || null,
      headFile: def.headFile || null,
    }));
  }

  const ids = assignments.map((a) => a.tokenId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Normie Legendary assignment: duplicate Chromie token IDs");
  }

  return Object.freeze(assignments);
}

const LEGENDARY_ASSIGNMENTS = buildLegendaryAssignments();
const LEGENDARY_TOKEN_IDS = Object.freeze(
  LEGENDARY_ASSIGNMENTS.map((a) => a.tokenId).sort((a, b) => a - b),
);
const LEGENDARY_TOKEN_ID_SET = new Set(LEGENDARY_TOKEN_IDS);

/** @type {ReadonlyMap<number, typeof LEGENDARY_ASSIGNMENTS[number]>} */
const LEGENDARY_BY_TOKEN_ID = new Map(
  LEGENDARY_ASSIGNMENTS.map((a) => [a.tokenId, a]),
);

function isLegendaryToken(tokenId) {
  return LEGENDARY_TOKEN_ID_SET.has(Number(tokenId));
}

function getLegendaryForToken(tokenId) {
  return LEGENDARY_BY_TOKEN_ID.get(Number(tokenId)) || null;
}

function getLegendaryHeadVariantForPalette(paletteKey) {
  const def = NORMIE_LEGENDARY_DEFS.find((d) => d.palette === paletteKey);
  return def?.headVariant || null;
}

module.exports = {
  TIER,
  NORMIE_LEGENDARY_DEFS,
  LEGENDARY_ASSIGNMENTS,
  LEGENDARY_TOKEN_IDS,
  isLegendaryToken,
  getLegendaryForToken,
  getLegendaryHeadVariantForPalette,
};
