// ============================================================================
// upload-ipfs-collection.js
// Build provider-agnostic IPFS collection output from mint-data.json.
//
// Generates per-token PNG (64 + 1024), ERC-721 metadata JSON, and a manifest.
// Upload is modular — plug in your own pin/host service via upload-providers/.
//
// USAGE:
//   node upload-ipfs-collection.js
//   node upload-ipfs-collection.js --out ./output/ipfs-collection
//   node upload-ipfs-collection.js --upload pinata   # if provider module exists + env set
//   node upload-ipfs-collection.js --upload local    # copies to public/ipfs-collection/
//
// OUTPUTS:
//   output/ipfs-collection/
//     images/0001.png
//     images/0001_1024.png
//     metadata/0001.json
//     manifest.json
//     base-uri.txt
//     UPLOAD.md
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const keccak256 = require("keccak256");
const { PALETTES, SETTINGS } = require("./chromies-config");
const { buildCharacterDecoderTable } = require("./on-chain-character-bytes");

const GRID = SETTINGS.grid;
const MINT_DATA_PATH = path.join(__dirname, "output", "mint-data.json");
const MERKLE_ROOT_PATH = path.join(__dirname, "output", "reveal-merkle-root.txt");
const DEFAULT_OUT = path.join(__dirname, "output", "ipfs-collection");

const PALETTE_NAMES = [
  "SIGNAL", "ACID", "CYAN", "GHOST", "BLOOD", "MOSS",
  "SIGNAL_BLONDE", "SIGNAL_GREY", "SIGNAL_RED",
  "ACID_BLONDE", "ACID_GREY", "ACID_RED",
  "CYAN_BLONDE", "CYAN_GREY", "CYAN_RED",
  "GHOST_BLONDE", "GHOST_GREY", "GHOST_RED",
  "BLOOD_BLONDE", "BLOOD_GREY", "BLOOD_RED",
  "MOSS_BLONDE", "MOSS_GREY", "MOSS_RED",
  "CAT", "ALIEN", "ZOMBIE", "AGENT",
];
const HOOD = ["None", "Classic"];
const SHIRT = ["None", "Crew", "Tank", "Tank_Female"];
const BODY = ["None", "Default", "Female", "Female_Tank", "Alien", "Tank", "Zombie"];
const BODYTATTOO = ["None", "UnderArmour", "AkuHeart", "Pyramid", "Normies"];
const NECKLACE = [
  "None", "Male_Chain", "Female_Chain", "Female_Ornate", "Female_Flower",
  "Female_UpsideDownCross", "Female_Opal", "Male_Chromies", "Male_HappyFace",
  "Male_Normies", "Male_Pendent",
];
const TATTOO = ["None", "Signal", "Thug", "Marks", "Scar"];
const MASK = ["None"];
const BEARD = ["None", "Full", "Goat"];
const MUSTACHE = ["None", "Thick"];
const EYES = ["Signal", "BlackEye", "MakeUp", "RunningMascara", "Stoned", "Alien"];
const GLASSES = ["None", "Shades", "Neo", "VR"];
const HAIR = [
  "None", "Mohawk", "Pompadour", "MrT", "Afro", "Dreads", "Surfer", "FadeRight", "AZVet", "Buns",
];
const TRAIT_TABLES = [
  { trait_type: "Character", table: buildCharacterDecoderTable() },
  { trait_type: "Palette", table: PALETTE_NAMES },
  { trait_type: "Hood", table: HOOD },
  { trait_type: "Shirt", table: SHIRT },
  { trait_type: "Body", table: BODY },
  { trait_type: "Bodytattoo", table: BODYTATTOO },
  { trait_type: "Necklace", table: NECKLACE },
  { trait_type: "Tattoo", table: TATTOO },
  { trait_type: "Mask", table: MASK },
  { trait_type: "Beard", table: BEARD },
  { trait_type: "Mustache", table: MUSTACHE },
  { trait_type: "Eyes", table: EYES },
  { trait_type: "Glasses", table: GLASSES },
  { trait_type: "Hair", table: HAIR },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { outDir: DEFAULT_OUT, upload: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") result.outDir = path.resolve(args[++i]);
    else if (args[i] === "--upload") result.upload = args[++i];
  }
  return result;
}

