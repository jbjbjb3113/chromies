// ============================================================================
// chromies-config.js
// System config: role slots, palette families, settings, characters.
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
  AGENT: {
    name: "AGENT",
    description: "Monochrome agent skin. Locked to Agent character.",
    colors: [
      "#e3e5e4", // 0  background
      "#0a0a0a", // 1  mask_dark
      "#191919", // 2  mask_mid
      "#f5f5f5", // 3  highlight
      "#2d2d2d", // 4  skin_shadow_deep
      "#505050", // 5  skin_shadow
      "#737373", // 6  skin_mid
      "#969696", // 7  skin_light
      "#b9b9b9", // 8  skin_highlight
      "#1e1e1e", // 9  hood/shirt
      "#0f0f0f", // 10 eye_socket
      "#5a5a5a", // 11 eye_glow
      "#c8c8c8", // 12 eye_signal
      "#141414", // 13 hair_dark
      "#464646", // 14 hair_mid
      "#828282", // 15 hair_bright
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
  NORMIE_DOPEMIND: {
    name: "NORMIE_DOPEMIND",
    description: "Normie Legendary — DOPEMIND (Normie #9993). Off-black / off-white ramp anchored on #48494b.",
    colors: [
      "#e3e5e4", // 0  background (Normie #9993 light grey)
      "#141414", // 1  mask_dark
      "#242424", // 2  mask_mid
      "#f5f5f5", // 3  highlight (off-white)
      "#2a2b2c", // 4  skin_shadow_deep
      "#363739", // 5  skin_shadow
      "#48494b", // 6  skin_mid (Normie #9993 pixel tone)
      "#5c5d5f", // 7  skin_light
      "#707173", // 8  skin_highlight
      "#48494b", // 9  hood/shirt
      "#0a0a0a", // 10 eye_socket
      "#48494b", // 11 eye_glow
      "#d8d9d8", // 12 eye_signal
      "#2a2b2c", // 13 hair_dark
      "#48494b", // 14 hair_mid
      "#8a8b8d", // 15 hair_bright
    ],
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

// PHASE3 — Retired drift/mutation tiers; kept for slotDriftOverrides helper only.
const PHASE3 = { enabled: false };

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
      glasses: {
        // Variety pass: None ~42%, dark-lens ~35%, clear/light ~23% (was traits.json Shades/Neo/VR/None only)
        Shades: 6,
        Neo: 6,
        VR: 6,
        DFrameFilled: 6,
        "3DGlasses": 6,
        DFrame: 16,
        PiratePatch: 5,
        None: 48,
      },
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
      hood: {
        Classic: 20,
        Male_Hooded: 0.6,
        None: 79.4,
      },
      hat: {
        // Bandana rung only — clean art passed preflight this wave. Baseball/Bucket
        // stay out of this pool (still failing palette-role preflight); Cowboy/Beanie
        // undelivered. Ruled ladder weight: 1.2% of eligible-archetype pool.
        Male_Bandana: 1.2,
        None: 98.8,
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
        // Variety pass: None ~42%, dark-lens ~35%, clear/light ~23% (was None 30, others 10)
        Chubby_3DGlasses: 6,
        Chubby_DFrameFilled: 6,
        Chubby_Shades: 6,
        Chubby_VR: 6,
        Chubby_NEO: 6,
        Chubby_DFrame: 16,
        Chubby_PiratePatch: 5,
        None: 48,
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
      hat: {
        // Bandana rung only — see HeroA Male comment. Ruled ladder weight: 1.2%.
        Chubby_Bandana: 1.2,
        None: 98.8,
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
        Female_Afro: 11,
        Female_Dreads: 11,
        Female_FadeRight: 11,
        Female_FlatTop: 11,
        Female_Mohawk: 11,
        Female_MrT: 11,
        Female_Pompadour: 11,
        Female_Surfer: 11,
        None: 12,
        Female_TheAvatar: 0.45, // 0.45 / 100.45 pool ≈ 0.45% (~4–5 per 1000 hair rolls)
      },
      glasses: {
        // Variety pass: None ~42%, dark-lens ~35%, clear/light ~23% (was None 30, others 10)
        Female_3DGlasses: 6,
        Female_DFrameFilled: 6,
        Female_Shades: 6,
        Female_VR: 6,
        Female_Neo: 6,
        Female_DFrame: 16,
        Female_PiratePatch: 5,
        None: 48,
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
        Female_Classic: 7.5,  // ~7.5% roll rate — matches HeroA_Male Classic (~20/100 traits.json default → ~7.5% of collection)
        Female_Hooded: 0.6,
        Female_None: 91.9,
      },
      hat: {
        // Bandana rung only — see HeroA Male comment. Ruled ladder weight: 1.2%.
        Female_Bandana: 1.2,
        None: 98.8,
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
      hat: "None",
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
      hat: "None",
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
      hat: "None",
    },
    slotWeightOverrides: {},
    slotVariantPool: {
      hair: ["None"],
      beard: ["None"],
      mustache: ["None"],
      eyes: ["None"],
      expression: ["None"],
      tattoo: ["None"],
      bodytattoo: {
        None: 55,
        Normies: 15,
        AkuHeart: 15,
        Pyramid: 15,
      },
      earrings: ["None"],
      shirt: ["None"],
      accessory: {
        Zombie_Cigarette: 15,
        None: 85,
      },
      glasses: {
        Zombie_Shades: 10,
        Zombie_VR: 10,
        Zombie_DFrameFilled: 10,
        Zombie_Neo: 10,
        Zombie_PiratePatch: 10,
        None: 50,
      },
      necklace: {
        Zombie_Normies: 15,
        Zombie_HeyKoolAid: 15,
        Zombie_Chromies: 15,
        None: 55,
      },
      hood: {
        Zombie_Classic: 4,
        Zombie_Hooded: 4,
        Zombie_Hoodie: 4,
        None: 88,
      },
    },
  },
  {
    name: "Agent",
    gender: null,
    weight: 6,
    palettePool: ["AGENT"],
    forcedSlots: {
      head: "Agent",
      neck: "Agent",
      body: "Agent",
      eyes: "None",
      hat: "None",
      expression: "None",
      tattoo: "None",
      beard: "None",
      mustache: "None",
    },
    slotWeightOverrides: {},
    slotVariantPool: {
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
      },
      glasses: {
        Shades: 25,
        Neo: 25,
        VR: 10,
        None: 40,
      },
      hood: {
        Classic: 20,
        None: 80,
      },
      shirt: {
        Crew: 40,
        Tank: 20,
        None: 40,
      },
      necklace: {
        Male_Chain: 15,
        Male_Chromies: 15,
        Male_HappyFace: 15,
        Male_Normies: 15,
        Male_Pendent: 15,
        None: 25,
      },
    },
  },
  {
    name: "SideProfile",
    gender: "Male",
    weight: 20,
    palettePool: null,
    forcedSlots: {
      head: "SP_HeroA_Male",
      body: "None",
      eyes: "None",
      bodytattoo: "None",
      hat: "None",
    },
    slotVariantPool: {
      hair: {
        SP_Mohawk_Male: 15,
        SP_Afro_Male: 20,
        SP_Dreads_Male: 10,
        SP_Surfer_Male: 13,
        SP_MrT_Male: 10,
        SP_FadeRight_Male: 7,
        SP_AZVet_Male: 7,
        None: 10,
      },
      expression: {
        SP_Smile_Male: 45,
        SP_Smirk_Male: 35,
      },
      beard: {
        SP_Full_Male: 30,
        SP_Goat_Male: 30,
        SP_Chop_Male: 30,
        None: 20,
      },
      mustache: {
        SP_Thick_Male: 30,
        None: 20,
      },
      glasses: {
        SP_DFrame_Male: 10,
        SP_DFrameFilled_Male: 10,
        SP_Shades_Male: 10,
        SP_Neo_Male: 10,
        None: 60,
      },
      necklace: {
        SP_Chain_Male: 15,
        None: 85,
      },
      earrings: {
        SP_Stud_Male: 15,
        SP_Flower_Male: 10,
        None: 75,
      },
      tattoo: {
        SP_AkuHeart_Male: 15,
        SP_Eagle_Male: 15,
        SP_Scar_Male: 15,
        SP_Tears_Male: 15,
        None: 40,
      },
      shirt: {
        SP_Crew_Male: 35,
        SP_Flannel_Male: 20,
        SP_FlannelDark_Male: 10,
        None: 35,
      },
      hood: { SP_Classic_Male: 20, None: 80 },
      accessory: {
        SP_Cigarette_Male: 15,
        None: 85,
      },
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
      hat: "None",
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
      beard: ["None"],
      mustache: ["None"],
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

module.exports = { ROLES, PALETTES, SETTINGS, PHASE3, CHARACTERS };
