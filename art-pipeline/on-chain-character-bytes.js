// ============================================================================
// on-chain-character-bytes.js
// Single source of truth for traits[0] character encoding (uint8, 0–255).
//
// RULES:
//   - NEVER renumber or reuse a byte value once mint data exists.
//   - Add new characters at the next free integer only.
//   - Comment reserved slots for planned characters (do not assign until ready).
// ============================================================================

/** @type {Readonly<Record<string, number>>} */
const ON_CHAIN_CHARACTER_BYTES = Object.freeze({
  HeroA_Male: 0,
  HeroA_Female: 1,
  Alien: 2,
  Cat: 3,
  Agent: 4,

  SideProfile_Male: 5,
  SideProfile_Female: 6,
  Chubby_Male: 7,
  Zombie: 8,
});

/**
 * On-chain palette byte (traits[1]). NEVER renumber once mint data exists.
 * Next free slot after ZOMBIE (26): GOLD = 27.
 */
const ON_CHAIN_PALETTE_BYTES = Object.freeze({
  SIGNAL: 0,
  ACID: 1,
  CYAN: 2,
  GHOST: 3,
  BLOOD: 4,
  MOSS: 5,
  SIGNAL_BLONDE: 6,
  SIGNAL_GREY: 7,
  SIGNAL_RED: 8,
  ACID_BLONDE: 9,
  ACID_GREY: 10,
  ACID_RED: 11,
  CYAN_BLONDE: 12,
  CYAN_GREY: 13,
  CYAN_RED: 14,
  GHOST_BLONDE: 15,
  GHOST_GREY: 16,
  GHOST_RED: 17,
  BLOOD_BLONDE: 18,
  BLOOD_GREY: 19,
  BLOOD_RED: 20,
  MOSS_BLONDE: 21,
  MOSS_GREY: 22,
  MOSS_RED: 23,
  CAT: 24,
  ALIEN: 25,
  ZOMBIE: 26,
  GOLD: 27,
});

/** Character names that encode as `${name}_${gender}` when gender is Male/Female. */
const GENDER_SUFFIX_CHARACTERS = Object.freeze([
  "HeroA",
  "SideProfile",
  "Chubby",
  // "Zombie",
]);

function characterKey(character) {
  if (!character) return "HeroA_Male";
  if (GENDER_SUFFIX_CHARACTERS.includes(character.name) && character.gender) {
    return `${character.name}_${character.gender}`;
  }
  return character.name;
}

function characterByte(character, warnings = null) {
  const key = characterKey(character);
  const byte = ON_CHAIN_CHARACTER_BYTES[key];
  if (byte === undefined) {
    if (warnings) warnings.push(`Character [0]: unknown value "${key}"`);
    return 0;
  }
  return byte;
}

function paletteByte(paletteName, warnings = null) {
  const key = String(paletteName || "SIGNAL").toUpperCase();
  const byte = ON_CHAIN_PALETTE_BYTES[key];
  if (byte === undefined) {
    if (warnings) warnings.push(`Palette [1]: unknown value "${key}"`);
    return 0;
  }
  return byte;
}

/** Sparse decoder table indexed by byte value (for trait-breakdown.js). */
function buildCharacterDecoderTable() {
  const maxByte = Math.max(...Object.values(ON_CHAIN_CHARACTER_BYTES));
  const table = new Array(maxByte + 1).fill(null);
  for (const [name, byte] of Object.entries(ON_CHAIN_CHARACTER_BYTES)) {
    table[byte] = name;
  }
  return table;
}

module.exports = {
  ON_CHAIN_CHARACTER_BYTES,
  ON_CHAIN_PALETTE_BYTES,
  GENDER_SUFFIX_CHARACTERS,
  characterKey,
  characterByte,
  paletteByte,
  buildCharacterDecoderTable,
};
