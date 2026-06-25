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
  ZOMBIE: {
    name: "ZOMBIE",
    description: "Decayed flesh. Gray-green skin, blood accent. Locked to Zombie character.",
    colors: [
      "#e3e5e4", "#0e0d08", "#27261d", "#481213",
      "#403e31", "#61472f", "#535342", "#646451",
      "#76745b", "#7f7e7a", "#a0855a", "#858869",
      "#999c81", "#adb195", "#c2c4ba", "#c2c4ba",
    ],
  },
  GOLD: {
    name: "GOLD",
    description: "Ultra-rare gilded palette. Pre-assigned to exactly 11 tokens — never rolls randomly.",
    colors: [
      "#e8e0c8", // 0  background
      "#1a1400", // 1  mask_dark
      "#2d2400", // 2  mask_mid
      "#fff8e0", // 3  highlight
      "#7a5c00", // 4  skin_shadow_deep
      "#a07800", // 5  skin_shadow
      "#c49a00", // 6  skin_mid
      "#d4aa00", // 7  skin_light
      "#e8c840", // 8  skin_highlight
      "#8a6a00", // 9  hood/shirt
      "#3d2e00", // 10 eye_socket
      "#c8960a", // 11 eye_glow
      "#ffd700", // 12 eye_signal
      "#7a5800", // 13 hair_dark
      "#b08800", // 14 hair_mid
      "#e8c020", // 15 hair_bright
    ],
  },
};

/** Greyscale placeholder ramp for Normie Legendary 1/1 palettes (replace per-artist when ready). */
const NORMIE_LEGENDARY_PLACEHOLDER = [
  "#e8e8e8", // 0  background
  "#1a1a1a", // 1  mask_dark
  "#2a2a2a", // 2  mask_mid
  "#f0f0f0", // 3  highlight
  "#3a3a3a", // 4  skin_shadow_deep
  "#4a4a4a", // 5  skin_shadow
  "#6a6a6a", // 6  skin_mid
  "#7a7a7a", // 7  skin_light
  "#8a8a8a", // 8  skin_highlight
  "#5a5a5a", // 9  hood/shirt
  "#2e2e2e", // 10 eye_socket
  "#888888", // 11 eye_glow
  "#aaaaaa", // 12 eye_signal
  "#404040", // 13 hair_dark
  "#606060", // 14 hair_mid
  "#909090", // 15 hair_bright
];

