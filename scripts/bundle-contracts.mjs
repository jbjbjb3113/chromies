import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = path.join(root, "contracts");
const outDir = path.join(root, "docs");
const outFile = path.join(outDir, "chromies-contracts.md");

const ORDER = [
  "IChromaStorage.sol",
  "IChromaRenderer.sol",
  "IChromaToken.sol",
  "IChromaCanvas.sol",
  "IChromaCanvasFinalize.sol",
  "IPixelCanvas.sol",
  "ChromaStorage.sol",
  "ChromaRendererSvgLib.sol",
  "ChromaRenderer.sol",
  "ChromaCanvas.sol",
  "ChromaCanvasV2.sol",
  "PixelMarketplace.sol",
  "Chroma.sol",
];

const files = await readdir(contractsDir);
const solFiles = files.filter((f) => f.endsWith(".sol"));
const ordered = [
  ...ORDER.filter((f) => solFiles.includes(f)),
  ...solFiles.filter((f) => !ORDER.includes(f)).sort(),
];

let md = `# Chromies smart contracts

Generated from \`contracts/\` in the Chromies repo.
Solidity ^0.8.24 · Foundry · OpenZeppelin · Solady (SSTORE2)

## Contract index

${ordered.map((f) => `- \`${f}\``).join("\n")}

---

`;

for (const file of ordered) {
  const source = await readFile(path.join(contractsDir, file), "utf8");
  md += `## ${file}\n\n\`\`\`solidity\n${source.trimEnd()}\n\`\`\`\n\n---\n\n`;
}

await mkdir(outDir, { recursive: true });
await writeFile(outFile, md, "utf8");
console.log(`Wrote ${outFile} (${ordered.length} files)`);
