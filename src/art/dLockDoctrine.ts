/**
 * CHROMIES D-Lock — permanent species doctrine.
 * Authoritative visual target: reference/canon/D LOCK Doctrine.png
 */

import type { PaletteFamilyId } from "./paletteFamilies";
import { buildMaterialsForLineage, type DLockMaterials } from "./dLockMaterials";
import type { EyeMaterial, MaterialProfile } from "./dLockMaterialProfiles";
import { resolveCanonicalHero, type CanonicalHeroChromie } from "./dLockHeroes";

export const D_LOCK_CANON_PATH = "reference/canon/D LOCK Doctrine.png";

export let PURE_SKULL_TEST = false;

export function setPureSkullTest(enabled: boolean): void {
  PURE_SKULL_TEST = enabled;
}

export const D_LOCK_GEOMETRY = {
  cx: 32,
  top: 12,
  skullRows: 23,
  hw: 11,
  eyeY: 22,
  maskY: 23,
  jawY: 21,
  chinY: 34,
  /** Wider face opening — hoodie frames, does not eat silhouette. */
  faceHalfW: 13,
  eyeInsetL: 10,
  eyeInsetR: 10,
  slant: 4,
  hoodSidePad: 2,
  hoodCrownRows: 2,
  shoulderY0: 36,
  shoulderY1: 47,
} as const;

export type DLockDraw = {
  set: (x: number, y: number, v: number) => void;
  fillRect: (x0: number, y0: number, w: number, h: number, v: number) => void;
  line: (x0: number, y0: number, x1: number, y1: number, v: number) => void;
  triangle: (a: [number, number], b: [number, number], c: [number, number], v: number) => void;
};

export type DLockRenderOptions = {
  pureSkullTest?: boolean;
  paletteFamilyId?: PaletteFamilyId;
  hero?: CanonicalHeroChromie | null;
  materials?: DLockMaterials;
  materialProfile?: MaterialProfile;
};

/** Eye geometry mood — emotion through structure, not extra pixels. */
type EyeEmotion = {
  slantExtra: number;
  lidPressure: number;
  slitSpan: number;
  coreCount: 0 | 1 | 2;
  asymShift: number;
  useCatch: boolean;
};

function eyeEmotionFromMaterial(eye: EyeMaterial): EyeEmotion {
  switch (eye) {
    case "signal-glow":
      return { slantExtra: 1, lidPressure: 3, slitSpan: 2, coreCount: 2, asymShift: 0, useCatch: false };
    case "riot-ember":
      return { slantExtra: 2, lidPressure: 4, slitSpan: 3, coreCount: 2, asymShift: -1, useCatch: true };
    case "ghost-haze":
      return { slantExtra: 1, lidPressure: 2, slitSpan: 2, coreCount: 1, asymShift: 0, useCatch: true };
    case "dead-null":
      return { slantExtra: 0, lidPressure: 2, slitSpan: 1, coreCount: 1, asymShift: 0, useCatch: false };
    case "static-flicker":
      return { slantExtra: 1, lidPressure: 3, slitSpan: 2, coreCount: 2, asymShift: 1, useCatch: true };
    default:
      return { slantExtra: 1, lidPressure: 3, slitSpan: 2, coreCount: 2, asymShift: 0, useCatch: false };
  }
}

function drawSkullBase(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  massSide: number,
): void {
  const { set, fillRect } = draw;
  const { cx, top, hw, skullRows: hh, jawY } = G;

  for (let y = 0; y < hh; y++) {
    const yy = top + y;
    const t = y / hh;
    let left = cx - hw + Math.round(Math.abs(0.42 - t) * 2);
    let right = cx + hw - Math.round(Math.abs(0.42 - t) * 2);
    if (y < 7) { left -= 1; right += 1; }
    if (y < 5) { left += 2 - Math.floor(y * 0.35); right -= 1 - Math.floor(y * 0.25); }
    if (y > 18 && yy < jawY) {
      const taper = Math.floor((y - 18) * 0.48);
      left += taper;
      right -= taper;
    }
    if (massSide < 0) left -= 1;
    else right += 1;
    for (let x = left; x <= right; x++) {
      if (y >= 4 && y <= 6 && x === cx) continue;
      let v = M.skullMid;
      if (x <= left + 2) v = M.skullShadow;
      else if (x >= right - 2) v = M.skullLight;
      if (y < 6 && x === cx + massSide * 3) v = M.skullLight;
      set(x, yy, v);
    }
  }
}

