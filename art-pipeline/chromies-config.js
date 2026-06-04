// ============================================================================
// chromies-config.js
// System config: role slots, palette families, settings, Phase 3, mutation.
// ============================================================================

const ROLES = [
  "background",         // 0
  "mask_dark",          // 1
  "mask_mid",           // 2
  "highlight",          // 3
  "skin_shadow_deep",   // 4
  "skin_shadow",        // 5
  "skin_mid",           // 6
  "skin_light",         // 7
  "skin_highlight",     // 8
  "hood",               // 9
  "eye_socket",         // 10
  "eye_glow",           // 11
  "eye_signal",         // 12
  "hair_dark",          // 13
  "hair_mid",           // 14
  "hair_bright",        // 15
];

const PALETTES = {
  SIGNAL: {
    name: "SIGNAL",
    description: "Primary. Warm skin, magenta hair.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#1c1c26", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  ACID: {
    name: "ACID",
    description: "Toxic. Vibrant green.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  CYAN: {
    name: "CYAN",
    description: "Digital. Cold.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#0e1a26", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  GHOST: {
    name: "GHOST",
    description: "Pale. Spectral.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  BLOOD: {
    name: "BLOOD",
    description: "Raw. Violent.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#180806", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  MOSS: {
    name: "MOSS",
    description: "Organic. Decayed.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#1c2618", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  ALIEN: {
    name: "ALIEN",
    description: "Olive khaki. Alien skin. Locked to Alien character.",
    colors: [
      "#e1e5e0", "#080704", "#1d1a05", "#c8c39b",
      "#2c280f", "#5e593d", "#877f51", "#9e9662",
      "#b8b17e", "#211e0c", "#131412", "#55523b",
      "#fdfbfb", "#383525", "#5d5840", "#b2ac78",
    ],
  },
};

const SETTINGS = {
  grid: 64,
  componentsDir: "./components",
  outputDir: "./output",
  traitsFile: "./traits.json",
  bgKnockoutThreshold: 20,
};

// PHASE 3 — Layer transforms (zeroed out for now; tunable later)
const PHASE3 = {
  enabled: true,
  driftTiers: [
    { name: "Pristine",  maxDrift: 0, strayMin: 0, strayMax: 0, weight: 8  },
    { name: "Standard",  maxDrift: 0, strayMin: 0, strayMax: 0, weight: 60 },
    { name: "Drifted",   maxDrift: 0, strayMin: 0, strayMax: 0, weight: 25 },
    { name: "OffKilter", maxDrift: 0, strayMin: 0, strayMax: 0, weight: 7  },
  ],
  driftableSlots: ["hair", "earrings", "tattoo", "beard", "mustache", "glasses", "shirt", "body"],
  strayPaletteSlots: [3, 12, 15],
  strayAvoidBackground: true,
  strayEdgeMargin: 4,
};

// PIXEL_MUTATION — Per-pixel palette swap within role families.
const PIXEL_MUTATION = {
  enabled: true,
  tiers: [
    { name: "Pristine",  paletteSwap: 0.00, edgeErode: 0.00, edgeDilate: 0.00, weight: 8  },
    { name: "Standard",  paletteSwap: 0.08, edgeErode: 0.08, edgeDilate: 0.08, weight: 60 },
    { name: "Drifted",   paletteSwap: 0.15, edgeErode: 0.15, edgeDilate: 0.15, weight: 25 },
    { name: "OffKilter", paletteSwap: 0.25, edgeErode: 0.25, edgeDilate: 0.25, weight: 7  },
  ],
  mutableSlots: ["hair"],
  paletteFamilies: {
    "hair": [13, 14, 15],   // hair_dark, hair_mid, hair_bright
  },
};

// CHARACTERS — Top-level roll before any slot picks.
// weight: relative rarity (mirrors Normies mint distribution at ~10k supply).
// palettePool: which palettes this character can roll. null = all palettes.
// forcedSlots: slot overrides applied after variant roll (cannot be overridden).
// slotWeightOverrides: per-slot variant weight multipliers (0 = never, <1 = rarer, >1 = more common).
// slotVariantPool: per-slot whitelist — only named variants are eligible for that character.
// slotDriftOverrides: per-slot fixed drift applied regardless of drift tier. { slot: { dx, dy } }
const CHARACTERS = [
  {
    name: "HeroA",
    gender: "Male",
    weight: 538,
    palettePool: null,
    forcedSlots: {
      head: "HeroA",
      neck: "HeroA",
    },
    slotWeightOverrides: {},
    slotVariantPool: {
      necklace: ["Male_Chain", "None"],
    },
  },
  {
    name: "HeroA",
    gender: "Female",
    weight: 441,
    palettePool: null,
    forcedSlots: {
      head: "HeroA_Female",
      neck: "HeroA_Female",
      body: "Female",
    },
    slotWeightOverrides: {
      // Beard and mustache are rare but not zero — bearded lady is a valid rare
      beard:    { Full: 0.1 },
      mustache: { Thick: 0.1 },
    },
    slotVariantPool: {
      hair: ["FadeRight", "Afro", "Dreads", "Surfer", "Pompadour", "None"],
      necklace: ["Female_Chain", "None"],
    },
  },
  {
    name: "Alien",
    gender: "Non-Binary",
    weight: 6,
    palettePool: ["ALIEN"],
    forcedSlots: {
      head: "Alien",
      neck: "Alien",
      body: "Alien",
      eyes: "Alien",
      hair: "None",
      beard: "None",
      mustache: "None",
      hood: "None",
      glasses: "None",
    },
    slotWeightOverrides: {},
    // Tattoo drifts up 4px on alien — sits higher on the alien skull/neck area
    slotDriftOverrides: {
      tattoo: { dx: 0, dy: -4 },
    },
  },
  {
    name: "Cat",
    gender: null,
    weight: 11,
    palettePool: null,
    forcedSlots: {
      head: "Cat",
      neck: "Cat",
    },
    slotWeightOverrides: {},
  },
  {
    name: "Agent",
    gender: null,
    weight: 4,
    palettePool: null,
    forcedSlots: {
      head: "Agent",
      neck: "Agent",
    },
    slotWeightOverrides: {},
  },
];

module.exports = { ROLES, PALETTES, SETTINGS, PHASE3, PIXEL_MUTATION, CHARACTERS };
