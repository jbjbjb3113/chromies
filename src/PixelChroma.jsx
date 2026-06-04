import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  clampDrift,
  driftFromPercent,
  driftPercent,
  getAwakeningModifiers,
  getPureChromieModifiers,
  awakeningSeed,
} from "./art/awakening.ts";
import { buildDriftChromie } from "./art/drift.ts";
import {
  CANONICAL_HERO_CHROMIES,
  D_LOCK_CANON_PATH,
  resolveCanonicalHero,
  setPureSkullTest,
} from "./art/dLockDoctrine.ts";
import { generateDLockChromie } from "./art/chromieGenerate.ts";
import {
  generateCollectionWall,
  renderWallSvg,
  setWallPreviewMode,
} from "./art/collectionWall.ts";
import { validateSpeciesCompression } from "./art/speciesCompressionQa.ts";
import {
  PALETTE_FAMILIES,
  PALETTE_FAMILY_LIST,
  PALETTE_SEMANTIC,
  paletteFamilyToMirrorPalette,
} from "./art/paletteFamilies.ts";
import {
  fetchNormiePixels,
  generateMirrorChromieFromPixels,
} from "./art/mirror.ts";

// ============================================================================
//  CHROMIES — indexed companion identity demo
//  64x64 grid · 4 bits-per-pixel · 16-color curated-ramp palettes
//
//  This file is intentionally split into two ideas:
//
//  1) FORMAT PROOF
//     index buffer -> 16-color palette -> RLE SVG rects
//     This mirrors what an on-chain renderer contract can do.
//
//  2) ART DIRECTION PROOF
//     The placeholder generator made generic faces.
//     This rewrite pushes collectible companion archetypes:
//     asymmetry, masks, slanted eyes, hair silhouettes, marks, piercings.
//
//  This remains a browser demo, not the final collection engine.
// ============================================================================

const GRID = 64;
const PX = GRID * GRID;
const BPP = 4;
const NORMIE_API = "https://api.normies.art";

const PALETTES = [
  {
    id: 0, name: "Ember",
    colors: ["#1a1014","#2d161c","#451d24","#5e2730","#7a3340","#9c4050","#c25062","#e06478",
             "#f2879a","#ffb0bd","#ffd28f","#ffac4a","#ff7b2e","#e8541d","#a83515","#5c1d0f"],
  },
  {
    id: 1, name: "Tide",
    colors: ["#08111c","#0d1f33","#13314d","#1a456b","#225d8c","#2d7aad","#3f9bcc","#5cbce0",
             "#86d6ee","#b8eefa","#d4f6e8","#8fe6c4","#4fcf9c","#1d9e75","#0f6e56","#063f33"],
  },
  {
    id: 2, name: "Dusk",
    colors: ["#0f0a1a","#1c1330","#2c1c4a","#3e2a66","#523a84","#6a4ca6","#8463c4","#a181df",
             "#c0a3f0","#ddc8fb","#f6d6ec","#e89bc9","#d4609f","#a8447a","#6f2a52","#3a1530"],
  },
  {
    id: 3, name: "Verdant",
    colors: ["#0a1108","#142010","#1f3318","#2c4a20","#3d662b","#519136","#6db742","#8fd95a",
             "#bff07e","#e4ffb0","#fff0a8","#f5c45e","#d99432","#a8651c","#6e3e12","#3a210a"],
  },
  {
    id: 4, name: "Mono+",
    colors: ["#0a0a0b","#161618","#242427","#343438","#48494b","#5f6063","#787a7d","#94969a",
             "#b1b3b7","#cfd1d4","#e3e5e4","#f2f3f2","#ff5470","#3f9bcc","#ffac4a","#6db742"],
  },
  {
    id: 5, name: "Candy",
    colors: ["#1a0f1a","#2e1730","#4a2050","#6a2c72","#8c3a92","#b14fae","#d46bc4","#ef8fd6",
             "#ffb8e6","#ffe0f4","#fff3cc","#ffd96b","#ffb03f","#ff7a5c","#e84d6b","#8c2a4a"],
  },
];

/** Canonical hero Chromies — D-Lock doctrine exemplars (see dLockHeroes.ts). */
const HERO_DEMOS = CANONICAL_HERO_CHROMIES.map((h) => ({
  label: h.label,
  tokenId: h.normieId,
  mode: "punk",
  note: h.lore,
  chromie: true,
}));

const TYPES = ["Human", "Cat", "Alien", "Droid", "Specter"];
const EXPRESSIONS = ["Neutral", "Smile", "Serious", "Smug", "Surprised", "Sleepy"];
const HEADGEAR = ["None", "Cap", "Crown", "Halo", "Antenna", "Top Hat", "Visor", "Beanie"];
const EYEWEAR = ["None", "Shades", "Round Glasses", "Visor", "Eyepatch", "VR"];

const PUNK_ARCHETYPES = ["Masked Punk", "Chrome Goth", "Drift Rat", "Graffiti Kid", "Wasteland Skater", "Signal Ghost"];
const MASKS = ["Respirator", "Bandana", "Street Mask", "Half Mask"];
const HAIR = ["Magenta Spikes", "Side Sweep", "Broken Hawk", "Chrome Dreads", "Jagged Fringe", "Static Burst"];
const MARKS = ["Under-eye Slash", "Forehead Glyph", "Cheek Pixel", "Bridge Scar", "Temple Tag"];

/** How identity is presented at mint — original reference vs chromie evolution. */
const FORM_MODES = [
  {
    id: "original",
    label: "Original Normie",
    description: "Untouched reference. Black and white. No colorization. No mutation.",
  },
  {
    id: "chromie",
    label: "Chromie Evolution",
    description: "64×64 indexed reconstruction. Curated ramps. Expanded detail.",
  },
];