/** Skull plane architecture — large forms, intentional breaks (hierarchy #2). */
function drawFacialPlanes(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  massSide: number,
): void {
  const { line, set } = draw;
  const { cx, top, eyeY, maskY, jawY, eyeInsetL, eyeInsetR } = G;
  const eyeLeftX = cx - eyeInsetL;
  const eyeRightX = cx + eyeInsetR;

  line(cx - 1, top + 5, cx + massSide * 7, top + 7, M.skullLight);
  line(cx + massSide * 8, top + 6, cx + massSide * 5, eyeY - 7, M.cheekPlane);

  line(eyeLeftX - 4, eyeY - 7, eyeRightX + 4, eyeY - 8, M.browDeep);
  line(eyeLeftX - 3, eyeY - 5, eyeRightX + 3, eyeY - 6, M.browMass);

  line(eyeLeftX - 2, eyeY - 1, eyeLeftX + 1, eyeY, M.socketRecess);
  line(eyeRightX - 1, eyeY - 1, eyeRightX + 2, eyeY, M.socketRecess);
  set(eyeLeftX - 1, eyeY, M.socketDeep);
  set(eyeLeftX, eyeY, M.socketDeep);
  set(eyeRightX, eyeY, M.socketDeep);
  set(eyeRightX + 1, eyeY, M.socketDeep);

  const wedgeX = massSide < 0 ? cx - 8 : cx + 8;
  line(wedgeX, eyeY + 4, wedgeX + massSide * 2, eyeY + 7, M.skullShadow);
  line(wedgeX + massSide * 2, eyeY + 7, wedgeX + massSide * 4, jawY, M.skullShadow);

  line(cx - 7, jawY + 1, cx - 2, maskY - 1, M.maskSeam);
  line(cx + 7, jawY + 1, cx + 2, maskY - 1, M.maskSeam);
}

/** Faceted mask — panel logic, center void, material seams (hierarchy #3). */
function drawIntegratedMask(
  draw: DLockDraw,
  M: DLockMaterials,
  profile: MaterialProfile,
  G: typeof D_LOCK_GEOMETRY,
  massSide: number,
): void {
  const { fillRect, triangle, set, line } = draw;
  const { cx, maskY, chinY } = G;
  const lean = massSide < 0 ? -1 : 1;

  const rowWidths = [10, 9, 8, 7, 6, 5, 4, 3];
  for (let y = 0; y < rowWidths.length; y++) {
    const yy = maskY + y;
    if (yy > chinY) break;
    const w = rowWidths[y]! + (y > 4 ? 0 : lean);
    const tone = y === 0 ? M.skullMid : M.maskMatte;
    if (y === 3) {
      fillRect(cx - w, yy, w - 1, 1, tone);
      fillRect(cx + 2, yy, w - 1, 1, tone);
    } else {
      fillRect(cx - w, yy, w * 2 + 1, 1, tone);
    }
  }

  const baseY = maskY + 1;
  const lCheek = lean < 0 ? [cx - 11, baseY] as const : [cx - 10, baseY] as const;
  const rCheek = lean > 0 ? [cx + 11, baseY] as const : [cx + 10, baseY] as const;
  triangle([lCheek[0], lCheek[1]], [cx - 7 + lean, baseY + 5], [cx - 2 + lean, baseY + 7], M.maskShadow);
  triangle([rCheek[0], rCheek[1]], [cx + 7 + lean, baseY + 5], [cx + 2 + lean, baseY + 7], M.maskShadow);
  triangle([cx - 2, baseY + 7], [cx, baseY + 8], [cx + 3, baseY + 6], M.maskMatte);
  line(cx - 5 + lean, chinY, cx + 3 - lean, chinY, M.maskShadow);
  set(cx + lean, chinY, M.maskShadow);

  set(cx - 7, maskY + 2, M.maskHighlight);
  set(cx + 7, maskY + 2, M.maskHighlight);
  if (profile.mask === "signal-plate" || profile.mask === "vented-shell") {
    line(cx - 6, maskY + 1, cx - 6, maskY + 5, M.maskSeam);
    line(cx + 6, maskY + 1, cx + 6, maskY + 5, M.maskSeam);
  }
  if (profile.mask === "stitched-synthetic") {
    set(cx - 5, maskY + 4, M.maskSeam);
    set(cx + 5, maskY + 4, M.maskSeam);
  }
}

