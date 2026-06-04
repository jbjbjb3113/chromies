import { generateDLockChromie, CHROMIE_GRID } from "./chromieGenerate";
import { CANONICAL_HERO_CHROMIES } from "./dLockHeroes";
import { PALETTE_FAMILY_LIST, type PaletteFamilyId } from "./paletteFamilies";
import { validateSpeciesCompression } from "./speciesCompressionQa";

export let WALL_PREVIEW_MODE = false;

export function setWallPreviewMode(enabled: boolean): void {
  WALL_PREVIEW_MODE = enabled;
}

export type WallSize = 20 | 50 | 100;

export type WallCell = {
  normieId: number;
  buf: Uint8Array;
  palette: { colors: string[] };
  traits: Record<string, string | number>;
  massSide: number;
  qaPass: boolean;
  qaFailures: string[];
  isHero: boolean;
};

export type CollectionWallResult = {
  count: WallSize;
  cols: number;
  cells: WallCell[];
  passCount: number;
  failCount: number;
  heroCount: number;
};

function buildWallNormieIds(count: number): number[] {
  const heroIds = CANONICAL_HERO_CHROMIES.map((h) => h.normieId);
  const ids: number[] = [];
  for (const hid of heroIds) {
    if (ids.length < count) ids.push(hid);
  }
  let cursor = 101;
  while (ids.length < count) {
    const id = cursor;
    cursor = (cursor * 17 + 43) % 9900 + 100;
    if (!heroIds.includes(id)) ids.push(id);
  }
  return ids.slice(0, count);
}

function colsForCount(count: WallSize): number {
  if (count <= 20) return 5;
  if (count <= 50) return 10;
  return 10;
}

export function generateCollectionWall(count: WallSize): CollectionWallResult {
  const normieIds = buildWallNormieIds(count);
  const heroSet = new Set(CANONICAL_HERO_CHROMIES.map((h) => h.normieId));
  const cells: WallCell[] = [];
  let passCount = 0;
  let heroCount = 0;

  for (let i = 0; i < normieIds.length; i++) {
    const normieId = normieIds[i]!;
    const isHero = heroSet.has(normieId);
    const paletteFamilyId: PaletteFamilyId = isHero
      ? CANONICAL_HERO_CHROMIES.find((h) => h.normieId === normieId)!.paletteFamilyId
      : PALETTE_FAMILY_LIST[(normieId + i) % PALETTE_FAMILY_LIST.length]!.id;

    const token = generateDLockChromie(normieId, { paletteFamilyId });
    const qa = validateSpeciesCompression(token.buf, token.massSide);
    if (qa.pass) passCount++;

    cells.push({
      normieId,
      buf: token.buf,
      palette: token.palette,
      traits: token.traits,
      massSide: token.massSide,
      qaPass: qa.pass,
      qaFailures: qa.failures,
      isHero,
    });
    if (isHero) heroCount++;
  }

  return {
    count,
    cols: colsForCount(count),
    cells,
    passCount,
    failCount: count - passCount,
    heroCount,
  };
}

/** Composite wall cells into one SVG (crisp edges). */
export function renderWallSvg(
  wall: CollectionWallResult,
  { cellPx = 64, gap = 2 }: { cellPx?: number; gap?: number } = {},
): string {
  const cols = wall.cols;
  const rows = Math.ceil(wall.cells.length / cols);
  const w = cols * cellPx + (cols - 1) * gap;
  const h = rows * cellPx + (rows - 1) * gap;
  let body = "";

  for (let i = 0; i < wall.cells.length; i++) {
    const cell = wall.cells[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * (cellPx + gap);
    const oy = row * (cellPx + gap);
    const scale = cellPx / CHROMIE_GRID;
    const border = cell.isHero ? "#ff5470" : cell.qaPass ? "#34312d" : "#8b2020";

    body += `<rect x="${ox - 1}" y="${oy - 1}" width="${cellPx + 2}" height="${cellPx + 2}" fill="${border}"/>`;

    for (let y = 0; y < CHROMIE_GRID; y++) {
      let x = 0;
      while (x < CHROMIE_GRID) {
        const idx = cell.buf[y * CHROMIE_GRID + x]!;
        let run = 1;
        while (x + run < CHROMIE_GRID && cell.buf[y * CHROMIE_GRID + x + run] === idx) run++;
        if (idx > 0) {
          body += `<rect x="${ox + x * scale}" y="${oy + y * scale}" width="${run * scale}" height="${scale}" fill="${cell.palette.colors[idx]}"/>`;
        }
        x += run;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
}