function pickMaskForMode(rng, modifiers, pureChromieMode = false) {
  if (pureChromieMode) return "Face-Integrated";
  const roll = rng();
  if (modifiers.maskAggression < 0.35) {
    return roll < 0.5 ? "Half Mask" : "Bandana";
  }
  if (modifiers.maskAggression > 0.75) {
    return roll < 0.45 ? "Respirator" : roll < 0.75 ? "Street Mask" : "Bandana";
  }
  return pick(rng, MASKS);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/**
 * Future Normie trait import hook — MIRROR reads blueprint when present.
 */
function resolveNormieBlueprint(tokenId, driftLevel) {
  if (driftLevel >= 0.35) return null;
  const rng = mulberry32(tokenId * 2246822519 + 13);
  return {
    eyeSpacing: 7 + Math.floor(rng() * 2),
    headWidth: 17 + Math.floor(rng() * 2),
    headHeight: 30 + Math.floor(rng() * 2),
    centerX: 32,
    topY: 14,
    accessoryHints: [],
  };
}

function makeBuffer() {
  const buf = new Uint8Array(PX);
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    buf[y * GRID + x] = Math.max(0, Math.min(15, v));
  };
  const fillRect = (x0, y0, w, h, v) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, v);
  };
  const line = (x0, y0, x1, y1, v) => {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      set(x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const triangle = (a, b, c, v) => {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(GRID - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(GRID - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (p1, p2, p3) => (p1[0]*(p2[1]-p3[1]) + p2[0]*(p3[1]-p1[1]) + p3[0]*(p1[1]-p2[1]));
    const A = area(a, b, c);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5];
      const w1 = area(p, b, c) / A;
      const w2 = area(a, p, c) / A;
      const w3 = area(a, b, p) / A;
      if (w1 >= 0 && w2 >= 0 && w3 >= 0) set(x, y, v);
    }
  };
  return { buf, set, fillRect, line, triangle };
}

function generateClassicToken(id, driftLevel = 0.5) {
  const t = clampDrift(driftLevel);
  const modifiers = getAwakeningModifiers(t);
  const rng = mulberry32(id * 2654435761 + 12345 + awakeningSeed(t));
  const paletteId =
    modifiers.paletteMutation < 0.35
      ? id % PALETTES.length
      : Math.floor(rng() * PALETTES.length);
  const palette = PALETTES[paletteId];
  const traits = {
    Mode: "Classic Placeholder",
    SignalDrift: `${driftPercent(t)}%`,
    Type: pick(rng, TYPES),
    Expression: pick(rng, EXPRESSIONS),
    Headgear: pick(rng, HEADGEAR),
    Eyewear: pick(rng, EYEWEAR),
    Palette: palette.name,
  };

  const { buf, set, fillRect } = makeBuffer();

  const skin = 5 + Math.floor(rng() * 3);
  const skinShade = Math.min(15, skin + 3);
  const skinLight = Math.max(1, skin - 3);
  const feature = 12 + Math.floor(rng() * 3);
  const gear = 9 + Math.floor(rng() * 4);

  const blueprint = resolveNormieBlueprint(id, t);
  const cx = blueprint?.centerX ?? 32;
  const top = blueprint?.topY ?? 14;
  const hw = blueprint?.headWidth ?? 18 + Math.floor(rng() * 3 * modifiers.silhouetteVariance);
  const hh = blueprint?.headHeight ?? 30 + Math.floor(rng() * 4 * modifiers.silhouetteVariance);
  for (let y = 0; y < hh; y++) {
    const halfW = hw - (y < 4 ? (4 - y) : 0) - (y > hh - 5 ? (y - (hh - 5)) : 0);
    for (let dx = -halfW; dx <= halfW; dx++) {
      let v = skin;
      if (dx < -halfW + 3) v = skinShade;
      else if (dx > halfW - 3) v = skinLight;
      set(cx + dx, top + y, v);
    }
  }

  const eyeY = top + Math.floor(hh * 0.42);
  const eyeDx = (blueprint?.eyeSpacing ?? 7) + Math.floor(rng() * 2 * modifiers.silhouetteVariance);
  const eyeW = traits.Expression === "Surprised" ? 4 : 3;
  const eyeH = traits.Expression === "Sleepy" ? 1 : (traits.Expression === "Surprised" ? 4 : 2);
  const drawEye = (ex) => {
    fillRect(ex - eyeW, eyeY, eyeW * 2, eyeH, 1);
    set(ex - 1, eyeY, feature); set(ex, eyeY, feature);
  };
  drawEye(cx - eyeDx); drawEye(cx + eyeDx);

  const mY = top + Math.floor(hh * 0.72);
  if (traits.Expression === "Smile") for (let i = -4; i <= 4; i++) set(cx + i, mY + Math.round(Math.abs(i) * 0.4), feature);
  else if (traits.Expression === "Serious") fillRect(cx - 4, mY, 9, 1, skinShade);
  else if (traits.Expression === "Smug") for (let i = -4; i <= 2; i++) set(cx + i, mY - Math.round((i + 4) * 0.3), 1);
  else if (traits.Expression === "Surprised") fillRect(cx - 2, mY - 1, 4, 4, 1);
  else fillRect(cx - 3, mY, 7, 1, skinShade);

  const g = traits.Headgear;
  if (g === "Cap") { fillRect(cx - hw, top - 2, hw * 2, 5, gear); fillRect(cx - hw - 4, top + 2, 6, 2, gear); }
  else if (g === "Beanie") fillRect(cx - hw, top - 4, hw * 2, 7, gear);
  else if (g === "Visor") fillRect(cx - hw - 1, top - 1, hw * 2 + 2, 3, gear);

  return { buf, palette, paletteId, traits };
}

function generatePunkToken(
  id,
  driftLevel = 0.5,
  {
    pureChromieMode = false,
    lineageId = id,
    paletteFamilyId = "signal",
    pureSkullTest = false,
  } = {},
) {
  const t = clampDrift(driftLevel);
  const modifiers = pureChromieMode ? getPureChromieModifiers() : getAwakeningModifiers(t);
  const seedId = pureChromieMode ? lineageId : id;
  const rng = mulberry32(seedId * 1597334677 + 98765 + awakeningSeed(t) + (pureChromieMode ? 900001 : 0));
  const blueprint = pureChromieMode ? null : resolveNormieBlueprint(id, t);

  const palette = paletteFamilyToMirrorPalette(paletteFamilyId);
  const S = PALETTE_SEMANTIC;

  const archetypeRng = mulberry32(lineageId * 2246822519 + 17);
  const archetype = pick(pureChromieMode ? archetypeRng : rng, PUNK_ARCHETYPES);
  const hair = pick(rng, HAIR);
  const mask = pickMaskForMode(rng, modifiers, pureChromieMode);
  const mark = pick(rng, MARKS);

  const traits = {
    Mode: pureChromieMode ? "Chromie Species" : "Punk Portrait",
    SignalDrift: `${driftPercent(t)}%`,
    Archetype: archetype,
    Hair: hair,
    Mask: mask,
    Mark: mark,
    PaletteFamily: palette.name,
    ...(pureChromieMode ? { Lineage: `Normie #${lineageId}` } : {}),
  };

  const { buf, set, fillRect, line, triangle } = makeBuffer();

  if (pureChromieMode) {
    const hero = resolveCanonicalHero(lineageId);
    const familyId = hero?.paletteFamilyId ?? paletteFamilyId;
    const built = generateDLockChromie(lineageId, { paletteFamilyId: familyId, pureSkullTest });
    return {
      buf: built.buf,
      palette: built.palette,
      paletteId: built.paletteId,
      traits: { ...traits, ...built.traits },
    };
  }

  const dark = S.deep;
  const shadow = S.shadowA;
  const mid = S.midB;
  const light = S.highlightA;
  const hot = S.accent;
  const secondary = S.glow;
  const maskTone = S.maskAccent;
  const metallic = S.highlightC;

  const cx = (blueprint?.centerX ?? 32) + Math.floor((rng() * 3 - 1) * modifiers.silhouetteVariance);
  const top = (blueprint?.topY ?? 13) + Math.floor(rng() * 2 * modifiers.silhouetteVariance);
  const eyeLeftX = cx - 7;
  const eyeRightX = cx + 8;
  const hh = blueprint?.headHeight ?? 37;
  const hw = blueprint?.headWidth ?? 16 + Math.floor(rng() * 3 * modifiers.silhouetteVariance);

  // Neck / collar block.
  fillRect(cx - 10, 49, 20, 8, shadow);
  triangle([cx - 24, 63], [cx, 51], [cx + 24, 63], dark);
  fillRect(cx - 14, 55, 28, 5, 1);

  // Angular head silhouette.
  for (let y = 0; y < hh; y++) {
    const yy = top + y;
    const t = y / hh;
    let left = cx - hw + Math.round(Math.abs(0.45 - t) * 4);
    let right = cx + hw - Math.round(Math.abs(0.45 - t) * 3);

    if (y < 6) { left += 4 - Math.floor(y * 0.5); right -= 3 - Math.floor(y * 0.4); }
    if (y > 29) { left += Math.floor((y - 29) * 0.9); right -= Math.floor((y - 29) * 0.9); }

    left += Math.floor(rng() * 2 * modifiers.asymmetryStrength);
    right += y % 5 === 0 ? Math.ceil(modifiers.asymmetryStrength) : 0;

    for (let x = left; x <= right; x++) {
      let v = mid;
      if (x < left + 4) v = shadow;
      if (x > right - 4) v = light;
      if (y > 22) v = Math.min(v, mid);
      set(x, yy, v);
    }
  }

  // Hair mass: jagged, directional, asymmetric.
  const isSercSignal = id === 4354;
  const razorHawk =
    archetype === "Razor Hawk" || hair === "Razor Mohawk";
  const overgrownDrift =
    archetype === "Overgrown Drift" || hair === "Overgrown Sweep";
  const hairSide = razorHawk || isSercSignal
    ? 1
    : overgrownDrift
      ? -1
      : modifiers.hairChaos < 0.35
        ? 0
        : (rng() > 0.35 ? -1 : 1);
  const baseY = top + 4;
  const hairColor = hot;
  const hairDark = Math.max(1, hot - 3);
  const hairCapRows = Math.max(4, Math.floor(11 * (0.45 + modifiers.hairChaos * 0.55)));

  for (let y = 0; y < hairCapRows; y++) {
    const skew = hairSide * Math.floor(y * 0.9);
    fillRect(cx - hw - 2 + skew, top - 3 + y, hw * 2 + 2 - y, 1, y < 4 ? hairColor : hairDark);
  }

  // Big spikes / chunks.
  const spikeCount = Math.max(
    3,
    Math.floor(5 + modifiers.hairChaos * 6 + rng() * 4 * modifiers.hairChaos),
  );
  for (let i = 0; i < spikeCount; i++) {
    const rootX = cx - hw + Math.floor((i / (spikeCount - 1)) * hw * 2) + Math.floor(rng() * 5) - 2;
    const rootY = baseY + Math.floor(rng() * 5);
    const tipX = rootX + hairSide * Math.floor((4 + rng() * 10) * modifiers.hairChaos);
    const tipY = top - 8 + Math.floor(rng() * 9);
    triangle([rootX - 3, rootY + 4], [rootX + 4, rootY + 3], [tipX, tipY], rng() > 0.25 ? hairColor : hairDark);
  }

  // Side dreads / fringe.
  if ((hair.includes("Dreads") || hair.includes("Sweep") || rng() > 0.4) && modifiers.hairChaos > 0.3) {
    const side = hairSide;
    for (let i = 0; i < 4; i++) {
      const x = cx + side * (12 + i * 2);
      const y0 = top + 4 + i;
      line(x, y0, x + side * (3 + Math.floor(rng() * 3)), y0 + 16 + Math.floor(rng() * 8), i % 2 ? hairColor : hairDark);
      line(x + side, y0 + 1, x + side * (4 + Math.floor(rng() * 3)), y0 + 17 + Math.floor(rng() * 6), hairDark);
    }
  }

  // Mask: dark lower-face anchor. This is the identity-maker.
  const maskY = top + 24;
  if (mask === "Bandana") {
    triangle([cx - 15, maskY], [cx + 15, maskY], [cx, maskY + 17], dark);
    fillRect(cx - 12, maskY - 2, 25, 5, 1);
  } else if (mask === "Respirator") {
    fillRect(cx - 14, maskY - 1, 29, 13, dark);
    fillRect(cx - 7, maskY + 7, 15, 5, shadow);
    set(cx - 5, maskY + 9, secondary); set(cx + 5, maskY + 9, secondary);
  } else {
    fillRect(cx - 15, maskY, 31, 12, maskTone);
    triangle([cx - 15, maskY], [cx - 10, maskY + 13], [cx - 3, maskY + 13], dark);
    triangle([cx + 15, maskY], [cx + 10, maskY + 13], [cx + 3, maskY + 13], dark);
  }

  // Slanted angry eyes — canonical CHROMIES geometry.
  const eyeY = top + 19;
  const slant = Math.max(2, Math.floor(5 * modifiers.eyeSlant));
  const drawSlantEye = (ex, dir) => {
    line(ex - slant, eyeY + (dir > 0 ? 1 : 0), ex + slant - 1, eyeY - Math.ceil(2 * modifiers.eyeSlant), dark);
    line(ex - slant + 1, eyeY + 1, ex + slant - 2, eyeY, dark);
    set(ex - 1, eyeY, secondary);
    set(ex, eyeY - 1, secondary);
    set(ex + 1, eyeY - 1, light);
  };
  drawSlantEye(eyeLeftX, -1);
  drawSlantEye(eyeRightX, 1);

  line(eyeLeftX - 8, eyeY - 5, eyeLeftX - 2, eyeY - 3, dark);
  line(eyeRightX + 2, eyeY - 3, eyeRightX + 8, eyeY - 6, dark);

  // Nose bridge / shadow.
  line(cx, eyeY + 3, cx - 2, eyeY + 12, shadow);
  set(cx + 1, eyeY + 7, light);

  // Marks / tattoos.
  if (mark === "Under-eye Slash") line(cx + 11, eyeY + 4, cx + 15, eyeY + 8, hot);
  else if (mark === "Forehead Glyph") { set(cx - 2, top + 10, hot); set(cx, top + 9, hot); set(cx + 2, top + 10, hot); }
  else if (mark === "Cheek Pixel") fillRect(cx - 14, eyeY + 9, 3, 3, hot);
  else if (mark === "Bridge Scar") line(cx - 2, eyeY - 2, cx + 2, eyeY + 4, hot);
  else line(cx + 13, top + 14, cx + 16, top + 10, hot);

  // Piercings / metallic pixels.
  if (rng() > 0.35 * modifiers.grimeLevel) {
    set(cx - 16, top + 28, metallic);
    set(cx + 16, top + 29, metallic);
  }
  if (rng() > 0.55 * modifiers.grimeLevel) set(cx + 3, maskY - 2, metallic);

  const grimePasses = Math.floor(28 * modifiers.grimeLevel);
  for (let i = 0; i < grimePasses; i++) {
    const x = cx - hw - 2 + Math.floor(rng() * (hw * 2 + 5));
    const y = top + 8 + Math.floor(rng() * 34);
    if (rng() > 0.55 - modifiers.grimeLevel * 0.2) set(x, y, rng() > 0.5 ? shadow : light);
  }

  return { buf, palette, paletteId: palette.id, traits };
}

function generateToken(id, renderMode = "punk", driftLevel = 0.5, options = {}) {
  return renderMode === "classic"
    ? generateClassicToken(id, driftLevel)
    : generatePunkToken(id, driftLevel, options);
}

/**
 * Canonical CHROMIES species — bypasses mirror, structural mutation, and Normie silhouette.
 * Normie ID is lineage seed only (deterministic archetype / hero hooks).
 */
function generateCanonicalChromie(
  normieId,
  { renderMode = "punk", paletteFamilyId = "signal", pureSkullTest = false } = {},
) {
  const token = generateDLockChromie(normieId, { paletteFamilyId, pureSkullTest });
  const qa = validateSpeciesCompression(token.buf, token.massSide, { pureSkull: pureSkullTest });

  return {
    buf: token.buf,
    palette: token.palette,
    paletteId: token.paletteId,
    traits: {
      Mode: "Chromie Species",
      Form: "Canonical CHROMIES",
      SignalDrift: "100%",
      Anchor: "Chromie",
      Descriptor: "Species emerged.",
      NormieId: normieId,
      Lineage: `Normie #${normieId}`,
      PaletteFamily: token.traits.PaletteFamily,
      Mutation: "canonical-species",
      Doctrine: token.traits.Doctrine ?? "D-Lock",
      Canon: token.traits.Canon ?? D_LOCK_CANON_PATH,
      Archetype: token.traits.Archetype ?? token.traits.Hero,
      MaskMaterial: token.traits.MaskMaterial,
      HoodieMaterial: token.traits.Hoodie,
      ChainMaterial: token.traits.ChainMaterial,
      EyeMaterial: token.traits.EyeMaterial,
      Materials: token.traits.Materials,
      Hoodie: token.traits.Hoodie,
      Chains: token.traits.Chains,
      Hero: token.traits.Hero,
      EmotionalSignal: token.traits.EmotionalSignal,
      FacialPlanes: token.traits.FacialPlanes,
      PureSkullTest: token.traits.PureSkullTest,
      CompressionQA: qa.pass ? "pass" : qa.failures.join(", "),
    },
  };
}

/** Normie-memory continuum (OG / AWAKENED / DRIFTED). */
function generateDriftChromie(
  normieId,
  pixelString,
  driftLevel,
  { pureChromieMode = false, renderMode = "punk", paletteFamilyId = "signal" } = {},
) {
  if (pureChromieMode) {
    return generateCanonicalChromie(normieId, { renderMode, paletteFamilyId });
  }

  const t = clampDrift(driftLevel);
  const mirror = generateMirrorChromieFromPixels(normieId, pixelString, paletteFamilyId, 0);
  if (t <= 0.001) return mirror;
  return buildDriftChromie(normieId, pixelString, t, paletteFamilyId, mirror);
}

function renderSVG(buf, palette, { size = 1024, skipBg = true, bgIndex = 0 } = {}) {
  const cell = size / GRID;
  let rects = 0;
  let body = "";

  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const idx = buf[y * GRID + x];
      let run = 1;
      while (x + run < GRID && buf[y * GRID + x + run] === idx) run++;
      if (!(skipBg && idx === bgIndex)) {
        body += `<rect x="${x * cell}" y="${y * cell}" width="${run * cell}" height="${cell}" fill="${palette.colors[idx]}"/>`;
        rects++;
      }
      x += run;
    }
  }

  const bg = palette.colors[bgIndex];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${bg}"/>${body}</svg>`;
  return { svg, rects };
}

