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

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image file."));
    };
    img.src = url;
  });
}

function centerCropSquare(img) {
  const size = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - size) / 2);
  const sy = Math.floor((img.height - size) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, size: 0 };
  ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
  return { canvas, size };
}

function resizeNearestNeighbor(sourceCanvas, sourceSize) {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, sourceSize, sourceSize, 0, 0, GRID, GRID);
  return ctx.getImageData(0, 0, GRID, GRID);
}

function resizeAverageColor(sourceCanvas, sourceSize) {
  const srcCtx = sourceCanvas.getContext("2d");
  if (!srcCtx) return null;
  const src = srcCtx.getImageData(0, 0, sourceSize, sourceSize);
  const out = new ImageData(GRID, GRID);
  const scale = sourceSize / GRID;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const x0 = Math.floor(x * scale);
      const y0 = Math.floor(y * scale);
      const x1 = Math.min(sourceSize, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
      const y1 = Math.min(sourceSize, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sourceSize + sx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
          n++;
        }
      }
      const j = (y * GRID + x) * 4;
      out.data[j] = Math.round(r / n);
      out.data[j + 1] = Math.round(g / n);
      out.data[j + 2] = Math.round(b / n);
      out.data[j + 3] = Math.round(a / n);
    }
  }
  return out;
}

function quantizeImageData(imageData, paletteColors) {
  const indices = new Uint8Array(GRID * GRID);
  for (let i = 0; i < GRID * GRID; i++) {
    const j = i * 4;
    indices[i] = nearestPaletteIndex(
      imageData.data[j],
      imageData.data[j + 1],
      imageData.data[j + 2],
      imageData.data[j + 3],
      paletteColors,
    );
  }
  return indices;
}

/** Center-crop, resize to 64×64, and quantize to palette indices. */
export function processImportImage(img, paletteColors, method = "nearest") {
  const { canvas: cropped, size } = centerCropSquare(img);
  if (!size) {
    return { indices: new Uint8Array(GRID * GRID), resized: null };
  }
  const resized =
    method === "average"
      ? resizeAverageColor(cropped, size)
      : resizeNearestNeighbor(cropped, size);
  if (!resized) {
    return { indices: new Uint8Array(GRID * GRID), resized: null };
  }
  const indices = quantizeImageData(resized, paletteColors);
  return { indices, resized };
}

const PREVIEW_SCALE = 4;

export function imageDataToPreviewUrl(imageData, scale = PREVIEW_SCALE) {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(imageData, 0, 0);
  const out = document.createElement("canvas");
  out.width = GRID * scale;
  out.height = GRID * scale;
  const outCtx = out.getContext("2d");
  if (!outCtx) return "";
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(canvas, 0, 0, GRID * scale, GRID * scale);
  return out.toDataURL("image/png");
}

export function indicesToPreviewUrl(indices, paletteColors, scale = PREVIEW_SCALE) {
  const canvas = document.createElement("canvas");
  canvas.width = DISPLAY_SIZE;
  canvas.height = DISPLAY_SIZE;
  drawIndicesToCanvas(canvas, indices, paletteColors);
  const out = document.createElement("canvas");
  out.width = GRID * scale;
  out.height = GRID * scale;
  const outCtx = out.getContext("2d");
  if (!outCtx) return "";
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(canvas, 0, 0, GRID * scale, GRID * scale);
  return out.toDataURL("image/png");
}
