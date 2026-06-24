// ============================================================================
// gold-token-ids.js
// Pre-assigned GOLD palette slots — exactly 11 tokens in the 5,150 collection.
//
// Assignment is deterministic (ASSIGNMENT_SEED) and proportional to character
// weights. Re-run bridge-mint-data.js after any change to quotas or seed.
// ============================================================================

const { CHARACTERS } = require("./chromies-config");
const { characterKey } = require("./on-chain-character-bytes");

const COLLECTION_SIZE = 5150;
const GOLD_COUNT = 11;
const ASSIGNMENT_SEED = "chromies-gold-palette-v1";

/** Target distribution: ~4 HeroA Male, ~3 Female, ~2 Chubby, ~1 Zombie, ~1 other. */
const GOLD_QUOTAS = Object.freeze({
  HeroA_Male: 4,
  HeroA_Female: 3,
  Chubby_Male: 2,
  Zombie: 1,
});

const OTHER_CHARACTER_KEYS = Object.freeze([
  "Agent",
  "Alien",
  "SideProfile_Male",
  "SideProfile_Female",
]);
const OTHER_QUOTA = 1;

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

function pickCharacterForToken(tokenId) {
  const rng = mulberry32(seedFromStr(`${tokenId}:character`));
  const total = CHARACTERS.reduce((s, c) => s + (c.weight || 0), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const c of CHARACTERS) {
    r -= c.weight || 0;
    if (r < 0) return c;
  }
  return CHARACTERS[CHARACTERS.length - 1];
}

function shufflePick(rng, arr, count) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function buildGoldTokenIds() {
  const byCharacter = {};
  for (let tokenId = 1; tokenId <= COLLECTION_SIZE; tokenId++) {
    const character = pickCharacterForToken(tokenId);
    const key = characterKey(character);
    if (!byCharacter[key]) byCharacter[key] = [];
    byCharacter[key].push(tokenId);
  }

  const rng = mulberry32(seedFromStr(ASSIGNMENT_SEED));
  const selected = [];

  for (const [key, quota] of Object.entries(GOLD_QUOTAS)) {
    const pool = byCharacter[key] || [];
    if (pool.length < quota) {
      throw new Error(`GOLD assignment: need ${quota} ${key} tokens, pool has ${pool.length}`);
    }
    selected.push(...shufflePick(rng, pool, quota));
  }

  const otherPool = OTHER_CHARACTER_KEYS.flatMap((key) => byCharacter[key] || []);
  if (otherPool.length < OTHER_QUOTA) {
    throw new Error(`GOLD assignment: need ${OTHER_QUOTA} other tokens, pool has ${otherPool.length}`);
  }
  selected.push(...shufflePick(rng, otherPool, OTHER_QUOTA));

  if (selected.length !== GOLD_COUNT) {
    throw new Error(`GOLD assignment: expected ${GOLD_COUNT} tokens, got ${selected.length}`);
  }

  return Object.freeze([...selected].sort((a, b) => a - b));
}

const GOLD_TOKEN_IDS = buildGoldTokenIds();
const GOLD_TOKEN_ID_SET = new Set(GOLD_TOKEN_IDS);

function isGoldToken(tokenId) {
  return GOLD_TOKEN_ID_SET.has(Number(tokenId));
}

module.exports = {
  COLLECTION_SIZE,
  GOLD_COUNT,
  ASSIGNMENT_SEED,
  GOLD_QUOTAS,
  OTHER_CHARACTER_KEYS,
  OTHER_QUOTA,
  GOLD_TOKEN_IDS,
  isGoldToken,
};