/** Phenotype eye emotion — geometry-led read (hierarchy #1). */
function drawEyeBand(
  draw: DLockDraw,
  M: DLockMaterials,
  profile: MaterialProfile,
  G: typeof D_LOCK_GEOMETRY,
  massSide: number,
): void {
  const { set, line } = draw;
  const { eyeY, slant, eyeInsetL, eyeInsetR } = G;
  const mood = eyeEmotionFromMaterial(profile.eye);
  const slantTotal = slant + mood.slantExtra;
  const asym = mood.asymShift + (massSide < 0 ? -1 : massSide > 0 ? 1 : 0);
  const eyeLeftX = G.cx - eyeInsetL + (asym < 0 ? -1 : 0);
  const eyeRightX = G.cx + eyeInsetR + (asym > 0 ? 1 : 0);

  const drawEmotiveEye = (ex: number, dir: number, heavy: boolean) => {
    const inner = ex + (dir > 0 ? -1 : 1);
    const outer = ex + (dir > 0 ? 1 : -1);
    const lidY = eyeY - 2;
    const pressure = mood.lidPressure + (heavy ? 1 : 0);

    line(inner, lidY - 1, outer, lidY - 2, M.browDeep);
    line(inner, lidY, outer, lidY - 1, M.browMass);
    line(outer, lidY - 1, outer + dir * 2, lidY - slantTotal, M.browMass);
    if (pressure >= 3) line(inner, lidY + 1, outer + dir, lidY - slantTotal + 1, M.browDeep);
    if (pressure >= 4) line(inner + dir, lidY + 1, outer, eyeY, M.socketRecess);

    line(inner, eyeY + 1, outer, eyeY + 1, M.socketDeep);
    if (mood.slitSpan >= 2) line(inner, eyeY, outer, eyeY, M.eyeCore);
    if (mood.coreCount >= 1) set(ex, eyeY, M.eyeCore);
    if (mood.coreCount >= 2) set(outer, eyeY, M.eyeCore);
    if (mood.useCatch && profile.eye !== "dead-null") set(inner, eyeY, M.eyeCatch);
  };

  const leftHeavy = massSide < 0 || asym < 0;
  const rightHeavy = massSide > 0 || asym > 0;
  drawEmotiveEye(eyeLeftX, -1, leftHeavy);
  drawEmotiveEye(eyeRightX, 1, rightHeavy);
}

/** Grouped mass + directional spikes — controlled aggression (hierarchy #4). */
function drawSideMass(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  hairSide: number,
  lineageId: number,
): void {
  const { fillRect, triangle } = draw;
  const { cx, top } = G;
  const hairColor = M.skullShadow;
  const hairDark = M.skullDeep;
  const beat = lineageId % 5;
  const originX = cx + hairSide * 5;
  const capW = 5;

  fillRect(originX - (hairSide < 0 ? capW : 0), top + 1, capW, 6, hairColor);

  triangle(
    [originX - (hairSide < 0 ? capW - 1 : 0), top + 6],
    [originX + (hairSide < 0 ? 0 : capW - 1), top + 5],
    [originX + hairSide * 4, top - 4 - (beat % 2)],
    hairColor,
  );

  const secRoot = originX + hairSide * (1 + (beat % 2));
  triangle(
    [secRoot - (hairSide < 0 ? 2 : 0), top + 4],
    [secRoot + (hairSide < 0 ? 0 : 2), top + 3],
    [secRoot + hairSide * 3, top - 2],
    hairDark,
  );

  const colX = cx + hairSide * 10;
  fillRect(colX - (hairSide < 0 ? 2 : 0), top + 5, 2, 10, hairDark);
}

