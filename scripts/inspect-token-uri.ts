/**
 * Read tokenURI from live Sepolia Chroma and print decoded metadata attributes.
 *
 * Usage:
 *   npx tsx scripts/inspect-token-uri.ts 29
 *   npx tsx scripts/inspect-token-uri.ts 29 --save-svg
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";

const CHROMA = (process.env.CHROMA_ADDRESS ??
  "0x8162114c056DfC49045c04C66f1E03b761d81eD5") as `0x${string}`;

const JSON_DATA_URI_PREFIX = "data:application/json;base64,";
const SVG_DATA_URI_PREFIX = "data:image/svg+xml;base64,";

function decodeTokenUri(uri: string) {
  if (!uri.startsWith(JSON_DATA_URI_PREFIX)) {
    throw new Error(`Unexpected tokenURI prefix: ${uri.slice(0, 64)}…`);
  }
  return JSON.parse(
    Buffer.from(uri.slice(JSON_DATA_URI_PREFIX.length), "base64").toString("utf8"),
  ) as {
    name?: string;
    image?: string;
    attributes?: Array<{ trait_type: string; value: string | number }>;
  };
}

function decodeSvgFromMetadataImage(image: string | undefined): string {
  if (!image?.startsWith(SVG_DATA_URI_PREFIX)) {
    throw new Error(
      `Expected SVG data URI in metadata.image, got: ${image?.slice(0, 64) ?? "missing"}…`,
    );
  }
  return Buffer.from(image.slice(SVG_DATA_URI_PREFIX.length), "base64").toString("utf8");
}

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const tokenIdArg = positional[2];
  if (!tokenIdArg) {
    throw new Error("Usage: npx tsx scripts/inspect-token-uri.ts <tokenId> [--save-svg]");
  }
  return {
    tokenId: BigInt(tokenIdArg),
    saveSvg: flags.has("--save-svg"),
  };
}

async function main() {
  const { tokenId, saveSvg } = parseArgs(process.argv);
  const rpc =
    process.env.SEPOLIA_RPC_URL?.trim() ||
    "https://ethereum-sepolia-rpc.publicnode.com";

  const client = createPublicClient({ chain: sepolia, transport: http(rpc) });

  const [revealed, uri] = await Promise.all([
    client.readContract({
      address: CHROMA,
      abi: chromaAbi,
      functionName: "revealed",
      args: [tokenId],
    }),
    client.readContract({
      address: CHROMA,
      abi: chromaAbi,
      functionName: "tokenURI",
      args: [tokenId],
    }),
  ]);

  console.log(`Chroma:   ${CHROMA}`);
  console.log(`tokenId:  ${tokenId}`);
  console.log(`revealed: ${revealed}\n`);

  const metadata = decodeTokenUri(uri);
  console.log(JSON.stringify(metadata.attributes ?? [], null, 2));

  const mutation = metadata.attributes?.find((a) => a.trait_type === "Mutation");
  if (mutation) {
    console.log(`\nMutation tier: ${mutation.value}`);
  }

  if (saveSvg) {
    const svg = decodeSvgFromMetadataImage(metadata.image);
    const outDir = resolve(process.cwd(), "output");
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, `token-${tokenId}.svg`);
    writeFileSync(outPath, svg, "utf8");
    console.log(`\nSaved SVG → ${outPath} (${svg.length} chars)`);
    execSync(`start "" "${outPath}"`, { stdio: "inherit", shell: "cmd.exe" });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