const FONT_DISPLAY = "'DM Serif Display', Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";
const FONT_BODY = "'Space Grotesk', system-ui, sans-serif";

function StatChip({ label, value, mono }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a8780" }}>{label}</span>
      <span style={{ fontSize: 15, fontFamily: mono ? FONT_MONO : FONT_BODY, color: "#f4f2ea" }}>{value}</span>
    </div>
  );
}

const AWAKENING_PRESETS = [
  { id: "og", label: "OG", drift: 0, pureChromie: false, copy: "Identity preserved." },
  { id: "awakened", label: "AWAKENED", drift: 0.5, pureChromie: false, copy: "Signal enhanced." },
  { id: "drifted", label: "DRIFTED", drift: 0.9, pureChromie: false, copy: "Identity destabilized." },
  {
    id: "chromie",
    label: "CHROMIE",
    drift: 1,
    pureChromie: true,
    copy: "Species emerged.",
    lore: "The signal became something new.",
  },
];

const PRESET_MATCH_EPS = 0.02;

function matchAwakeningPreset(driftLevel, pureChromieMode) {
  if (pureChromieMode) {
    return AWAKENING_PRESETS.find((p) => p.pureChromie) ?? null;
  }
  const t = clampDrift(driftLevel);
  return (
    AWAKENING_PRESETS.filter((p) => !p.pureChromie).find((p) => Math.abs(t - p.drift) < PRESET_MATCH_EPS) ??
    null
  );
}