/** Hoodie frame — weighted folds, face separation (hierarchy #5). */
function drawHoodie(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  massSide: number,
  hoodStyle: CanonicalHeroChromie["hoodStyle"],
): void {
  const { fillRect, set, line } = draw;
  const { cx, top, hw, skullRows: hh, faceHalfW: fh, hoodCrownRows, hoodSidePad } = G;
  const faceL = cx - fh;
  const faceR = cx + fh;
  const hood = M.hoodDeep;
  const hoodRows = Math.min(hh, 20);

  const crestRows = hoodStyle === "high-crest" ? 2 : hoodCrownRows;
  fillRect(cx - hw, top - crestRows, hw * 2 + 1, crestRows, hood);

  for (let y = 0; y < hoodRows; y++) {
    const yy = top + y;
    const sidePad = y < 10 ? hoodSidePad : 1;
    const l = cx - hw - sidePad + (y < 8 && massSide < 0 ? 1 : 0);
    const r = cx + hw + sidePad;
    if (l < faceL) fillRect(l, yy, faceL - l, 1, hood);
    if (r > faceR) fillRect(faceR, yy, r - faceR + 1, 1, hood);
    if (y === 11) {
      if (l < faceL) set(faceL - 1, yy, M.hoodCloth);
      if (r > faceR) set(faceR, yy, M.hoodCloth);
    }
  }

  line(faceL, top + 5, faceL, top + hoodRows - 1, M.hoodRim);
  line(faceR, top + 5, faceR, top + hoodRows - 1, M.hoodRim);
}

function drawShoulders(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  massSide: number,
): void {
  const { fillRect } = draw;
  const { cx, shoulderY0, shoulderY1, chinY } = G;

  fillRect(cx - 9, chinY + 1, 18, 2, M.shoulderMass);
  fillRect(cx - 12, shoulderY0, 24, shoulderY1 - shoulderY0, M.hoodDeep);
  if (massSide < 0) fillRect(cx - 15, shoulderY0 + 2, 4, 6, M.hoodDeep);
  else fillRect(cx + 11, shoulderY0 + 2, 4, 6, M.hoodDeep);
}

/** Chain rhythm — selective highlights, no sparkle noise (hierarchy #6). */
function drawChains(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  chainStyle: CanonicalHeroChromie["chainStyle"],
  profile: MaterialProfile,
): void {
  const { set, line } = draw;
  const { cx } = G;
  const chainY = 53;

  if (chainStyle === "chunk") {
    line(cx - 5, chainY, cx - 2, chainY, M.chainShadow);
    line(cx, chainY, cx + 4, chainY, M.chainShadow);
    set(cx - 3, chainY, M.chainMetal);
    set(cx + 2, chainY, M.chainBright);
    return;
  }

  line(cx - 5, chainY, cx + 5, chainY, M.chainShadow);
  const rhythm = profile.chain === "polished-chrome" ? [-4, -1, 2] : [-3, 0, 3];
  for (let i = 0; i < rhythm.length; i++) {
    const x = cx + rhythm[i]!;
    set(x, chainY, i === 1 ? M.chainBright : M.chainMetal);
  }
  if (chainStyle === "signal-lock") set(cx + 1, chainY - 1, M.chainBright);
}

/** Pixel cinematic grouping — key from upper-right, no gradients. */
function drawCinematicLighting(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  massSide: number,
  pureSkull: boolean,
): void {
  const { set, line, fillRect } = draw;
  const { cx, top, eyeY, hw, chinY, faceHalfW: fh } = G;
  const rimSide = massSide < 0 ? -1 : 1;
  const rimX = cx + rimSide * (hw + 1);

  set(rimX, top + 6, M.skullLight);
  set(rimX, top + 14, M.skullLight);

  if (!pureSkull) {
    set(cx - fh - 1, eyeY - 2, M.hoodRim);
    set(cx + fh, eyeY - 2, M.hoodRim);
  }

  set(cx + massSide * 3, chinY, M.skullDeep);
  line(cx - 8, eyeY + 9, cx - 5, chinY - 2, M.skullShadow);
  line(cx + 8, eyeY + 9, cx + 5, chinY - 2, M.skullShadow);
}

