import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateToken, PALETTES, EXPRESSIONS, EYEWEAR, HEADGEAR, TYPES } from "../src/art/engine";

type OutputRow = {
  tokenId: number;
  traits: {
    type: string;
    expression: string;
    headgear: string;
    eyewear: string;
    paletteId: number;
    palette: string;
    traitBytes: string;
  };
  buffer: string;
};

async function main(): Promise<void> {
  const totalSupply = Number(process.env.CHROMA_TOTAL_SUPPLY ?? 10000);
  if (!Number.isInteger(totalSupply) || totalSupply <= 0) {
    throw new Error("CHROMA_TOTAL_SUPPLY must be a positive integer.");
  }

  const outPath = resolve(process.cwd(), "generated/chroma-collection.jsonl");
  const manifestPath = resolve(process.cwd(), "generated/chroma-collection-manifest.json");

  await mkdir(dirname(outPath), { recursive: true });

  const lines: string[] = [];
  const hash = createHash("sha256");

  for (let tokenId = 0; tokenId < totalSupply; tokenId++) {
    const token = generateToken(tokenId);
    const row: OutputRow = {
      tokenId,
      traits: {
        type: TYPES[token.traits.typeId]!,
        expression: EXPRESSIONS[token.traits.expressionId]!,
        headgear: HEADGEAR[token.traits.headgearId]!,
        eyewear: EYEWEAR[token.traits.eyewearId]!,
        paletteId: token.traits.paletteId,
        palette: PALETTES[token.traits.paletteId]!,
        traitBytes: token.traitBytesHex,
      },
      buffer: token.packedBufferHex,
    };
    const line = JSON.stringify(row);
    lines.push(line);
    hash.update(line);
    hash.update("\n");
  }

  const jsonl = `${lines.join("\n")}\n`;
  await writeFile(outPath, jsonl, "utf8");

  const manifest = {
    totalSupply,
    format: "jsonl",
    packedBufferBytes: 2048,
    pixelGrid: "64x64",
    bpp: 4,
    deterministicHash: hash.digest("hex"),
    outputFile: "generated/chroma-collection.jsonl",
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Generated ${totalSupply} tokens -> ${outPath}`);
  console.log(`Manifest -> ${manifestPath}`);
  console.log(`Deterministic hash: ${manifest.deterministicHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
