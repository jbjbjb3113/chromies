import { GRID } from "./chromie-token.js";

export const CANVAS_SCALE = 8;
export const DISPLAY_SIZE = GRID * CANVAS_SCALE;

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function colorDist2(r, g, b, hex) {
  const [pr, pg, pb] = hexToRgb(hex);
  const dr = r - pr;
  const dg = g - pg;
  const db = b - pb;
  return dr * dr + dg * dg + db * db;
}

export function nearestPaletteIndex(r, g, b, a, paletteColors) {
  if (a < 128) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < paletteColors.length; i++) {
    const d = colorDist2(r, g, b, paletteColors[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function loadTokenPixelIndices(image, paletteColors) {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Uint8Array(GRID * GRID);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, GRID, GRID);
  const { data } = ctx.getImageData(0, 0, GRID, GRID);
  const indices = new Uint8Array(GRID * GRID);
  for (let i = 0; i < GRID * GRID; i++) {
    const j = i * 4;
    indices[i] = nearestPaletteIndex(
      data[j],
      data[j + 1],
      data[j + 2],
      data[j + 3],
      paletteColors,
    );
  }
  return indices;
}

export function cloneIndices(indices) {
  return new Uint8Array(indices);
}

export function indicesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function countDiff(indices, original) {
  let n = 0;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== original[i]) n++;
  }
  return n;
}

export function floodFill(indices, x, y, newIndex, grid = GRID) {
  const i = y * grid + x;
  const target = indices[i];
  if (target === newIndex) return indices;
  const out = cloneIndices(indices);
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= grid || cy >= grid) continue;
    const ci = cy * grid + cx;
    if (out[ci] !== target) continue;
    out[ci] = newIndex;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return out;
}

export function paintPixel(indices, x, y, index, grid = GRID) {
  const out = cloneIndices(indices);
  out[y * grid + x] = index;
  return out;
}

export function drawIndicesToCanvas(
  canvas,
  indices,
  paletteColors,
  { original = null, showDiff = false } = {},
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const diffColor = hexToRgb("#ff2d8a");

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const idx = indices[i];
      const [r, g, b] = hexToRgb(paletteColors[idx] ?? paletteColors[0]);

      const px = x * CANVAS_SCALE;
      const py = y * CANVAS_SCALE;

      if (showDiff && original && indices[i] !== original[i]) {
        ctx.fillStyle = `rgb(${diffColor[0]}, ${diffColor[1]}, ${diffColor[2]})`;
        ctx.fillRect(px, py, CANVAS_SCALE, CANVAS_SCALE);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
        ctx.fillRect(px + 1, py + 1, CANVAS_SCALE - 2, CANVAS_SCALE - 2);
      } else {
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(px, py, CANVAS_SCALE, CANVAS_SCALE);
      }
    }
  }
}

/** Run-length encoded SVG — matches art-pipeline/generate.js renderSVG. */
export function renderIndicesSvg(indices, paletteColors, grid = GRID) {
  const cell = 1000 / grid;
  let body = "";
  for (let y = 0; y < grid; y++) {
    let x = 0;
    while (x < grid) {
      const idx = indices[y * grid + x];
      let run = 1;
      while (x + run < grid && indices[y * grid + x + run] === idx) run++;
      if (idx !== 0) {
        const hex = paletteColors[idx] ?? paletteColors[0];
        body += `<rect x="${x * cell}" y="${y * cell}" width="${run * cell}" height="${cell}" fill="${hex}"/>`;
      }
      x += run;
    }
  }
  const bg = paletteColors[0] ?? "#000000";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" shape-rendering="crispEdges"><rect width="1000" height="1000" fill="${bg}"/>${body}</svg>`;
}

export function downloadIndicesSvg(indices, paletteColors, filename) {
  const svg = renderIndicesSvg(indices, paletteColors);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportIndicesPng(indices, paletteColors) {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  const img = ctx.createImageData(GRID, GRID);
  for (let i = 0; i < GRID * GRID; i++) {
    const [r, g, b] = hexToRgb(paletteColors[indices[i]] ?? paletteColors[0]);
    const j = i * 4;
    img.data[j] = r;
    img.data[j + 1] = g;
    img.data[j + 2] = b;
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export function canvasCoordsFromEvent(canvas, clientX, clientY) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.floor(((clientX - rect.left) / rect.width) * GRID);
  const y = Math.floor(((clientY - rect.top) / rect.height) * GRID);
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
  return { x, y };
}
