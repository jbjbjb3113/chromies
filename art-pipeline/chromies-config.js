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
  SIGNAL_BLONDE: {
    name: "SIGNAL_BLONDE",
    description: "Primary. Warm skin. Blonde hair.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#1c1c26", "#1a0a14", "#a01856",
      "#ff2d8a", "#3d2e00", "#8c6914", "#e8b84b",
    ],
  },
  SIGNAL_GREY: {
    name: "SIGNAL_GREY",
    description: "Primary. Warm skin. Grey hair.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#1c1c26", "#1a0a14", "#a01856",
      "#ff2d8a", "#2a2a2a", "#707070", "#c0c0c0",
    ],
  },
  SIGNAL_RED: {
    name: "SIGNAL_RED",
    description: "Primary. Warm skin. Red/auburn hair.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#1c1c26", "#1a0a14", "#a01856",
      "#ff2d8a", "#3d0a00", "#8c2200", "#d94f1e",
    ],
  },
  ACID_BLONDE: {
    name: "ACID_BLONDE",
    description: "Toxic. Vibrant green skin. Blonde hair.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#3d2e00", "#8c6914", "#e8b84b",
    ],
  },
  ACID_GREY: {
    name: "ACID_GREY",
    description: "Toxic. Vibrant green skin. Grey hair.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#2a2a2a", "#707070", "#c0c0c0",
    ],
  },
  ACID_RED: {
    name: "ACID_RED",
    description: "Toxic. Vibrant green skin. Red/auburn hair.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#3d0a00", "#8c2200", "#d94f1e",
    ],
  },
  CYAN_BLONDE: {
    name: "CYAN_BLONDE",
    description: "Digital. Cold skin. Blonde hair.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#0e1a26", "#08141c", "#1e6088",
      "#2dd6ff", "#3d2e00", "#8c6914", "#e8b84b",
    ],
  },
  CYAN_GREY: {
    name: "CYAN_GREY",
    description: "Digital. Cold skin. Grey hair.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#0e1a26", "#08141c", "#1e6088",
      "#2dd6ff", "#2a2a2a", "#707070", "#c0c0c0",
    ],
  },
  CYAN_RED: {
    name: "CYAN_RED",
    description: "Digital. Cold skin. Red/auburn hair.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#0e1a26", "#08141c", "#1e6088",
      "#2dd6ff", "#3d0a00", "#8c2200", "#d94f1e",
    ],
  },
  GHOST_BLONDE: {
    name: "GHOST_BLONDE",
    description: "Pale. Spectral skin. Blonde hair.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#3d2e00", "#8c6914", "#e8b84b",
    ],
  },
  GHOST_GREY: {
    name: "GHOST_GREY",
    description: "Pale. Spectral skin. Grey hair.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2a2a", "#707070", "#c0c0c0",
    ],
  },
  GHOST_RED: {
    name: "GHOST_RED",
    description: "Pale. Spectral skin. Red/auburn hair.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#3d0a00", "#8c2200", "#d94f1e",
    ],
  },
  BLOOD_BLONDE: {
    name: "BLOOD_BLONDE",
    description: "Raw. Violent skin. Blonde hair.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#180806", "#0a0202", "#7a1818",
      "#ff3030", "#3d2e00", "#8c6914", "#e8b84b",
    ],
  },
  BLOOD_GREY: {
    name: "BLOOD_GREY",
    description: "Raw. Violent skin. Grey hair.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#180806", "#0a0202", "#7a1818",
      "#ff3030", "#2a2a2a", "#707070", "#c0c0c0",
    ],
  },
  BLOOD_RED: {
    name: "BLOOD_RED",
    description: "Raw. Violent skin. Red/auburn hair.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#180806", "#0a0202", "#7a1818",
      "#ff3030", "#3d0a00", "#8c2200", "#d94f1e",
    ],
  },
  MOSS_BLONDE: {
    name: "MOSS_BLONDE",
    description: "Organic. Decayed skin. Blonde hair.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#1c2618", "#0a1006", "#5a6820",
      "#a8b830", "#3d2e00", "#8c6914", "#e8b84b",
    ],
  },
  MOSS_GREY: {
    name: "MOSS_GREY",
    description: "Organic. Decayed skin. Grey hair.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#1c2618", "#0a1006", "#5a6820",
      "#a8b830", "#2a2a2a", "#707070", "#c0c0c0",
    ],
  },
  MOSS_RED: {
    name: "MOSS_RED",
    description: "Organic. Decayed skin. Red/auburn hair.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#1c2618", "#0a1006", "#5a6820",
      "#a8b830", "#3d0a00", "#8c2200", "#d94f1e",
    ],
  },
  SIGNAL_SHIRT_RED: {
    name: "SIGNAL_SHIRT_RED",
    description: "SIGNAL skin. Red shirt.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#79241E", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  SIGNAL_SHIRT_PURPLE: {
    name: "SIGNAL_SHIRT_PURPLE",
    description: "SIGNAL skin. Purple shirt.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#55153E", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  SIGNAL_SHIRT_ORANGE: {
    name: "SIGNAL_SHIRT_ORANGE",
    description: "SIGNAL skin. Orange shirt.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#74411D", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  SIGNAL_SHIRT_OLIVE: {
    name: "SIGNAL_SHIRT_OLIVE",
    description: "SIGNAL skin. Olive shirt.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#4C3D13", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  SIGNAL_SHIRT_GREEN: {
    name: "SIGNAL_SHIRT_GREEN",
    description: "SIGNAL skin. Green shirt.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#144311", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  SIGNAL_SHIRT_GOLD: {
    name: "SIGNAL_SHIRT_GOLD",
    description: "SIGNAL skin. Gold shirt.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#B3A92D", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  SIGNAL_SHIRT_BLUE: {
    name: "SIGNAL_SHIRT_BLUE",
    description: "SIGNAL skin. Blue shirt.",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#211A67", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  ACID_SHIRT_RED: {
    name: "ACID_SHIRT_RED",
    description: "ACID skin. Red shirt.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#6E2014", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  ACID_SHIRT_PURPLE: {
    name: "ACID_SHIRT_PURPLE",
    description: "ACID skin. Purple shirt.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#4A1554", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  ACID_SHIRT_ORANGE: {
    name: "ACID_SHIRT_ORANGE",
    description: "ACID skin. Orange shirt.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#7A4E12", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  ACID_SHIRT_OLIVE: {
    name: "ACID_SHIRT_OLIVE",
    description: "ACID skin. Olive shirt.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#4A520E", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  ACID_SHIRT_GREEN: {
    name: "ACID_SHIRT_GREEN",
    description: "ACID skin. Green shirt.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#1C5410", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  ACID_SHIRT_GOLD: {
    name: "ACID_SHIRT_GOLD",
    description: "ACID skin. Gold shirt.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#A4B81E", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  ACID_SHIRT_BLUE: {
    name: "ACID_SHIRT_BLUE",
    description: "ACID skin. Blue shirt.",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#0F4A55", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  CYAN_SHIRT_RED: {
    name: "CYAN_SHIRT_RED",
    description: "CYAN skin. Red shirt.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#6E1428", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  CYAN_SHIRT_PURPLE: {
    name: "CYAN_SHIRT_PURPLE",
    description: "CYAN skin. Purple shirt.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#3A1560", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  CYAN_SHIRT_ORANGE: {
    name: "CYAN_SHIRT_ORANGE",
    description: "CYAN skin. Orange shirt.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#7A3E1A", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  CYAN_SHIRT_OLIVE: {
    name: "CYAN_SHIRT_OLIVE",
    description: "CYAN skin. Olive shirt.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#3A4418", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  CYAN_SHIRT_GREEN: {
    name: "CYAN_SHIRT_GREEN",
    description: "CYAN skin. Green shirt.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#0E4434", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  CYAN_SHIRT_GOLD: {
    name: "CYAN_SHIRT_GOLD",
    description: "CYAN skin. Gold shirt.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#9A9428", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  CYAN_SHIRT_BLUE: {
    name: "CYAN_SHIRT_BLUE",
    description: "CYAN skin. Blue shirt.",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#16307A", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  GHOST_SHIRT_RED: {
    name: "GHOST_SHIRT_RED",
    description: "GHOST skin. Red shirt.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#5C1A2E", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  GHOST_SHIRT_PURPLE: {
    name: "GHOST_SHIRT_PURPLE",
    description: "GHOST skin. Purple shirt.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#3E1A5E", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  GHOST_SHIRT_ORANGE: {
    name: "GHOST_SHIRT_ORANGE",
    description: "GHOST skin. Orange shirt.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#6E3A20", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  GHOST_SHIRT_OLIVE: {
    name: "GHOST_SHIRT_OLIVE",
    description: "GHOST skin. Olive shirt.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#44401E", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  GHOST_SHIRT_GREEN: {
    name: "GHOST_SHIRT_GREEN",
    description: "GHOST skin. Green shirt.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#1A4028", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  GHOST_SHIRT_GOLD: {
    name: "GHOST_SHIRT_GOLD",
    description: "GHOST skin. Gold shirt.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#9A8A32", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  GHOST_SHIRT_BLUE: {
    name: "GHOST_SHIRT_BLUE",
    description: "GHOST skin. Blue shirt.",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#252050", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  BLOOD_SHIRT_RED: {
    name: "BLOOD_SHIRT_RED",
    description: "BLOOD skin. Red shirt.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#8A1A12", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  BLOOD_SHIRT_PURPLE: {
    name: "BLOOD_SHIRT_PURPLE",
    description: "BLOOD skin. Purple shirt.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#581030", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  BLOOD_SHIRT_ORANGE: {
    name: "BLOOD_SHIRT_ORANGE",
    description: "BLOOD skin. Orange shirt.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#8A3A10", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  BLOOD_SHIRT_OLIVE: {
    name: "BLOOD_SHIRT_OLIVE",
    description: "BLOOD skin. Olive shirt.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#523A0E", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  BLOOD_SHIRT_GREEN: {
    name: "BLOOD_SHIRT_GREEN",
    description: "BLOOD skin. Green shirt.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#1E440C", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  BLOOD_SHIRT_GOLD: {
    name: "BLOOD_SHIRT_GOLD",
    description: "BLOOD skin. Gold shirt.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#B8921E", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  BLOOD_SHIRT_BLUE: {
    name: "BLOOD_SHIRT_BLUE",
    description: "BLOOD skin. Blue shirt.",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#1E1450", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  MOSS_SHIRT_RED: {
    name: "MOSS_SHIRT_RED",
    description: "MOSS skin. Red shirt.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#6E2812", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  MOSS_SHIRT_PURPLE: {
    name: "MOSS_SHIRT_PURPLE",
    description: "MOSS skin. Purple shirt.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#4A1E3A", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  MOSS_SHIRT_ORANGE: {
    name: "MOSS_SHIRT_ORANGE",
    description: "MOSS skin. Orange shirt.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#7A4A16", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  MOSS_SHIRT_OLIVE: {
    name: "MOSS_SHIRT_OLIVE",
    description: "MOSS skin. Olive shirt.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#4A4A10", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  MOSS_SHIRT_GREEN: {
    name: "MOSS_SHIRT_GREEN",
    description: "MOSS skin. Green shirt.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#2A5414", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  MOSS_SHIRT_GOLD: {
    name: "MOSS_SHIRT_GOLD",
    description: "MOSS skin. Gold shirt.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#A89E28", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  MOSS_SHIRT_BLUE: {
    name: "MOSS_SHIRT_BLUE",
    description: "MOSS skin. Blue shirt.",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#14384A", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
    CAT: {
    name: "CAT",
    description: "Tabby. Natural cat fur. Locked to Cat character.",
    colors: [
      "#e3e5e4", "#0f0c08", "#1e1a12", "#e8dfc8",
      "#1a1510", "#3d3428", "#6b5e4a", "#9a8a72",
      "#c8b89a", "#2a2218", "#0a0e08", "#4a7a20",
      "#8ac830", "#1a1510", "#4a3e2e", "#7a6a52",
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
  SERC: {
    name: "SERC",
    description: "Normies tribute. Monochrome grays from Normie #4354 (#e3e5e4 / #48494b), SIGNAL slot luminances mapped onto the two-tone ramp. Special/gated — weight 0.",
    colors: [
      "#e3e5e4", "#494a4c", "#505153", "#e3e5e4",
      "#5e5f61", "#7e8081", "#959797", "#a7a9a9",
      "#b3b4b4", "#525355", "#48494b", "#666869",
      "#828384", "#4d4f50", "#6b6c6e", "#939595",
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
    { name: "Pristine",  paletteSwap: 0.00, edgeErode: 0.00, edgeDilate: 0.00, edgePasses: 0, scatter: 0.00, scatterRadius: 0, weight: 2  },
    { name: "Standard",  paletteSwap: 0.05, edgeErode: 0.03, edgeDilate: 0.03, edgePasses: 1, scatter: 0.02, scatterRadius: 2, weight: 30 },
    { name: "Drifted",   paletteSwap: 0.10, edgeErode: 0.06, edgeDilate: 0.06, edgePasses: 1, scatter: 0.05, scatterRadius: 3, weight: 50 },
    { name: "OffKilter", paletteSwap: 0.20, edgeErode: 0.10, edgeDilate: 0.08, edgePasses: 2, scatter: 0.12, scatterRadius: 5, weight: 17 },
  ],
  mutableSlots: ["hair", "head", "neck", "body"],
  paletteFamilies: {
    "hair": [13, 14, 15],   // hair_dark, hair_mid, hair_bright
    "head": [4, 5, 6, 7, 8],
    "neck": [4, 5, 6, 7, 8],
    "body": [4, 5, 6, 7, 8],
    "shirt": [9],
    "hood":  [9],
    "glasses": [1, 3],
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
      necklace: ["Male_Chain", "Male_Chromies", "Male_HappyFace", "Male_Normies", "Male_Pendent", "None"],
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
  necklace: ["Female_Chain", "Female_Ornate", "Female_Flower", "Female_UpsideDownCross", "Female_Opal", "None"],
  shirt: ["Crew", "Tank_Female", "None"],
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
    weight: 18,
    palettePool: ["CAT"],
    forcedSlots: {
      head: "Cat",
      neck: "HeroA",
      beard: "None",
      mustache: "None",
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
  {
    name: "SideProfile",
    gender: "Male",
    weight: 20,
    palettePool: null,
    forcedSlots: {
      head: "SP_HeroA",
      neck: "SP_HeroA",
      eyes: "None",        // eyes baked into SP head art
      bodytattoo: "None",  // positioned for front-facing body
    },
    slotVariantPool: {
      // Object form: weights REPLACE traits.json weights (SP_ variants are weight 0 there)
      hair: { SP_Mohawk: 15, SP_Pompadour: 15, SP_MrT: 10, SP_Afro: 25, SP_Dreads: 10, SP_Surfer: 13, SP_FadeRight: 7, None: 5 },
      beard: { SP_Full: 20, SP_Goat: 20, None: 60 },
      glasses: { SP_Shades: 25, SP_Neo: 25, None: 50 },
      mustache: ["None"],        // no SP mustache asset yet — front-view would misalign
      necklace: ["None"],        // hidden from side view
      earrings: ["None"],        // hidden from side view
      tattoo: ["None"],          // face tattoos hidden
      shirt: ["Crew", "Tank", "None"],   // existing shirts work
      hood: { SP_Classic: 20, None: 80 },
    },
    slotWeightOverrides: {},
  },
  {
    name: "SideProfile",
    gender: "Female",
    weight: 15,
    palettePool: null,
    forcedSlots: {
      head: "SP_HeroA_Female",
      neck: "SP_HeroA_Female",
      body: "Female",
      eyes: "None",        // eyes baked into SP head art
      bodytattoo: "None",  // positioned for front-facing body
    },
    slotVariantPool: {
      hair: {
        SP_Mohawk_Female: 15,
        SP_Afro_Female: 20,
        SP_Dreads_Female: 10,
        SP_Surfer_Female: 13,
        SP_Pompadour_Female: 15,
        SP_FadeRight_Female: 7,
        None: 5,
      },
      beard: ["None"],
      mustache: ["None"],
      glasses: { SP_Shades: 25, SP_Neo: 25, None: 50 },
      necklace: ["None"],
      earrings: ["None"],
      tattoo: ["None"],
      shirt: {
        SP_Crew_Female: 60,
        SP_Tank_Female: 20,
        None: 20,
      },
      hood: { SP_Classic: 20, None: 80 },
    },
    slotWeightOverrides: {},
  },
];

module.exports = { ROLES, PALETTES, SETTINGS, PHASE3, PIXEL_MUTATION, CHARACTERS };
