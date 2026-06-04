import { paletteFamilyToMirrorPalette, resolvePaletteFamilyId, type PaletteFamilyId } from "./paletteFamilies";
import { renderChromieDLock, D_LOCK_GEOMETRY, type DLockDraw } from "./dLockDoctrine";
import { resolveCanonicalHero } from "./dLockHeroes";
import { getDLockMaterials } from "./dLockMaterials";
import { resolveMaterialProfile } from "./dLockMaterialProfiles";
import type { MirrorPalette } from "./mirror";

const GRID = 64;
const PX = GRID * GRID;

function makeBuffer(): DLockDraw & { buf: Uint8Array } {
  const buf = new Uint8Array(PX);
  const set = (x: number, y: number, v: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    buf[y * GRID + x] = Math.max(0, Math.min(15, v));
  };
  const fillRect = (x0: number, y0: number, w: number, h: number, v: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, v);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, v: number) => {
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
  const triangle = (a: [number, number], b: [number, number], c: [number, number], v: number) => {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(GRID - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(GRID - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (p1: [number, number], p2: [number, number], p3: [number, number]) =>
      p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1]);
    const A = area(a, b, c);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p: [number, number] = [x + 0.5, y + 0.5];
        const w1 = area(p, b, c) / A;
        const w2 = area(a, p, c) / A;
        const w3 = area(a, b, p) / A;
        if (w1 >= 0 && w2 >= 0 && w3 >= 0) set(x, y, v);
      }
    }
  };
  return { buf, set, fillRect, line, triangle };
}

export type GeneratedDLockChromie = {
  buf: Uint8Array;
  palette: MirrorPalette;
  paletteId: number;
  traits: Record<string, string | number>;
  massSide: number;
};

export function generateDLockChromie(
  normieId: number,
  {
    paletteFamilyId,
    pureSkullTest = false,
  }: { paletteFamilyId?: PaletteFamilyId; pureSkullTest?: boolean } = {},
): GeneratedDLockChromie {
  const hero = resolveCanonicalHero(normieId);
  const familyId = hero?.paletteFamilyId ?? paletteFamilyId ?? resolvePaletteFamilyId(normieId);
  const palette = paletteFamilyToMirrorPalette(familyId);
  const profile = resolveMaterialProfile(normieId, familyId, hero);
  const M = getDLockMaterials(familyId, profile);

  const traits: Record<string, string | number> = {
    Mode: "Chromie Species",
    PaletteFamily: palette.name,
    MaskMaterial: profile.mask,
    HoodieMaterial: profile.hoodie,
    ChainMaterial: profile.chain,
    EyeMaterial: profile.eye,
    Materials: profile.label,
  };

  const draw = makeBuffer();
  renderChromieDLock(normieId, normieId, traits, draw, {
    pureSkullTest,
    paletteFamilyId: familyId,
    hero,
    materials: M,
    materialProfile: profile,
  });

  const massSide = hero?.hairSide ?? ((normieId & 1) === 0 ? -1 : 1);

  return {
    buf: draw.buf,
    palette,
    paletteId: palette.id,
    traits,
    massSide,
  };
}

export { GRID as CHROMIE_GRID, PX as CHROMIE_PX, D_LOCK_GEOMETRY };
