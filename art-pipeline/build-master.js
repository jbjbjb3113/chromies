// ============================================================================
// build-master.js
// Walks output/tokens/*.json and rebuilds master.json + master.csv from scratch.
// Use this after big changes (regenerated tokens, changed traits.json, etc.)
// to ensure the master ledger reflects what's actually on disk.
//
// USAGE:
//   node build-master.js
//
// OUTPUTS to ./output/:
//   master.json      (one array, one entry per token, full trait data)
//   master.csv       (spreadsheet-friendly view; one row per token)
// ============================================================================

const fs = require("fs");
const path = require("path");
const { SETTINGS } = require("./chromies-config");

const TOKENS_DIR = path.join(SETTINGS.outputDir, "tokens");

function loadAllTokens() {
  if (!fs.existsSync(TOKENS_DIR)) {
    console.error(`no tokens directory at ${TOKENS_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith(".json"));
  const tokens = [];
  for (const f of files) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(TOKENS_DIR, f), "utf8"));
      tokens.push(meta);
    } catch (e) {
      console.warn(`  [skip] ${f}: invalid JSON`);
    }
  }
  tokens.sort((a, b) => a.tokenId - b.tokenId);
  return tokens;
}

function flattenToken(meta) {
  const row = { tokenId: meta.tokenId, name: meta.name };
  for (const attr of meta.attributes) {
    row[attr.trait_type.toLowerCase()] = attr.value;
  }
  return row;
}

function writeMasterJson(rows) {
  const outPath = path.join(SETTINGS.outputDir, "master.json");
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`  wrote ${path.basename(outPath)} (${rows.length} tokens)`);
}

function writeMasterCsv(rows) {
  const columns = [];
  const seen = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) { seen.add(k); columns.push(k); }
    }
  }
  const csvLines = [columns.join(",")];
  for (const row of rows) {
    csvLines.push(columns.map(c => {
      const v = row[c] === undefined ? "" : String(row[c]);
      if (v.includes(",") || v.includes('"')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(","));
  }
  const outPath = path.join(SETTINGS.outputDir, "master.csv");
  fs.writeFileSync(outPath, csvLines.join("\n"));
  console.log(`  wrote ${path.basename(outPath)} (${rows.length} tokens, ${columns.length} columns)`);
}

function main() {
  console.log(`Reading ${TOKENS_DIR}...`);
  const tokens = loadAllTokens();
  if (tokens.length === 0) {
    console.log(`  no tokens found.`);
    return;
  }
  const rows = tokens.map(flattenToken);
  writeMasterJson(rows);
  writeMasterCsv(rows);
}

if (require.main === module) main();

module.exports = { loadAllTokens, flattenToken };