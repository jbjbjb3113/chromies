import type { MirrorPalette } from "./mirror";

export type PaletteFamilyId =
  | "signal"
  | "graffiti"
  | "acid"
  | "blood"
  | "ghost"
  | "overgrown";

export type PaletteFamilyDef = {
  id: PaletteFamilyId;
  label: string;
  tagline: string;
  baseDark: string;
  midtone: string;
  highlight: string;
  accent: string;
  glow: string;
  corruption: string;
  background?: string;
  maskAccent?: string;
  /** UI chip swatches (left → right). */
  preview: [string, string, string, string];
};

/** Fixed index roles — structure unchanged; only ramp colors shift per family. */
export const PALETTE_SEMANTIC = {
  bg: 0,
  deep: 1,
  shadowA: 2,
  shadowB: 3,
  midA: 4,
  midB: 5,
  midC: 6,
  midD: 7,
  highlightA: 8,
  highlightB: 9,
  highlightC: 10,
  accentAlt: 11,
  accent: 12,
  glow: 13,
  maskAccent: 14,
  corruption: 15,
} as const;

export type PaletteSemantic = typeof PALETTE_SEMANTIC;

export const PALETTE_FAMILIES: Record<PaletteFamilyId, PaletteFamilyDef> = {
  signal: {
    id: "signal",
    label: "SIGNAL",
    tagline: "Electric memory · cyan signal · charcoal void",
    baseDark: "#0a1218",
    midtone: "#1a3a4a",
    highlight: "#5cbce0",
    accent: "#3f9bcc",
    glow: "#86d6ee",
    corruption: "#e3f6ff",
    background: "#060b10",
    maskAccent: "#2d7aad",
    preview: ["#060b10", "#1a3a4a", "#3f9bcc", "#86d6ee"],
  },
  graffiti: {
    id: "graffiti",
    label: "GRAFFITI",
    tagline: "Spray heat · concrete grit · street pigment",
    baseDark: "#14110f",
    midtone: "#4a3a32",
    highlight: "#c4b8a8",
    accent: "#ff7b2e",
    glow: "#ff5c9a",
    corruption: "#ffd28f",
    background: "#0c0a09",
    maskAccent: "#8c4a22",
    preview: ["#0c0a09", "#4a3a32", "#ff7b2e", "#ff5c9a"],
  },
  acid: {
    id: "acid",
    label: "ACID",
    tagline: "Toxic bloom · lime burn · smoke black",
    baseDark: "#0a1008",
    midtone: "#2a4018",
    highlight: "#8fd95a",
    accent: "#bff07e",
    glow: "#e4ffb0",
    corruption: "#f5ff3a",
    background: "#060906",
    maskAccent: "#4fcf9c",
    preview: ["#060906", "#2a4018", "#bff07e", "#f5ff3a"],
  },
  blood: {
    id: "blood",
    label: "BLOOD",
    tagline: "Deep pulse · obsidian · bone highlight",
    baseDark: "#120808",
    midtone: "#451d24",
    highlight: "#e8d8d0",
    accent: "#c25062",
    glow: "#e06478",
    corruption: "#ff5470",
    background: "#080404",
    maskAccent: "#7a3340",
    preview: ["#080404", "#451d24", "#c25062", "#e06478"],
  },
  ghost: {
    id: "ghost",
    label: "GHOST",
    tagline: "Lavender haze · silver signal · midnight",
    baseDark: "#100f1a",
    midtone: "#3e2a66",
    highlight: "#ddc8fb",
    accent: "#a181df",
    glow: "#c0a3f0",
    corruption: "#f6d6ec",
    background: "#0a0912",
    maskAccent: "#6a4ca6",
    preview: ["#0a0912", "#3e2a66", "#a181df", "#c0a3f0"],
  },
  overgrown: {
    id: "overgrown",
    label: "OVERGROWN",
    tagline: "Moss creep · rust decay · smoke canopy",
    baseDark: "#0a1108",
    midtone: "#2c4a20",
    highlight: "#8a9a72",
    accent: "#6db742",
    glow: "#bff07e",
    corruption: "#d99432",
    background: "#060806",
    maskAccent: "#519136",
    preview: ["#060806", "#2c4a20", "#6db742", "#d99432"],
  },
};

export const PALETTE_FAMILY_LIST: PaletteFamilyDef[] = Object.values(PALETTE_FAMILIES);

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  return `#${clampByte(r).toString(16).padStart(2, "0")}${clampByte(g).toString(16).padStart(2, "0")}${clampByte(b).toString(16).padStart(2, "0")}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const u = Math.max(0, Math.min(1, t));
  return toHex(ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u);
}

/** Build 16-index ramp for renderer from phenotype family tones. */
export function buildIndexedPaletteColors(family: PaletteFamilyDef): string[] {
  const bg = family.background ?? family.baseDark;
  return [
    bg,
    mixHex(bg, family.baseDark, 0.55),
    family.baseDark,
    mixHex(family.baseDark, family.midtone, 0.35),
    mixHex(family.baseDark, family.midtone, 0.55),
    family.midtone,
    mixHex(family.midtone, family.highlight, 0.35),
    mixHex(family.midtone, family.highlight, 0.6),
    family.highlight,
    mixHex(family.highlight, family.accent, 0.28),
    mixHex(family.highlight, family.glow, 0.38),
    mixHex(family.accent, family.glow, 0.45),
    family.accent,
    family.glow,
    family.maskAccent ?? mixHex(family.accent, family.baseDark, 0.4),
    family.corruption,
  ];
}

export function paletteFamilyToMirrorPalette(familyId: PaletteFamilyId): MirrorPalette {
  const family = PALETTE_FAMILIES[familyId] ?? PALETTE_FAMILIES.signal;
  return {
    id: PALETTE_FAMILY_LIST.findIndex((f) => f.id === family.id),
    name: family.label,
    colors: buildIndexedPaletteColors(family),
  };
}

export function resolvePaletteFamilyId(
  normieId: number,
  selected?: PaletteFamilyId | null,
): PaletteFamilyId {
  if (selected && PALETTE_FAMILIES[selected]) return selected;
  return PALETTE_FAMILY_LIST[normieId % PALETTE_FAMILY_LIST.length]!.id;
}

export function paletteFamilySeed(familyId: PaletteFamilyId, normieId: number): number {
  const ord = PALETTE_FAMILY_LIST.findIndex((f) => f.id === familyId);
  return (Math.imul(normieId, 2654435761) + (ord + 1) * 97_831) >>> 0;
}
