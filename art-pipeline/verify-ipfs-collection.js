// ============================================================================
// verify-ipfs-collection.js
// Spot-check generated IPFS collection against mint-data.json + merkle root.
//
// USAGE:
//   node verify-ipfs-collection.js
//   node verify-ipfs-collection.js --sample 20
// ============================================================================

const fs = require("fs");
const path = require("path");
const keccak256 = require("keccak256");
const { verifyRoundTrip } = require("./verify-legendary-finals");
const { LEGENDARY_TOKEN_IDS, legendaryFinalExists } = require("./legendary-finals");

const COLLECTION_DIR = path.join(__dirname, "output", "ipfs-collection");
const MINT_DATA_PATH = path.join(__dirname, "output", "mint-data.json");
const MERKLE_ROOT_PATH = path.join(__dirname, "output", "reveal-merkle-root.txt");

function parseArgs() {
  const args = process.argv.slice(2);
  let sample = 10;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--sample") sample = parseInt(args[++i], 10);
  }
  return { sample };
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

function main() {
  const { sample } = parseArgs();

  if (!fs.existsSync(COLLECTION_DIR)) {
    console.error(`Missing ${COLLECTION_DIR} — run upload-ipfs-collection.js first`);
    process.exit(1);
  }
  if (!fs.existsSync(MINT_DATA_PATH)) {
    console.error(`Missing ${MINT_DATA_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(COLLECTION_DIR, "manifest.json"), "utf8"));
  const records = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));

  if (manifest.tokenCount !== records.length) {
    console.error(`Count mismatch: manifest=${manifest.tokenCount} mint-data=${records.length}`);
    process.exit(1);
  }

  let errors = 0;
  for (const record of records) {
    const key = String(record.tokenId);
    const entry = manifest.tokens[key];
    if (!entry) {
      console.error(`Missing manifest entry for token ${key}`);
      errors++;
      continue;
    }
    const expectedLeaf = `0x${leafHash(record.tokenId, record.pixelsHex, record.traitsHex).toString("hex")}`;
    if (entry.leaf.toLowerCase() !== expectedLeaf.toLowerCase()) {
      console.error(`Leaf mismatch token ${key}`);
      errors++;
    }
    for (const rel of [entry.image64, entry.image1024, entry.metadata]) {
      const abs = path.join(COLLECTION_DIR, rel.replace(/\//g, path.sep));
      if (!fs.existsSync(abs)) {
        console.error(`Missing file: ${rel}`);
        errors++;
      }
    }
  }

  const indices = [];
  while (indices.length < Math.min(sample, records.length)) {
    const i = Math.floor(Math.random() * records.length);
    if (!indices.includes(i)) indices.push(i);
  }

  console.log(`Verified structure for ${records.length} tokens`);
  console.log(`Spot-checking ${indices.length} random metadata files…`);

  for (const i of indices) {
    const record = records[i];
    const id = String(record.tokenId).padStart(4, "0");
    const metaPath = path.join(COLLECTION_DIR, "metadata", `${id}.json`);
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (!meta.name.includes(id)) {
      console.error(`Metadata name mismatch for #${record.tokenId}`);
      errors++;
    }
    if (!Array.isArray(meta.attributes) || meta.attributes.length < 10) {
      console.error(`Metadata attributes thin for #${record.tokenId}`);
      errors++;
    }
  }

  if (fs.existsSync(MERKLE_ROOT_PATH) && manifest.merkleRoot) {
    const root = fs.readFileSync(MERKLE_ROOT_PATH, "utf8").trim();
    if (root.toLowerCase() !== manifest.merkleRoot.toLowerCase()) {
      console.error(`Merkle root mismatch: manifest=${manifest.merkleRoot} file=${root}`);
      errors++;
    } else {
      console.log(`Merkle root matches: ${root}`);
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} verification error(s)`);
    process.exit(1);
  }

  console.log("\nLegendary-finals round-trip check…");
  const present = LEGENDARY_TOKEN_IDS.filter((id) => legendaryFinalExists(id));
  if (present.length === 0) {
    console.log("  No legendary-finals/ PNGs present — skipping round-trip (mint-data must not include legendaries yet).");
  } else {
    let legendaryErrors = 0;
    for (const tokenId of present) {
      const record = records.find((r) => r.tokenId === tokenId);
      if (!record) {
        console.error(`  #${tokenId}: missing from mint-data.json`);
        legendaryErrors++;
        continue;
      }
      const result = verifyRoundTrip(tokenId, record);
      if (result.status !== "ok") {
        console.error(`  #${tokenId}: ${result.reason}`);
        legendaryErrors++;
      } else {
        console.log(`  #${tokenId}: OK (${result.paletteKey})`);
      }
    }
    if (legendaryErrors > 0) {
      console.error(`\n${legendaryErrors} legendary-finals error(s)`);
      process.exit(1);
    }
    console.log(`  ${present.length}/${present.length} legendary round-trips passed`);
  }

  console.log("\nAll checks passed.");
}

main();