function formatTokenId(id) {
  return String(id).padStart(4, "0");
}

function encodeUint256(value) {
  const buf = Buffer.alloc(32);
  let v = BigInt(value);
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

function leafHash(tokenId, pixelsHex, traitsHex) {
  const pixels = Buffer.from(pixelsHex.replace(/^0x/i, ""), "hex");
  const traits = Buffer.from(traitsHex.replace(/^0x/i, ""), "hex");
  return keccak256(Buffer.concat([encodeUint256(tokenId), pixels, traits]));
}

function unpackPixels(hex) {
  const packed = Buffer.from(hex.replace(/^0x/i, ""), "hex");
  const out = new Uint8Array(GRID * GRID);
  for (let i = 0; i < out.length; i++) {
    const byteIndex = i >> 1;
    out[i] = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
  }
  return out;
}

function paletteForTraits(traitsHex) {
  const paletteByte = parseInt(traitsHex.replace(/^0x/i, "").slice(2, 4), 16);
  const name = PALETTE_NAMES[paletteByte] ?? "SIGNAL";
  const family = name.split("_")[0];
  return PALETTES[family] ?? PALETTES.SIGNAL;
}

function renderPNG(indices, palette) {
  const png = new PNG({ width: GRID, height: GRID });
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = indices[y * GRID + x];
      const hex = palette.colors[idx];
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const o = (y * GRID + x) * 4;
      png.data[o] = r;
      png.data[o + 1] = g;
      png.data[o + 2] = b;
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function upscalePNG(srcBuf, scale) {
  const src = PNG.sync.read(srcBuf);
  const dst = new PNG({ width: src.width * scale, height: src.height * scale });
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const so = (sy * src.width + sx) * 4;
      const doff = (y * dst.width + x) * 4;
      dst.data[doff] = src.data[so];
      dst.data[doff + 1] = src.data[so + 1];
      dst.data[doff + 2] = src.data[so + 2];
      dst.data[doff + 3] = 255;
    }
  }
  return PNG.sync.write(dst);
}

function decodeTraits(traitsHex) {
  const bytes = Buffer.from(traitsHex.replace(/^0x/i, ""), "hex");
  return TRAIT_TABLES.map((slot, i) => {
    const val = bytes[i];
    const label = slot.table[val] ?? `unknown(${val})`;
    return { trait_type: slot.trait_type, value: label };
  });
}

function totalPixelsFromTraits(traitsHex) {
  const bytes = Buffer.from(traitsHex.replace(/^0x/i, ""), "hex");
  return (bytes[17] << 8) | bytes[18];
}

function buildMetadata(record, imageFileName) {
  const id = formatTokenId(record.tokenId);
  const attributes = decodeTraits(record.traitsHex);
  attributes.push({
    display_type: "number",
    trait_type: "Total Pixels",
    value: totalPixelsFromTraits(record.traitsHex),
  });
  return {
    name: `Chromie #${id}`,
    description:
      "Chromie — revealed off-chain. Inscribe on Ethereum for permanent on-chain pixel storage.",
    image: `images/${imageFileName}`,
    attributes,
    properties: {
      tokenId: record.tokenId,
      status: "revealed",
      inscribed: false,
    },
  };
}

function ensureCleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function writeUploadInstructions(outDir) {
  const text = `# IPFS Collection Upload

This folder was generated by \`upload-ipfs-collection.js\`.

## Contents
- \`images/\` — 64×64 and 1024×1024 PNG per token
- \`metadata/\` — ERC-721 JSON per token (\`0001.json\`, …)
- \`manifest.json\` — file index + merkle verification hashes
- \`base-uri.txt\` — placeholder for your hosted base URI

## Upload (provider-agnostic)

1. Pin or upload the **entire** \`ipfs-collection/\` directory to your host.
2. Note the content root CID or HTTPS base URL.
3. Set contract \`revealedBaseURI\`:
   - IPFS: \`ipfs://<CID>/metadata/\`
   - HTTPS mirror: \`https://your-domain/ipfs/<CID>/metadata/\`

## Optional provider modules

Add a file under \`upload-providers/<name>.js\` exporting:

\`\`\`js
async function uploadCollection({ outDir, manifest }) {
  return { baseUri: "ipfs://Qm…/metadata/", rootCid: "Qm…" };
}
module.exports = { uploadCollection };
\`\`\`

Then run: \`node upload-ipfs-collection.js --upload <name>\`
`;
  fs.writeFileSync(path.join(outDir, "UPLOAD.md"), text);
}