function getAwakeningLiveText(driftLevel, pureChromieMode) {
  const preset = matchAwakeningPreset(driftLevel, pureChromieMode);
  if (preset) return preset.copy;
  return "Custom Drift";
}

function PaletteFamilyPanel({ paletteFamilyId, onSelect }) {
  const active = PALETTE_FAMILIES[paletteFamilyId] ?? PALETTE_FAMILIES.signal;
  return (
    <div className="chromies-palette-family-panel">
      <div className="chromies-palette-family-header">
        <div className="chromies-palette-family-eyebrow">PALETTE FAMILY</div>
        <div className="chromies-palette-family-sub">Species expression · emotional signal</div>
      </div>
      <div className="chromies-palette-family-grid" role="listbox" aria-label="Palette family">
        {PALETTE_FAMILY_LIST.map((family) => {
          const isActive = family.id === paletteFamilyId;
          return (
            <button
              key={family.id}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`chromies-palette-family-chip${isActive ? " active" : ""}`}
              onClick={() => onSelect(family.id)}
            >
              <span className="chromies-palette-family-chip-label">{family.label}</span>
              <span className="chromies-palette-family-chip-swatches" aria-hidden="true">
                {family.preview.map((c) => (
                  <span key={c} className="chromies-palette-family-swatch" style={{ background: c }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="chromies-palette-family-active-tagline">{active.tagline}</div>
    </div>
  );
}

function SignalDriftPanel({ driftLevel, pureChromieMode, paletteFamilyId, onPaletteFamily, onDriftChange, onPureChromieMode }) {
  const pct = driftPercent(driftLevel);
  const activePreset = matchAwakeningPreset(driftLevel, pureChromieMode);
  const liveText = getAwakeningLiveText(driftLevel, pureChromieMode);

  const selectPreset = (p) => {
    onDriftChange(p.drift);
    onPureChromieMode(!!p.pureChromie);
  };

  const handleSlider = (value) => {
    onDriftChange(driftFromPercent(value));
    onPureChromieMode(false);
  };

  return (
    <div className="chromies-drift-panel">
      <div className="chromies-drift-header">
        <div className="chromies-drift-eyebrow">Awakening</div>
        <div className="chromies-drift-lore">Choose how far the signal drifts.</div>
      </div>

      <div className="chromies-preset-tabs chromies-preset-tabs-4" role="tablist" aria-label="Awakening presets">
        {AWAKENING_PRESETS.map((p) => {
          const isActive = activePreset?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`chromies-preset-tab${isActive ? " active" : ""}${p.pureChromie ? " chromie-species" : ""}`}
              onClick={() => selectPreset(p)}
            >
              <span className="chromies-preset-tab-label">{p.label}</span>
            </button>
          );
        })}
      </div>
      {activePreset?.lore ? (
        <div className="chromies-chromie-lore">{activePreset.lore}</div>
      ) : null}

      <div className="chromies-drift-axis" aria-hidden="true">
        <span className="chromies-drift-axis-end">MEMORY</span>
        <span className="chromies-drift-axis-track">
          <span className="chromies-drift-axis-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="chromies-drift-axis-end">DRIFT</span>
      </div>
      <div className="chromies-drift-control">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          className="chromies-drift-slider"
          aria-label="Signal drift"
          onChange={(e) => handleSlider(+e.target.value)}
        />
        <div className="chromies-drift-readout">
          <span className="chromies-drift-pct">{pct}</span>
          <span className="chromies-drift-unit">signal</span>
        </div>
      </div>
      <div className={`chromies-drift-live${activePreset ? "" : " custom"}`}>{liveText}</div>

      <PaletteFamilyPanel paletteFamilyId={paletteFamilyId} onSelect={onPaletteFamily} />
    </div>
  );
}

function IdentitySurvivalPanel({ formMode, onFormMode, driftLevel, pureChromieMode, paletteFamilyId, onPaletteFamily, onDriftChange, onPureChromieMode }) {
  const activeForm = FORM_MODES.find((f) => f.id === formMode) ?? FORM_MODES[1];
  return (
    <div className="chromies-identity-panel">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, margin: "0 0 6px", fontWeight: 400 }}>
          Choose how your identity survives.
        </h2>
        <div style={{ fontSize: 12, color: "#8a8780", lineHeight: 1.5 }}>
          Identity continuity system — not a random derivative. Recognizability is the primary value.
        </div>
      </div>
      <div className="chromies-form-tabs">
        {FORM_MODES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chromies-form-tab${formMode === f.id ? " active" : ""}`}
            onClick={() => onFormMode(f.id)}
          >
            <span className="chromies-form-tab-label">{f.label}</span>
          </button>
        ))}
      </div>
      <div className="chromies-form-detail">
        <div style={{ fontSize: 13, color: "#d8d1c5", lineHeight: 1.55 }}>{activeForm.description}</div>
      </div>
      {formMode === "chromie" ? (
        <SignalDriftPanel
          driftLevel={driftLevel}
          pureChromieMode={pureChromieMode}
          paletteFamilyId={paletteFamilyId}
          onPaletteFamily={onPaletteFamily}
          onDriftChange={onDriftChange}
          onPureChromieMode={onPureChromieMode}
        />
      ) : null}
    </div>
  );
}

function CollectionWallPanel({ wallSize, onWallSize }) {
  const wall = useMemo(() => generateCollectionWall(wallSize), [wallSize]);
  const wallSvg = useMemo(() => renderWallSvg(wall, { cellPx: 64, gap: 2 }), [wall]);

  return (
    <section style={{ padding: "20px 32px", borderBottom: "2px solid #34312d", background: "#0c0b0c" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, margin: 0, fontWeight: 400 }}>Collection Wall</h2>
          <div style={{ fontSize: 12, color: "#8a8780", marginTop: 4 }}>
            {wall.count} CHROMIES · {wall.passCount} QA pass · {wall.heroCount} heroes · same species at a glance
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[20, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              className={`chroma-btn ${wallSize === n ? "hot" : "ghost"}`}
              onClick={() => onWallSize(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{ overflow: "auto", maxHeight: 520, border: "1px solid #34312d", background: "#060606" }}
        dangerouslySetInnerHTML={{ __html: wallSvg }}
      />
      {wall.failCount > 0 ? (
        <div style={{ fontSize: 11, color: "#c47070", marginTop: 8, fontFamily: FONT_MONO }}>
          {wall.failCount} cell(s) failed compression QA — refine materials, not structure
        </div>
      ) : null}
    </section>
  );
}

function TokenPreview({ tokenId, mode, driftLevel, label, note, onSelect, chromie = false }) {
  const token = useMemo(() => {
    if (chromie) {
      const hero = resolveCanonicalHero(tokenId);
      return generateCanonicalChromie(tokenId, {
        paletteFamilyId: hero?.paletteFamilyId ?? "signal",
      });
    }
    return generateToken(tokenId, mode, driftLevel);
  }, [tokenId, mode, driftLevel, chromie]);
  const { svg } = useMemo(() => renderSVG(token.buf, token.palette, { size: 512, skipBg: true }), [token]);
  return (
    <button onClick={() => onSelect(tokenId, mode, chromie)} style={{
      border: "1.5px solid #34312d", background: "#151314", color: "#f4f2ea",
      padding: 8, cursor: "pointer", textAlign: "left"
    }}>
      <div style={{ aspectRatio: "1/1", border: "1px solid #34312d", background: token.palette.colors[0], overflow: "hidden" }}
        dangerouslySetInnerHTML={{ __html: svg.replace('width="512" height="512"', 'width="100%" height="100%"') }} />
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#ff5470", marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#8a8780", marginTop: 2 }}>{note}</div>
    </button>
  );
}

export default function ChromiesPrototype() {
  const [tokenId, setTokenId] = useState(1207);
  const [mode, setMode] = useState("punk");
  const [formMode, setFormMode] = useState("chromie");
  const [driftLevel, setDriftLevel] = useState(0.5);
  const [pureChromieMode, setPureChromieMode] = useState(false);
  const [pureSkullTest, setPureSkullTestState] = useState(false);
  const [wallPreviewMode, setWallPreviewModeState] = useState(false);
  const [wallSize, setWallSize] = useState(20);
  const [paletteFamilyId, setPaletteFamilyId] = useState("signal");
  const [size, setSize] = useState(560);
  const [showGrid, setShowGrid] = useState(false);
  const [skipBg, setSkipBg] = useState(true);

  const [normieId, setNormieId] = useState(7);
  const [normieSvg, setNormieSvg] = useState(null);
  const [normieErr, setNormieErr] = useState(null);
  const [loadingNormie, setLoadingNormie] = useState(false);
  const [normiePixels, setNormiePixels] = useState(null);
  const [pixelsErr, setPixelsErr] = useState(null);
  const [pixelsLoading, setPixelsLoading] = useState(false);

  const isChromieForm = formMode === "chromie";
  const isOriginalForm = formMode === "original";

  useEffect(() => {
    if (!isChromieForm) {
      setNormiePixels(null);
      setPixelsErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPixelsLoading(true);
      setPixelsErr(null);
      try {
        const pixels = await fetchNormiePixels(normieId);
        if (!cancelled) setNormiePixels(pixels);
      } catch (e) {
        if (!cancelled) {
          setNormiePixels(null);
          setPixelsErr(e?.message || "could not load Normie pixels");
        }
      } finally {
        if (!cancelled) setPixelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isChromieForm, normieId]);

  const token = useMemo(() => {
    if (!isChromieForm) return null;
    if (pureChromieMode) {
      return generateCanonicalChromie(normieId, {
        renderMode: mode,
        paletteFamilyId,
        pureSkullTest,
      });
    }
    if (normiePixels) {
      return generateDriftChromie(normieId, normiePixels, driftLevel, {
        renderMode: mode,
        paletteFamilyId,
      });
    }
    const palette = paletteFamilyToMirrorPalette(paletteFamilyId);
    return {
      buf: new Uint8Array(PX),
      palette,
      paletteId: palette.id,
      traits: {
        Mode: pureChromieMode ? "Chromie Species" : "Signal Reconstruction",
        NormieId: normieId,
        PaletteFamily: palette.name,
        SignalDrift: `${driftPercent(driftLevel)}%`,
        Status: pixelsLoading ? "Loading Normie source…" : pixelsErr || "Awaiting Normie pixels",
      },
    };
  }, [isChromieForm, normiePixels, normieId, driftLevel, pureChromieMode, pureSkullTest, paletteFamilyId, mode, pixelsLoading, pixelsErr]);

  useEffect(() => {
    setPureSkullTest(pureSkullTest);
  }, [pureSkullTest]);

  useEffect(() => {
    setWallPreviewMode(wallPreviewMode);
  }, [wallPreviewMode]);

  const { svg, rects } = useMemo(() => {
    if (isOriginalForm || !token) return { svg: null, rects: 0 };
    return renderSVG(token.buf, token.palette, { size: 1024, skipBg });
  }, [token, skipBg, isOriginalForm]);

  const indexBytes = (PX * BPP) / 8;
  const paletteBytes = 16 * 3;
  const totalBytes = indexBytes + paletteBytes;
  const normieBytes = 200;
  const mult = (totalBytes / normieBytes).toFixed(1);

  const fetchNormie = useCallback(async (id) => {
    setLoadingNormie(true); setNormieErr(null);
    try {
      const r = await fetch(`${NORMIE_API}/normie/${id}/image.svg`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      setNormieSvg(t);
    } catch (e) {
      setNormieErr(e.message || "fetch failed");
      setNormieSvg(null);
    } finally {
      setLoadingNormie(false);
    }
  }, []);

  useEffect(() => { fetchNormie(normieId); }, [normieId, fetchNormie]);

  const randomToken = () => {
    setMode("punk");
    setTokenId(Math.floor(Math.random() * 10000));
  };

  const selectHero = (id, nextMode, chromie = false) => {
    setNormieId(id);
    setTokenId(id);
    setMode(nextMode);
    if (chromie) {
      setFormMode("chromie");
      setPureChromieMode(true);
      setDriftLevel(1);
      const hero = resolveCanonicalHero(id);
      if (hero) setPaletteFamilyId(hero.paletteFamilyId);
    }
  };

  return (
    <div
      className="chromies-root"
      style={{
        fontFamily: FONT_BODY, background: "#0b0a0b", color: "#f4f2ea",
        minHeight: "100vh", padding: "0 0 48px", overflowX: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .chroma-btn { font-family:${FONT_BODY}; font-size:13px; border:1.5px solid #f4f2ea; background:#f4f2ea; color:#0b0a0b; padding:9px 16px; cursor:pointer; transition:all .12s; letter-spacing:.02em; }
        .chroma-btn:hover { background:#ff5470; border-color:#ff5470; color:#0b0a0b; }
        .chroma-btn.ghost { background:transparent; color:#f4f2ea; }
        .chroma-btn.ghost:hover { background:#f4f2ea; color:#0b0a0b; }
        .chroma-btn.hot { background:#ff5470; border-color:#ff5470; color:#0b0a0b; }
        .chroma-num { font-family:${FONT_MONO}; font-size:14px; border:1.5px solid #34312d; background:#151314; padding:8px 10px; width:92px; color:#f4f2ea; }
        input[type=range].cr { accent-color:#ff5470; }
        .chromies-identity-panel {
          margin-bottom: 20px;
          padding: 16px 18px;
          border: 1.5px solid #34312d;
          background: #100f10;
        }
        .chromies-form-tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }
        .chromies-form-tab {
          font-family: ${FONT_BODY};
          text-align: left;
          padding: 10px 12px;
          border: 1.5px solid #34312d;
          background: #151314;
          color: #b8b2a8;
          cursor: pointer;
          transition: border-color .12s, background .12s, color .12s;
        }
        .chromies-form-tab:hover {
          border-color: #5a5650;
          color: #f4f2ea;
        }
        .chromies-form-tab.active {
          border-color: #ff5470;
          background: #1a1416;
          color: #f4f2ea;
        }
        .chromies-form-tab-label {
          display: block;
          font-family: ${FONT_DISPLAY};
          font-size: 15px;
          letter-spacing: 0.02em;
        }
        .chromies-form-detail {
          margin-bottom: 14px;
          padding-bottom: 12px;
          border-bottom: 1px solid #34312d;
        }
        .chromies-drift-panel {
          margin-top: 4px;
          padding-top: 16px;
          border-top: 1px solid #34312d;
        }
        .chromies-preset-tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 20px;
        }
        .chromies-preset-tabs-4 {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .chromies-preset-tab.chromie-species.active {
          border-color: #e3e5e4;
          box-shadow: 0 0 0 1px rgba(227, 229, 228, 0.4), 0 0 22px rgba(255, 84, 112, 0.12);
        }
        .chromies-chromie-lore {
          font-family: ${FONT_DISPLAY};
          font-size: 14px;
          color: #b8b2a8;
          font-style: italic;
          margin: -8px 0 16px;
          line-height: 1.45;
        }
        .chromies-preset-tab {
          font-family: ${FONT_BODY};
          position: relative;
          text-align: center;
          padding: 12px 10px;
          border: 1px solid #34312d;
          background: #121112;
          color: #8a8780;
          cursor: pointer;
          transition: border-color 0.14s, color 0.14s, box-shadow 0.14s, background 0.14s;
          letter-spacing: 0.14em;
        }
        .chromies-preset-tab:hover {
          border-color: #5a5650;
          color: #d8d1c5;
        }
        .chromies-preset-tab.active {
          border-color: #ff5470;
          color: #f4f2ea;
          background: #161214;
          box-shadow: 0 0 0 1px rgba(255, 84, 112, 0.35), 0 0 18px rgba(255, 84, 112, 0.08);
        }
        .chromies-preset-tab-label {
          display: block;
          font-family: ${FONT_MONO};
          font-size: 11px;
          font-weight: 500;
        }
        .chromies-drift-header {
          margin-bottom: 18px;
        }
        .chromies-drift-eyebrow {
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #8a8780;
          margin-bottom: 6px;
        }
        .chromies-drift-lore {
          font-family: ${FONT_DISPLAY};
          font-size: 17px;
          color: #f4f2ea;
          letter-spacing: 0.02em;
        }
        .chromies-drift-axis {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .chromies-drift-axis-end {
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #6e6a62;
          flex-shrink: 0;
        }
        .chromies-drift-axis-track {
          flex: 1;
          height: 1px;
          background: #2a2826;
          position: relative;
          overflow: hidden;
        }
        .chromies-drift-axis-fill {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: linear-gradient(90deg, #5a5650 0%, #ff5470 100%);
          transition: width 0.08s ease-out;
        }
        .chromies-drift-control {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 12px;
        }
        .chromies-drift-slider {
          -webkit-appearance: none;
          appearance: none;
          flex: 1;
          height: 2px;
          background: transparent;
          margin: 0;
          cursor: pointer;
        }
        .chromies-drift-slider::-webkit-slider-runnable-track {
          height: 2px;
          background: linear-gradient(90deg, #34312d 0%, #ff5470 100%);
          border-radius: 0;
        }
        .chromies-drift-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          margin-top: -6px;
          border-radius: 50%;
          background: #f4f2ea;
          border: 2px solid #ff5470;
          box-shadow: 0 0 0 4px rgba(255, 84, 112, 0.12);
        }
        .chromies-drift-slider::-moz-range-track {
          height: 2px;
          background: linear-gradient(90deg, #34312d 0%, #ff5470 100%);
        }
        .chromies-drift-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #f4f2ea;
          border: 2px solid #ff5470;
          box-shadow: 0 0 0 4px rgba(255, 84, 112, 0.12);
        }
        .chromies-drift-readout {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 52px;
          line-height: 1;
        }
        .chromies-drift-pct {
          font-family: ${FONT_MONO};
          font-size: 22px;
          color: #ff5470;
        }
        .chromies-drift-unit {
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8a8780;
          margin-top: 4px;
        }
        .chromies-drift-live {
          font-family: ${FONT_DISPLAY};
          font-size: 15px;
          color: #ff5470;
          letter-spacing: 0.02em;
          margin-top: 4px;
        }
        .chromies-drift-live.custom {
          color: #b8b2a8;
          font-family: ${FONT_MONO};
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .chromies-palette-family-panel {
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid #34312d;
        }
        .chromies-palette-family-header {
          margin-bottom: 12px;
        }
        .chromies-palette-family-eyebrow {
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #8a8780;
          margin-bottom: 4px;
        }
        .chromies-palette-family-sub {
          font-size: 12px;
          color: #6e6a62;
          line-height: 1.45;
        }
        .chromies-palette-family-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 10px;
        }
        .chromies-palette-family-chip {
          font-family: ${FONT_BODY};
          text-align: left;
          padding: 10px 10px 8px;
          border: 1px solid #34312d;
          background: #121112;
          color: #8a8780;
          cursor: pointer;
          transition: border-color 0.14s, box-shadow 0.14s, color 0.14s;
        }
        .chromies-palette-family-chip:hover {
          border-color: #5a5650;
          color: #d8d1c5;
        }
        .chromies-palette-family-chip.active {
          border-color: #ff5470;
          color: #f4f2ea;
          background: #161214;
          box-shadow: 0 0 0 1px rgba(255, 84, 112, 0.28), 0 0 16px rgba(255, 84, 112, 0.07);
        }
        .chromies-palette-family-chip-label {
          display: block;
          font-family: ${FONT_MONO};
          font-size: 10px;
          letter-spacing: 0.14em;
          margin-bottom: 8px;
        }
        .chromies-palette-family-chip-swatches {
          display: flex;
          gap: 3px;
          height: 6px;
        }
        .chromies-palette-family-swatch {
          flex: 1;
          min-width: 0;
          border-radius: 1px;
        }
        .chromies-palette-family-active-tagline {
          font-size: 11px;
          color: #8a8780;
          line-height: 1.5;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .chromies-root {
            overflow-x: hidden !important;
          }

          .chromies-header {
            padding: 20px 16px !important;
            align-items: flex-start !important;
            flex-direction: column !important;
          }

          .chromies-title {
            font-size: 40px !important;
            line-height: 0.95 !important;
          }

          .chromies-subtitle {
            font-size: 13px !important;
            max-width: 100% !important;
          }

          .chromies-stats {
            width: 100% !important;
            gap: 14px !important;
          }

          .chromies-demo-section {
            padding: 16px !important;
          }

          .chromies-demo-grid {
            display: flex !important;
            overflow-x: auto !important;
            gap: 10px !important;
            padding-bottom: 8px !important;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
          }

          .chromies-demo-grid > button {
            min-width: 132px !important;
            flex-shrink: 0;
            scroll-snap-align: start;
          }

          .chromies-main-grid {
            display: block !important;
          }

          .chromies-art-section {
            padding: 18px 16px !important;
            border-right: none !important;
            border-bottom: 2px solid #34312d !important;
          }

          .chromies-info-section {
            padding: 18px 16px !important;
          }

          .chromies-controls {
            gap: 8px !important;
          }

          .chromies-preview {
            width: 100% !important;
            max-width: 92vw !important;
          }

          .chromies-traits-grid {
            grid-template-columns: 1fr !important;
          }

          .chromies-palette-strip > div {
            height: 24px !important;
          }

          .chromies-palette-strip span {
            font-size: 7px !important;
          }

          .chromies-footer {
            padding: 18px 16px 0 !important;
          }

          .chromies-form-tabs {
            grid-template-columns: 1fr !important;
          }

          .chromies-preset-tabs,
          .chromies-preset-tabs-4 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .chromies-palette-family-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .chromies-identity-panel {
            padding: 14px !important;
          }
        }
      `}</style>

      <header
        className="chromies-header"
        style={{ borderBottom: "2px solid #34312d", padding: "28px 32px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8a8780", marginBottom: 4 }}>
            indexed identity · evolved companion signal · demo index
          </div>
          <h1 className="chromies-title" style={{ fontFamily: FONT_DISPLAY, fontSize: 58, lineHeight: 0.9, margin: 0, fontWeight: 400 }}>
            CHROMIES<span style={{ color: "#ff5470" }}>.</span>
          </h1>
          <div className="chromies-subtitle" style={{ fontSize: 14, color: "#b8b2a8", marginTop: 8, maxWidth: 760 }}>
            An evolved indexed identity system inspired by Normies: 64×64, 16-color curated ramps, deterministic RLE SVG output, and collectible companion archetypes.
          </div>
        </div>
        <div className="chromies-stats" style={{ display: "flex", gap: 28, alignItems: "flex-end", flexWrap: "wrap" }}>
          <StatChip label="Grid" value="64 × 64" mono />
          <StatChip label="Pixels" value="4,096" mono />
          <StatChip label="Depth" value="4 bpp" mono />
          <StatChip label="Bytes" value={`${totalBytes}`} mono />
          <StatChip label="vs Normies" value={`${mult}×`} mono />
        </div>
      </header>

      <section className="chromies-demo-section" style={{ padding: "22px 32px", borderBottom: "2px solid #34312d", background: "#100f10" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, margin: 0, fontWeight: 400 }}>Demo Index</h2>
            <div style={{ fontSize: 12, color: "#8a8780" }}>Collectible archetypes and companion evolutions: proof render + identity direction.</div>
          </div>
          <button className="chroma-btn hot" onClick={randomToken}>Generate Chromie</button>
        </div>
        <div className="chromies-demo-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 12 }}>
          {HERO_DEMOS.map((h) => (
            <TokenPreview key={`${h.tokenId}-${h.mode}`} {...h} driftLevel={h.drift ?? 0.5} onSelect={selectHero} />
          ))}
        </div>
      </section>

      {wallPreviewMode ? (
        <CollectionWallPanel wallSize={wallSize} onWallSize={setWallSize} />
      ) : null}

      <div className="chromies-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.12fr) minmax(360px,0.88fr)", gap: 0, alignItems: "stretch" }}>
        <section className="chromies-art-section" style={{ padding: "28px 32px", borderRight: "2px solid #34312d" }}>
          <IdentitySurvivalPanel
            formMode={formMode}
            onFormMode={setFormMode}
            driftLevel={driftLevel}
            pureChromieMode={pureChromieMode}
            paletteFamilyId={paletteFamilyId}
            onDriftChange={setDriftLevel}
            onPureChromieMode={setPureChromieMode}
            onPaletteFamily={setPaletteFamilyId}
          />

          <div className="chromies-controls" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: "#8a8780" }}>NORMIE #</span>
            <input className="chroma-num" type="number" min={0} max={9999} value={normieId}
              onChange={(e) => setNormieId(Math.max(0, Math.min(9999, +e.target.value || 0)))} />
            {isChromieForm && pureChromieMode ? (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#b8b2a8", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={pureSkullTest}
                    onChange={(e) => setPureSkullTestState(e.target.checked)}
                  />
                  Pure skull test
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#b8b2a8", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={wallPreviewMode}
                    onChange={(e) => setWallPreviewModeState(e.target.checked)}
                  />
                  Wall preview mode
                </label>
              </>
            ) : null}
            {isChromieForm && (pureChromieMode || driftLevel > 0.25) ? (
              <>
                <button className={`chroma-btn ${mode === "punk" ? "hot" : "ghost"}`} onClick={() => setMode("punk")}>Companion Mode</button>
                <button className={`chroma-btn ${mode === "classic" ? "hot" : "ghost"}`} onClick={() => setMode("classic")}>Baseline Proof</button>
              </>
            ) : null}
            {!isOriginalForm ? (
              <button className="chroma-btn ghost" onClick={() => setShowGrid(g => !g)}>{showGrid ? "Hide grid" : "Show grid"}</button>
            ) : null}
            {pixelsLoading ? (
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#ff5470" }}>Signal reconstructing…</span>
            ) : null}
          </div>

          <div className="chromies-preview" style={{ position: "relative", width: size, maxWidth: "100%", margin: "0 auto", border: "2px solid #34312d", background: isOriginalForm ? "#e3e5e4" : (token?.palette?.colors?.[0] ?? "#151314"), aspectRatio: "1/1", boxShadow: "0 20px 80px rgba(0,0,0,.45)" }}>
            {isOriginalForm ? (
              normieSvg
                ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: normieSvg.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"') }} />
                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT_MONO, fontSize: 12, color: normieErr ? "#ff5470" : "#8a8780", padding: 16, textAlign: "center" }}>
                    {loadingNormie ? "Loading Normie reference…" : normieErr ? `Couldn't load (${normieErr})` : "Enter a Normie ID"}
                  </div>
            ) : svg ? (
              <div dangerouslySetInnerHTML={{ __html: svg.replace('width="1024" height="1024"', 'width="100%" height="100%"') }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT_MONO, fontSize: 12, color: "#8a8780" }}>—</div>
            )}
            {showGrid && !isOriginalForm && (
              <svg viewBox={`0 0 ${GRID} ${GRID}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.22 }}>
                {Array.from({ length: GRID + 1 }).map((_, i) => (
                  <g key={i}>
                    <line x1={i} y1={0} x2={i} y2={GRID} stroke="#fff" strokeWidth={0.035} />
                    <line x1={0} y1={i} x2={GRID} y2={i} stroke="#fff" strokeWidth={0.035} />
                  </g>
                ))}
              </svg>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8780" }}>Preview size</span>
            <input className="cr" type="range" min={320} max={680} step={20} value={size} onChange={e => setSize(+e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 12 }}>{size}px</span>
          </div>

          {!isOriginalForm && token ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8780", marginBottom: 8 }}>
              Palette family · <span style={{ color: "#f4f2ea", fontFamily: FONT_MONO }}>{token.traits?.PaletteFamily ?? token.palette.name}</span>
            </div>
            <div className="chromies-palette-strip" style={{ display: "flex", gap: 0, border: "1.5px solid #34312d" }}>
              {token.palette.colors.map((c, i) => (
                <div key={i} title={`index ${i}: ${c}`} style={{ flex: 1, height: 32, background: c, position: "relative" }}>
                  <span style={{ position: "absolute", bottom: 1, left: 0, right: 0, textAlign: "center", fontSize: 8, fontFamily: FONT_MONO, color: i < 5 ? "#fff" : "#000", opacity: 0.65 }}>{i.toString(16).toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
          ) : (
          <div style={{ marginTop: 20, fontSize: 12, color: "#8a8780", lineHeight: 1.6 }}>
            Original Normie reference · 40×40 · 1 bpp · untouched black &amp; white signal.
          </div>
          )}
        </section>

        <section className="chromies-info-section" style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, margin: "0 0 12px", fontWeight: 400 }}>Traits</h2>
            <div className="chromies-traits-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#34312d", border: "1.5px solid #34312d" }}>
              {(isOriginalForm
                ? Object.entries({ Form: "Original Normie", NormieId: normieId, Format: "40×40 · 1 bpp", Color: "Black / white" })
                : Object.entries(token?.traits ?? {})
              ).map(([k, v]) => (
                <div key={k} style={{ background: "#151314", padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8780" }}>{k}</div>
                  <div style={{ fontSize: 15, fontFamily: FONT_BODY, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, margin: "0 0 12px", fontWeight: 400 }}>On-chain Footprint</h2>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, lineHeight: 1.9, background: "#151314", color: "#e8e6df", padding: "14px 16px", border: "1.5px solid #34312d" }}>
              <div>identity map = 4096 px × 4 bit = <span style={{ color: "#ffac4a" }}>{indexBytes} B</span></div>
              <div>palette &nbsp;&nbsp;&nbsp;&nbsp;= 16 × RGB24 &nbsp;&nbsp;&nbsp;= <span style={{ color: "#ffac4a" }}>{paletteBytes} B</span></div>
              <div style={{ borderTop: "1px solid #34312d", marginTop: 4, paddingTop: 4 }}>per token &nbsp;&nbsp;= <span style={{ color: "#5cbce0" }}>{totalBytes} B</span> &nbsp;→ 1 SSTORE2 chunk</div>
              {!isOriginalForm ? (
                <div style={{ color: "#8a8780", marginTop: 6 }}>RLE rects in this chromie: <span style={{ color: "#86d6ee" }}>{rects}</span></div>
              ) : null}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, cursor: "pointer", color: "#b8b2a8" }}>
              <input type="checkbox" checked={skipBg} onChange={e => setSkipBg(e.target.checked)} style={{ accentColor: "#ff5470" }} />
              Skip background index when emitting SVG rects
            </label>
          </div>

          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, margin: "0 0 4px", fontWeight: 400 }}>Live Normie Reference</h2>
            <div style={{ fontSize: 12, color: "#8a8780", marginBottom: 10 }}>
              Real data from <span style={{ fontFamily: FONT_MONO }}>api.normies.art</span>.
              {isChromieForm
                ? " Signal drift reconstructs your Normie across a continuous memory→drift continuum in 64×64 indexed color."
                : " Not replacement — an awakened companion identity path."}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <input className="chroma-num" type="number" min={0} max={9999} value={normieId}
                onChange={e => setNormieId(Math.max(0, Math.min(9999, +e.target.value || 0)))} />
              <button className="chroma-btn ghost" onClick={() => fetchNormie(normieId)} disabled={loadingNormie}>
                {loadingNormie ? "Loading…" : "Fetch"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 150, height: 150, border: "2px solid #34312d", background: "#151314", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                {normieSvg
                  ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: normieSvg.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"') }} />
                  : <span style={{ fontSize: 11, color: normieErr ? "#ff5470" : "#8a8780", textAlign: "center", padding: 8, fontFamily: FONT_MONO }}>{normieErr ? `couldn't load (${normieErr})` : "—"}</span>}
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, lineHeight: 1.8, color: "#b8b2a8" }}>
                <div>Normie &nbsp;40×40 · 1 bpp · 200 B</div>
                <div>Chromies 64×64 · 4 bpp · {totalBytes} B</div>
                <div style={{ color: "#ff5470", marginTop: 6 }}>+160% indexed surface</div>
                <div style={{ color: "#ff5470" }}>2 → 16 signal states</div>
              </div>
            </div>
          </div>

          <div style={{ border: "1.5px solid #34312d", background: "#151314", padding: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#ff5470", marginBottom: 6 }}>Pitch framing</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: "#d8d1c5" }}>
              Renderer math is proven. Direction is now collectible and design-forward. This demo shows an indexed street identity system that evolves from Normies while staying deterministic and on-chain constrained.
            </div>
          </div>
        </section>
      </div>

      <footer className="chromies-footer" style={{ padding: "20px 32px 0", fontSize: 11.5, color: "#8a8780", fontFamily: FONT_MONO, lineHeight: 1.7 }}>
        Reference renderer: deterministic seed → 4096 palette indices → 16-color palette → RLE SVG rects.
        Chromies is positioned as a collectible companion identity system: clean signal, awakened form, disciplined structure.
      </footer>
    </div>
  );
}
