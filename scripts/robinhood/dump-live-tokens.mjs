#!/usr/bin/env node
// Dumps all 100 live commemorative tokens straight from the on-chain
// ChromaRendererRobinhood (bypasses ChromiesCommemorative's tokenURI ownership
// gate -- renderer.tokenURI(id) reads directly from seeded storage and needs
// no minted token) into reports/robinhood/live-tokens-redo/:
//   chromie-NNN.png      -- decoded inner PNG, 64x64
//   chromie-NNN_4x.png   -- nearest-neighbor 4x upscale, 256x256
//   chromie-NNN_8x.png   -- nearest-neighbor 8x upscale, 512x512
//   contact-sheet-100.png -- 10x10 grid, 6x per-cell scale (384px cells, 3840x3840)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { createPublicClient, http } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");

function loadEnvVar(name) {
  const content = fs.readFileSync(path.join(REPO, ".env"), "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && m[1].trim() === name) return m[2].trim();
  }
  return undefined;
}

const RENDERER_ADDRESS = "0x9C34Bd0c872983e33611f0cF1cF3C1C968516736";
const OUT_DIR = path.join(REPO, "reports", "robinhood", "live-tokens-redo");
fs.mkdirSync(OUT_DIR, { recursive: true });

const ABI = [
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
];

function decodePng(uri) {
  const b64 = uri.split(",", 2)[1];
  const doc = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  const image = doc.image;
  const svgB64 = image.split(",", 2)[1];
  const svg = Buffer.from(svgB64, "base64").toString("utf8");
  const m = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error("no embedded PNG found in SVG shell");
  return Buffer.from(m[1], "base64");
}

async function main() {
  const rpcUrl = loadEnvVar("ALCHEMY_RH_MAINNET_URL");
  if (!rpcUrl) throw new Error("ALCHEMY_RH_MAINNET_URL not found in .env");
  const client = createPublicClient({ transport: http(rpcUrl) });

  const CELL = 384; // 64 * 6
  const GRID = 10;
  const sheet = sharp({
    create: { width: CELL * GRID, height: CELL * GRID, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  });
  const composites = [];

  for (let id = 1; id <= 100; id++) {
    const uri = await client.readContract({
      address: RENDERER_ADDRESS,
      abi: ABI,
      functionName: "tokenURI",
      args: [BigInt(id)],
    });
    const pngBuf = decodePng(uri);
    const nnn = String(id).padStart(3, "0");

    const basePath = path.join(OUT_DIR, `chromie-${nnn}.png`);
    fs.writeFileSync(basePath, pngBuf);

    const up4 = await sharp(pngBuf, { limitInputPixels: false })
      .resize(256, 256, { kernel: "nearest" })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(OUT_DIR, `chromie-${nnn}_4x.png`), up4);

    const up8 = await sharp(pngBuf, { limitInputPixels: false })
      .resize(512, 512, { kernel: "nearest" })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(OUT_DIR, `chromie-${nnn}_8x.png`), up8);

    const cellBuf = await sharp(pngBuf, { limitInputPixels: false })
      .resize(CELL, CELL, { kernel: "nearest" })
      .png()
      .toBuffer();
    const idx = id - 1;
    const row = Math.floor(idx / GRID);
    const col = idx % GRID;
    composites.push({ input: cellBuf, left: col * CELL, top: row * CELL });

    console.log(`  #${id} done`);
  }

  const sheetBuf = await sheet.composite(composites).png().toBuffer();
  const sheetPath = path.join(OUT_DIR, "contact-sheet-100.png");
  fs.writeFileSync(sheetPath, sheetBuf);

  console.log(`\nWrote ${100} tokens (64px + 4x + 8x) to ${OUT_DIR}`);
  console.log(`Contact sheet: ${sheetPath} (${CELL * GRID}x${CELL * GRID}, 10x10 grid, 6x per cell)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