/** Accent marks only — never compete with eyes. */
function drawPhenotypeMark(
  draw: DLockDraw,
  M: DLockMaterials,
  G: typeof D_LOCK_GEOMETRY,
  mark: string,
  hairSide: number,
  massSide: number,
): void {
  const { set, line } = draw;
  const { cx, top, eyeY } = G;
  const accent = M.chainShadow;

  if (mark === "Under-eye Slash") line(cx + hairSide * 8, eyeY + 6, cx + hairSide * 10, eyeY + 8, accent);
  else if (mark === "Forehead Glyph") set(cx + massSide * 12, top + 4, accent);
  else if (mark === "Cheek Pixel") set(cx + massSide * 11, eyeY + 9, accent);
  else if (mark === "Bridge Scar") set(cx, eyeY + 5, accent);
  else if (mark === "Temple Tag") set(cx + massSide * 12, top + 8, accent);
  else set(cx + massSide * 11, top + 9, accent);
}

export function renderChromieDLock(
  id: number,
  lineageId: number,
  traits: Record<string, string | number>,
  draw: DLockDraw,
  options: DLockRenderOptions = {},
): void {
  const G = D_LOCK_GEOMETRY;
  const pureSkull = options.pureSkullTest ?? PURE_SKULL_TEST;
  const hero = options.hero ?? resolveCanonicalHero(lineageId);
  const paletteFamilyId = hero?.paletteFamilyId ?? options.paletteFamilyId ?? "signal";
  const built = options.materials && options.materialProfile
    ? { materials: options.materials, profile: options.materialProfile }
    : buildMaterialsForLineage(paletteFamilyId, lineageId, hero);
  const M = built.materials;
  const profile = built.profile;

  const massSide = hero?.hairSide ?? ((lineageId & 1) === 0 ? -1 : 1);
  const hairSide = id === 4354 ? 1 : massSide;
  const mark = hero?.mark ?? (traits.Mark as string) ?? "Temple Tag";
  const hoodStyle = hero?.hoodStyle ?? "standard";
  const chainStyle = hero?.chainStyle ?? "bar";

  if (!pureSkull) drawShoulders(draw, M, G, massSide);

  drawSkullBase(draw, M, G, massSide);
  drawFacialPlanes(draw, M, G, massSide);
  drawIntegratedMask(draw, M, profile, G, massSide);

  if (!pureSkull) {
    drawSideMass(draw, M, G, hairSide, lineageId);
    drawHoodie(draw, M, G, massSide, hoodStyle);
    drawCinematicLighting(draw, M, G, massSide, pureSkull);
    drawChains(draw, M, G, chainStyle, profile);
  }

  drawEyeBand(draw, M, profile, G, massSide);
  drawPhenotypeMark(draw, M, G, mark, hairSide, massSide);

  traits.MassSide = massSide < 0 ? "Left" : "Right";
  traits.Hoodie = pureSkull ? "—" : profile.hoodie;
  traits.Chains = pureSkull ? "—" : profile.chain;
  traits.MaskMaterial = profile.mask;
  traits.EyeMaterial = profile.eye;
  traits.Materials = profile.label;
  traits.Doctrine = "D-Lock";
  traits.Canon = D_LOCK_CANON_PATH;
  traits.PureSkullTest = pureSkull ? "on" : "off";
  traits.FacialPlanes = "architected";
  traits.Phase = "intensity-restoration";
  if (hero) {
    traits.Hero = hero.label;
    traits.Archetype = hero.label;
    traits.EmotionalSignal = hero.emotionalSignal;
  }
}

export { getDLockMaterials, buildMaterialsForLineage, semanticFromMaterials } from "./dLockMaterials";
export {
  CANONICAL_HERO_CHROMIES,
  resolveCanonicalHero,
  resolveCanonicalHeroByKey,
} from "./dLockHeroes";
export type { CanonicalHeroChromie } from "./dLockHeroes";
export type { DLockMaterials } from "./dLockMaterials";
export type { MaterialProfile, MaskMaterial, HoodieMaterial, ChainMaterial, EyeMaterial } from "./dLockMaterialProfiles";
