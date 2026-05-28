import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PALETTES } from "../api/palettes";

const GRID = 64;
const SIZE = 1024;

type TokenRow = {
  tokenId: number;
  traits: {
    paletteId: number;
  };
  buffer: `0x${string}`;
};

function decodePacked4bpp(bufferHex: `0x${string}`): Uint8Array {
  const packed = Buffer.from(bufferHex.slice(2), "hex");
  if (packed.length !== 2048) throw new Error(`Expected 2048 bytes, got ${packed.length}`);

  const out = new Uint8Array(4096);
  for (let i = 0; i < packed.length; i++) {
    const b = packed[i]!;
    out[i * 2] = (b >> 4) & 0x0f;
    out[i * 2 + 1] = b & 0x0f;
  }
  return out;
}

function renderReference(buf: Uint8Array, palette: { colors: string[] }): string {
  const cell = SIZE / GRID;
  let body = "";
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const idx = buf[y * GRID + x]!;
      let run = 1;
      while (x + run < GRID && buf[y * GRID + x + run] === idx) run++;
      if (idx !== 0) {
        body += `<rect x="${x * cell}" y="${y * cell}" width="${run * cell}" height="${cell}" fill="${palette.colors[idx]}"/>`;
      }
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges"><rect width="${SIZE}" height="${SIZE}" fill="${palette.colors[0]}"/>${body}</svg>`;
}

function renderChromaRendererEquivalent(buf: Uint8Array, palette: { colors: string[] }): string {
  // Mirrors current ChromaRenderer renderSVG behavior and output formatting.
  let body = "";
  for (let y = 0; y < GRID; ++y) {
    let x = 0;
    while (x < GRID) {
      const idx = buf[y * GRID + x]!;
      let run = 1;
      while (x + run < GRID && buf[y * GRID + x + run] === idx) ++run;

      if (idx !== 0) {
        body += `<rect x="${x * 16}" y="${y * 16}" width="${run * 16}" height="16" fill="${palette.colors[idx]}"/>`;
      }
      x += run;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><rect width="1024" height="1024" fill="${palette.colors[0]}"/>${body}</svg>`;
}

async function main(): Promise<void> {
  const collectionPath = resolve(process.cwd(), "generated/chroma-collection.jsonl");
  const outputDir = resolve(process.cwd(), "generated");
  const referenceSvgPath = resolve(outputDir, "token0.reference.svg");
  const contractSvgPath = resolve(outputDir, "token0.chromaRenderer.svg");
  const decodedPath = resolve(outputDir, "token0.decoded-nibbles.txt");

  const content = await readFile(collectionPath, "utf8");
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) throw new Error("generated/chroma-collection.jsonl is empty.");

  const token0 = JSON.parse(firstLine) as TokenRow;
  if (token0.tokenId !== 0) throw new Error(`Expected first row tokenId=0, got ${token0.tokenId}`);

  const palette = PALETTES[token0.traits.paletteId];
  if (!palette) throw new Error(`Missing palette for id ${token0.traits.paletteId}`);

  const decoded = decodePacked4bpp(token0.buffer);
  const decodedHexNibbles = Array.from(decoded, (v) => v.toString(16).toUpperCase()).join("");

  const referenceSvg = renderReference(decoded, palette);
  const contractSvg = renderChromaRendererEquivalent(decoded, palette);
  const identical = referenceSvg === contractSvg;

  await mkdir(outputDir, { recursive: true });
  await writeFile(referenceSvgPath, referenceSvg, "utf8");
  await writeFile(contractSvgPath, contractSvg, "utf8");
  await writeFile(decodedPath, decodedHexNibbles, "utf8");

  console.log(`Token: ${token0.tokenId}`);
  console.log(`Palette: ${token0.traits.paletteId} (${palette.name})`);
  console.log(`Decoded nibble length: ${decodedHexNibbles.length}`);
  console.log(`Reference SVG: ${referenceSvgPath}`);
  console.log(`Renderer SVG: ${contractSvgPath}`);
  console.log(`Byte-for-byte identical: ${identical ? "YES" : "NO"}`);

  if (!identical) {
    throw new Error("SVG mismatch between ChromaRenderer-equivalent and PixelChroma reference.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
