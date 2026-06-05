/** Mirror of art-pipeline/chromies-config.js ROLES + PALETTES for the canvas editor. */

export const ROLES = [
  "background",
  "mask_dark",
  "mask_mid",
  "highlight",
  "skin_shadow_deep",
  "skin_shadow",
  "skin_mid",
  "skin_light",
  "skin_highlight",
  "hood",
  "eye_socket",
  "eye_glow",
  "eye_signal",
  "hair_dark",
  "hair_mid",
  "hair_bright",
];

export const PALETTES = {
  SIGNAL: {
    name: "SIGNAL",
    colors: [
      "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
      "#4c270f", "#89532a", "#b2723f", "#d18b4d",
      "#df9c5e", "#1c1c26", "#1a0a14", "#a01856",
      "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
    ],
  },
  ACID: {
    name: "ACID",
    colors: [
      "#e3e5e4", "#0a1410", "#152620", "#e8f5d8",
      "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
      "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e",
      "#a8ff2d", "#1f3a14", "#52a01e", "#9be042",
    ],
  },
  CYAN: {
    name: "CYAN",
    colors: [
      "#e3e5e4", "#0a0e14", "#152028", "#d8eef5",
      "#1a1008", "#3a2818", "#5e4028", "#7a5538",
      "#9a704a", "#0e1a26", "#08141c", "#1e6088",
      "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8",
    ],
  },
  GHOST: {
    name: "GHOST",
    colors: [
      "#e3e5e4", "#1f1a22", "#322a36", "#fafafa",
      "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
      "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a",
      "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8",
    ],
  },
  BLOOD: {
    name: "BLOOD",
    colors: [
      "#e3e5e4", "#100404", "#220808", "#f5d8d2",
      "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
      "#dc8e68", "#180806", "#0a0202", "#7a1818",
      "#ff3030", "#3a0606", "#8a1818", "#d83838",
    ],
  },
  MOSS: {
    name: "MOSS",
    colors: [
      "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8",
      "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
      "#bc8e5a", "#1c2618", "#0a1006", "#5a6820",
      "#a8b830", "#283018", "#5a6830", "#8a9848",
    ],
  },
  ALIEN: {
    name: "ALIEN",
    colors: [
      "#e1e5e0", "#080704", "#1d1a05", "#c8c39b",
      "#2c280f", "#5e593d", "#877f51", "#9e9662",
      "#b8b17e", "#211e0c", "#131412", "#55523b",
      "#fdfbfb", "#383525", "#5d5840", "#b2ac78",
    ],
  },
};

export function resolvePalette(paletteName) {
  const key = String(paletteName ?? "SIGNAL").toUpperCase();
  const p = PALETTES[key] ?? PALETTES.SIGNAL;
  return {
    name: p.name,
    colors: p.colors.map((hex) => hex.toLowerCase()),
  };
}

export function getPaletteFromMetadata(metadata) {
  const attr = metadata?.attributes?.find(
    (a) => a.trait_type?.toLowerCase() === "palette",
  );
  return resolvePalette(attr?.value ?? "SIGNAL");
}