Object.assign(PALETTES, {
  NORMIE_SNOWFRO: {
    name: "NORMIE_SNOWFRO",
    description: "Normie Legendary — Snowfro (Normie #45). Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_ACK: {
    name: "NORMIE_ACK",
    description: "Normie Legendary — a.c.k. (Normie #603). Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_SERC: {
    name: "NORMIE_SERC",
    description: "Normie Legendary — Serc (Normie #4354). Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_JACKBUTCHER: {
    name: "NORMIE_JACKBUTCHER",
    description: "Normie Legendary — Jack Butcher (Normie #4698). Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_TIMPERS: {
    name: "NORMIE_TIMPERS",
    description: "Normie Legendary — Timpers (Normie #5974). Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_DEEKAY: {
    name: "NORMIE_DEEKAY",
    description: "Normie Legendary — Deekay (Normie #6576). Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_PIV: {
    name: "NORMIE_PIV",
    description: "Normie Legendary — PIV (Normie #7409). Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_UPCOMING1: {
    name: "NORMIE_UPCOMING1",
    description: "Normie Legendary — Coming Soon. Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
  NORMIE_UPCOMING2: {
    name: "NORMIE_UPCOMING2",
    description: "Normie Legendary — Coming Soon. Greyscale placeholder.",
    colors: [...NORMIE_LEGENDARY_PLACEHOLDER],
  },
});

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
    { name: "Pristine",  paletteSwap: 0.00, edgeErode: 0.00, edgeDilate: 0.00, edgePasses: 0, scatter: 0.00, scatterRadius: 0, strayChance: 0.00, weight: 2  },
    { name: "Standard",  paletteSwap: 0.05, edgeErode: 0.03, edgeDilate: 0.03, edgePasses: 1, scatter: 0.02, scatterRadius: 2, strayChance: 0.00, weight: 30 },
    { name: "Drifted",   paletteSwap: 0.10, edgeErode: 0.06, edgeDilate: 0.06, edgePasses: 1, scatter: 0.05, scatterRadius: 3, strayChance: 0.00, weight: 50 },
    { name: "OffKilter", paletteSwap: 0.35, edgeErode: 0.18, edgeDilate: 0.15, edgePasses: 3, scatter: 0.12, scatterRadius: 5, strayChance: 0.12, weight: 17 },
  ],
  mutableSlots: ["hair", "head", "neck", "body", "shirt", "hood", "glasses", "necklace"],
  paletteFamilies: {
    "hair": [13, 14, 15],   // hair_dark, hair_mid, hair_bright
    "head": [4, 5, 6, 7, 8],
    "neck": [4, 5, 6, 7, 8],
    "body": [4, 5, 6, 7, 8],
    "shirt": [9],
    "hood":  [9],
    "glasses": [1, 3],
    "necklace": [1, 3],
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
    weight: 440,
    palettePool: null,
    forcedSlots: {
      head: "HeroA",
      neck: "HeroA",
    },
    slotWeightOverrides: {},
    slotVariantPool: {
      necklace: ["Male_Chain", "Male_Chromies", "Male_HappyFace", "Male_Normies", "Male_Pendent", "None"],
      hair: {
        Male_Afro: 25,
        Male_AZVet: 7,
        Male_Buns: 7,
        Male_Dreads: 10,
        Male_FadeRight: 7,
        Male_FlatTop: 10,
        Male_Mohawk: 15,
        Male_MrT: 10,
        Male_Pompadour: 15,
        Male_Surfer: 13,
        None: 5,
        Male_TheAvatar: 0.56, // 0.56 / 124.56 pool ≈ 0.45% (~4–5 per 1000 hair rolls)
      },
      eyes: {
        Male_CrossEyed: 20,
        Male_SquintLeft: 20,
        Male_SquintRight: 20,
        Male_Stoned: 20,
        Male_Straight: 20,
        Male_WideOpen: 20,
      },
      expression: {
        Male_Frown: 20,
        Male_Neutral: 20,
        Male_Pouting: 20,
        Male_Smile: 20,
        Male_Smirk: 20,
      },
      beard: {
        Male_Full: 15,
        Male_Goat: 15,
        None: 60,
      },
      mustache: {
        Male_DanPalmer: 15,
        Male_Thick: 15,
        None: 60,
      },
      tattoo: {
        Male_Dradle: 15,
        Male_Scar: 15,
        Male_Stars: 15,
        Male_Thug: 15,
        None: 50,
      },
      bodytattoo: {
        Male_AkuHeart: 15,
        Male_Normies: 15,
        None: 70,
      },
      accessory: {
        Male_Cigarette: 10,
        Male_Cigarette_Flipped: 10,
        None: 80,
      },
    },
  },
  {
    name: "Chubby",
    gender: "Male",
    weight: 136,
    palettePool: null,
    // Torso+crew shirt combined in chubby/BODY_Chubby.png; no separate neck or shirt layer
    forcedSlots: {
      head: "Chubby",
      body: "Chubby",
    },
    slotWeightOverrides: {},
    slotVariantPool: {
      hair: {
        Chubby_Afro: 10,
        Chubby_AZVet: 10,
        Chubby_Buns: 10,
        Chubby_Dreads: 10,
        Chubby_FadeRight: 10,
        Chubby_FlatTop: 10,
        Chubby_Mohawk: 10,
        Chubby_MrT: 10,
        Chubby_Pompadour: 10,
        Chubby_Surfer: 10,
        None: 10,
        Chubby_TheAvatar: 0.50, // 0.50 / 110.50 pool ≈ 0.45% (~4–5 per 1000 hair rolls; None stays 10)
      },
      glasses: {
        Chubby_3DGlasses: 10,
        Chubby_DFrame: 10,
        Chubby_DFrameFilled: 10,
        Chubby_PiratePatch: 10,
        Chubby_Shades: 10,
        Chubby_VR: 10,
        Chubby_NEO: 10,
        None: 30,
      },
      beard: {
        Chubby_Full: 15,
        Chubby_Goat: 15,
        None: 70,
      },
      mustache: {
        Chubby_DanPalmer: 15,
        Chubby_Thick: 15,
        None: 70,
      },
      eyes: {
        Chubby_CrossEyed: 20,
        Chubby_Squint_Left: 20,
        Chubby_Squint_Right: 20,
        Chubby_Squint_Straight: 20,
        Chubby_Stoned: 20,
      },
      expression: {
        Chubby_Front: 25,
        Chubby_Neutral: 25,
        Chubby_Pouting: 25,
        Chubby_Smile: 25,
      },
      tattoo: {
        Chubby_AkuHeart: 15,
        Chubby_Marks: 15,
        Chubby_Scar: 15,
        Chubby_Tears: 15,
        None: 50,
      },
      earrings: {
        Chubby_Stud: 20,
        None: 80,
      },
      necklace: {
        Chubby_Chromies: 15,
        Chubby_Normies: 15,
        Chubby_X: 15,
        None: 55,
      },
      shirt: ["None"],
      hood: {
        Chubby_Classic: 4, // 4 / 100 pool ≈ 4% roll rate (3–5% target)
        None: 96,
      },
      accessory: {
        Chubby_Cigarette: 15,
        None: 85,
      },
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
    slotWeightOverrides: {},
    slotVariantPool: {
      hair: {
        Female_Afro: 10,
        Female_Dreads: 10,
        Female_FadeRight: 10,
        Female_FlatTop: 10,
        Female_Mohawk: 10,
        Female_MrT: 10,
        Female_Pompadour: 10,
        Female_Surfer: 10,
        None: 20,
        Female_TheAvatar: 0.45, // 0.45 / 100.45 pool ≈ 0.45% (~4–5 per 1000 hair rolls; None stays 20)
      },
      glasses: {
        Female_3DGlasses: 10,
        Female_DFrame: 10,
        Female_DFrameFilled: 10,
        Female_PiratePatch: 10,
        Female_Shades: 10,
        Female_VR: 10,
        Female_Neo: 10,
        None: 30,
      },
      necklace: {
        Female_Chain: 15,
        Female_Ornate: 10,
        Female_Ornate_Alt: 10,
        Female_Flower: 10,
        Female_Opal: 10,
        Female_UpsideDownCross: 8,
        Female_Chromies: 10,
        Female_HeyKoolAid: 8,
        Female_Normies: 8,
        Female_Pendent: 8,
        None: 55,
      },
      eyes: {
        Female_CrissCrossed: 20,
        Female_LookLeft: 20,
        Female_LookRight: 20,
        Female_Stoned: 20,
        Female_Straight: 20,
      },
      expression: {
        Female_Smile: 25,
        Female_Frown: 25,
        Female_Neutral: 25,
        Female_Pouting: 25,
        Female_Smirk: 25,
      },
      shirt: {
        Crew_Female: 40,
        Tank_Female: 20,
        Flannel_Female: 20,
        None: 20,
      },
      tattoo: {
        Female_AkuHeart: 15,
        Female_Scar: 15,
        Female_Tears: 15,
        Female_Thug: 15,
        None: 50,
      },
      hood: {
        Female_Classic: 20,
        Female_Hooded: 1.6,   // 1.6 / 100 pool = 1.6% roll rate
        Female_None: 78.4,
      },
      earrings: {
        Female_Stud: 20,
        None: 80,
      },
      accessory: {
        Female_Cigarette: 15,
        None: 85,
      },
      beard: {
        Female_Full: 8,
        Female_Goat: 8,
        None: 70,
      },
      mustache: {
        Female_DanPalmer: 8,
        Female_Thick: 8,
        None: 70,
      },
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
    weight: 0, // Retired — on-chain byte 3 permanently retired; never roll again
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
    name: "Zombie",
    gender: null,
    weight: 18,
    palettePool: ["ZOMBIE"],
    forcedSlots: {
      head: "Zombie",
      body: "Zombie",
    },
    slotWeightOverrides: {},
    slotVariantPool: {
      necklace: ["Male_Chain", "Male_Chromies", "Male_HappyFace", "Male_Normies", "Male_Pendent", "None"],
    },
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
      body: "None",        // TEMP: no SP body asset yet, prevents naked default body showing on side profile
      eyes: "None",        // eyes baked into SP head art
      bodytattoo: "None",  // positioned for front-facing body
      glasses: "None",     // SP_GLASSES_* assets not ready yet
    },
    slotVariantPool: {
      // Object form: weights REPLACE traits.json weights (SP_ variants are weight 0 there)
      hair: { SP_Mohawk: 22, SP_Afro: 45, SP_MrT: 10, None: 23 },
      beard: ["None"],        // pending: SP_Full, SP_Goat
      glasses: ["None"],      // pending: SP_Shades, SP_Neo
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
      body: "None",        // TEMP: no SP body asset yet, prevents naked default body showing on side profile
      bodytattoo: "None",  // positioned for front-facing body
    },
    slotVariantPool: {
      hair: {
        SP_Mohawk_Female: 15,
        SP_Afro_Female: 20,
        SP_Dreads_Female: 10,
        SP_Surfer_Female: 13,
        SP_MrT_Female: 10,
        SP_FadeRight_Female: 7,
        SP_AZVet_Female: 7,
        None: 10,
      },
      expression: {
        SP_Smile_Female: 45,
        SP_Smirk_Female: 35,
      },
      eyes: {
        SP_SquintLeft_Female: 25,
        SP_SquintRight_Female: 25,
        SP_Straight_Female: 25,
        SP_Stoned_Female: 25,
      },
      beard: {
        SP_Full_Female: 8,
        SP_Goat_Female: 8,
        SP_Chop_Female: 8,
        None: 76,
      },
      mustache: {
        SP_Thick_Female: 8,
        None: 92,
      },
      glasses: {
        SP_DFrame_Female: 10,
        SP_DFrameFilled_Female: 10,
        SP_Shades_Female: 10,
        SP_Neo_Female: 10,
        None: 60,
      },
      necklace: {
        SP_Chain_Female: 15,
        None: 85,
      },
      earrings: {
        SP_Stud_Female: 15,
        SP_Flower_Female: 10,
        None: 75,
      },
      tattoo: {
        SP_AkuHeart_Female: 15,
        SP_Eagle_Female: 15,
        SP_Scar_Female: 15,
        SP_Tears_Female: 15,
        None: 40,
      },
      shirt: {
        SP_Crew_Female: 35,
        SP_Flannel_Female: 20,
        SP_FlannelDark_Female: 10,
        None: 35,
      },
      hood: { SP_Classic_Female: 20, None: 80 },
      accessory: {
        SP_Cigarette_Female: 15,
        None: 85,
      },
    },
    slotWeightOverrides: {},
  },
];

module.exports = { ROLES, PALETTES, SETTINGS, PHASE3, PIXEL_MUTATION, CHARACTERS };