async function runUploadProvider(name, outDir, manifest) {
  const providerPath = path.join(__dirname, "upload-providers", `${name}.js`);
  if (!fs.existsSync(providerPath)) {
    console.error(`Upload provider not found: ${providerPath}`);
    console.error("Create upload-providers/<name>.js or use --upload local");
    process.exit(1);
  }
  const provider = require(providerPath);
  if (typeof provider.uploadCollection !== "function") {
    throw new Error(`Provider ${name} must export uploadCollection()`);
  }
  return provider.uploadCollection({ outDir, manifest });
}

async function main() {
  const { outDir, upload } = parseArgs();

  if (!fs.existsSync(MINT_DATA_PATH)) {
    console.error(`Missing ${MINT_DATA_PATH} — run bridge-mint-data.js first`);
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
  const expectedRoot = fs.existsSync(MERKLE_ROOT_PATH)
    ? fs.readFileSync(MERKLE_ROOT_PATH, "utf8").trim()
    : null;

  const imagesDir = path.join(outDir, "images");
  const metadataDir = path.join(outDir, "metadata");
  ensureCleanDir(outDir);
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(metadataDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    tokenCount: records.length,
    merkleRoot: expectedRoot,
    imageScale: { native: 64, display: 1024 },
    tokens: {},
  };

  console.log(`Building IPFS collection for ${records.length} tokens → ${outDir}`);

  for (const record of records) {
    const id = formatTokenId(record.tokenId);
    const indices = unpackPixels(record.pixelsHex);
    const palette = paletteForTraits(record.traitsHex);
    const png64 = renderPNG(indices, palette);
    const png1024 = upscalePNG(png64, 16);

    const image64 = `${id}.png`;
    const image1024 = `${id}_1024.png`;
    fs.writeFileSync(path.join(imagesDir, image64), png64);
    fs.writeFileSync(path.join(imagesDir, image1024), png1024);

    const metadata = buildMetadata(record, image1024);
    fs.writeFileSync(
      path.join(metadataDir, `${id}.json`),
      JSON.stringify(metadata, null, 2) + "\n",
    );

    manifest.tokens[String(record.tokenId)] = {
      id,
      leaf: `0x${leafHash(record.tokenId, record.pixelsHex, record.traitsHex).toString("hex")}`,
      image64: `images/${image64}`,
      image1024: `images/${image1024}`,
      metadata: `metadata/${id}.json`,
    };
  }

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "base-uri.txt"),
    "ipfs://<YOUR_CID>/metadata/\n",
  );
  writeUploadInstructions(outDir);

  console.log(`Wrote ${records.length} images + metadata files`);
  console.log(`Manifest: ${path.join(outDir, "manifest.json")}`);

  if (upload === "local") {
    const publicDir = path.join(__dirname, "..", "public", "ipfs-collection");
    ensureCleanDir(publicDir);
    fs.cpSync(outDir, publicDir, { recursive: true });
    const httpsBase = "https://chromies.art/ipfs-collection/metadata/";
    fs.writeFileSync(path.join(outDir, "base-uri.txt"), httpsBase + "\n");
    console.log(`Copied to ${publicDir}`);
    console.log(`Suggested revealedBaseURI: ${httpsBase}`);
  } else if (upload) {
    const result = await runUploadProvider(upload, outDir, manifest);
    if (result?.baseUri) {
      fs.writeFileSync(path.join(outDir, "base-uri.txt"), result.baseUri + "\n");
      console.log(`Upload complete. baseUri: ${result.baseUri}`);
    }
  } else {
    console.log("\nNext: upload this folder to your IPFS/hosting provider.");
    console.log("See UPLOAD.md. Optional: --upload local (copy to public/)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
