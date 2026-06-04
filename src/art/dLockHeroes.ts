import type { PaletteFamilyId } from "./paletteFamilies";
import type {
  ChainMaterial,
  EyeMaterial,
  HoodieMaterial,
  MaskMaterial,
} from "./dLockMaterialProfiles";

/** Hand-authored doctrine exemplars — marketing / lore / stress-test anchors. */
export type CanonicalHeroChromie = {
  key: string;
  label: string;
  normieId: number;
  paletteFamilyId: PaletteFamilyId;
  lore: string;
  emotionalSignal: string;
  hairSide: -1 | 1;
  mark: string;
  hoodStyle: "standard" | "high-crest" | "shadow";
  chainStyle: "bar" | "chunk" | "signal-lock";
  materials: {
    mask: MaskMaterial;
    hoodie: HoodieMaterial;
    chain: ChainMaterial;
    eye: EyeMaterial;
  };
};

export const CANONICAL_HERO_CHROMIES: readonly CanonicalHeroChromie[] = [
  {
    key: "serc-signal",
    label: "Serc Signal",
    normieId: 4354,
    paletteFamilyId: "signal",
    lore: "Origin signal · cold authority · lock-chain prophet",
    emotionalSignal: "Focused threat · cyan lock",
    hairSide: 1,
    mark: "Bridge Scar",
    hoodStyle: "standard",
    chainStyle: "signal-lock",
    materials: {
      mask: "signal-plate",
      hoodie: "signal-lined",
      chain: "oxidized-signal",
      eye: "signal-glow",
    },
  },
  {
    key: "crown-riot",
    label: "Crown Riot",
    normieId: 2207,
    paletteFamilyId: "graffiti",
    lore: "Spray crown · riot heat · left-heavy dominance",
    emotionalSignal: "Defiant heat · spray crown",
    hairSide: -1,
    mark: "Under-eye Slash",
    hoodStyle: "high-crest",
    chainStyle: "chunk",
    materials: {
      mask: "stitched-synthetic",
      hoodie: "washed-fabric",
      chain: "relic-chain",
      eye: "riot-ember",
    },
  },
  {
    key: "ghost-wraith",
    label: "Ghost Wraith",
    normieId: 7777,
    paletteFamilyId: "ghost",
    lore: "Silver wraith · hollow gaze · veil hood drift",
    emotionalSignal: "Detached menace · silver haze",
    hairSide: -1,
    mark: "Forehead Glyph",
    hoodStyle: "shadow",
    chainStyle: "bar",
    materials: {
      mask: "cloth-wrap",
      hoodie: "shadow-matte",
      chain: "brushed-metal",
      eye: "ghost-haze",
    },
  },
  {
    key: "null-prophet",
    label: "Null Prophet",
    normieId: 1337,
    paletteFamilyId: "blood",
    lore: "Null sermon · matte ceramic mask · prophet steel",
    emotionalSignal: "Quiet doom · null sermon",
    hairSide: 1,
    mark: "Temple Tag",
    hoodStyle: "standard",
    chainStyle: "chunk",
    materials: {
      mask: "matte-ceramic",
      hoodie: "heavy-cloth",
      chain: "dark-steel",
      eye: "dead-null",
    },
  },
  {
    key: "overgrown-king",
    label: "Overgrown King",
    normieId: 4061,
    paletteFamilyId: "overgrown",
    lore: "Moss king sweep · vented shell · rust crown mass",
    emotionalSignal: "Ancient weight · moss rust",
    hairSide: -1,
    mark: "Cheek Pixel",
    hoodStyle: "high-crest",
    chainStyle: "bar",
    materials: {
      mask: "vented-shell",
      hoodie: "faded-techwear",
      chain: "oxidized-signal",
      eye: "static-flicker",
    },
  },
] as const;

export function resolveCanonicalHero(normieId: number): CanonicalHeroChromie | null {
  return CANONICAL_HERO_CHROMIES.find((h) => h.normieId === normieId) ?? null;
}

export function resolveCanonicalHeroByKey(key: string): CanonicalHeroChromie | null {
  return CANONICAL_HERO_CHROMIES.find((h) => h.key === key) ?? null;
}
