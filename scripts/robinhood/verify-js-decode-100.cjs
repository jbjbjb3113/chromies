const fs = require("fs");
const data = JSON.parse(fs.readFileSync("reports/robinhood/commemorative-100.json", "utf8"));
const { TRAIT_BYTE_TABLES } = require("../../art-pipeline/generated/on-chain-trait-bytes");
const { ON_CHAIN_CHARACTER_BYTES, ON_CHAIN_PALETTE_BYTES } = require("../../art-pipeline/generated/on-chain-character-bytes");

const slots = [
  ["Character", "character", 0, ON_CHAIN_CHARACTER_BYTES],
  ["Palette", "palette", 1, ON_CHAIN_PALETTE_BYTES],
  ["Hood", "hood", 2, TRAIT_BYTE_TABLES.hood],
  ["Shirt", "shirt", 3, TRAIT_BYTE_TABLES.shirt],
  ["Body", "body", 4, TRAIT_BYTE_TABLES.body],
  ["Bodytattoo", "bodytattoo", 5, TRAIT_BYTE_TABLES.bodytattoo],
  ["Necklace", "necklace", 6, TRAIT_BYTE_TABLES.necklace],
  ["Tattoo", "tattoo", 7, TRAIT_BYTE_TABLES.tattoo],
  ["Beard", "beard", 9, TRAIT_BYTE_TABLES.beard],
  ["Mustache", "mustache", 10, TRAIT_BYTE_TABLES.mustache],
  ["Eyes", "eyes", 11, TRAIT_BYTE_TABLES.eyes],
  ["Earrings", "earrings", 12, TRAIT_BYTE_TABLES.earrings],
  ["Glasses", "glasses", 13, TRAIT_BYTE_TABLES.glasses],
  ["Hair", "hair", 14, TRAIT_BYTE_TABLES.hair],
];

function rev(t) {
  const o = {};
  for (const [k, v] of Object.entries(t)) if (o[v] === undefined) o[v] = k;
  return o;
}

let bad = 0;
for (const rec of data.tokens) {
  const bytes = Buffer.from(rec.traitsHex.slice(2), "hex");
  const uri = fs.readFileSync(`reports/robinhood/label-parity-100/uri-${rec.commemorativeTokenId}.txt`, "utf8").trim().replace(/^"|"$/g, "");
  const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  const attrs = Object.fromEntries(
    meta.attributes.filter((a) => slots.some((s) => s[0] === a.trait_type)).map((a) => [a.trait_type, a.value]),
  );
  for (const [label, , idx, table] of slots) {
    const js = rev(table)[bytes[idx]] ?? "None";
    if (attrs[label] !== js) {
      console.log("JS mismatch", rec.commemorativeTokenId, label, { js, tokenURI: attrs[label] });
      bad++;
    }
  }
}
if (bad === 0) {
  console.log(`JS bridge decode vs tokenURI: 100/100 PASS (${slots.length * 100} slot checks)`);
} else {
  console.error(`FAIL ${bad} JS mismatches`);
  process.exit(1);
}
