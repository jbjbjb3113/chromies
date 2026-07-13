/**
 * Diagnose mint() gas estimate failures on Sepolia Chroma.
 * Usage: npx tsx scripts/diagnose-mint.ts [walletAddress]
 */
import "dotenv/config";
import {
  createPublicClient,
  formatEther,
  http,
  parseEther,
  zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";
import { chromaAbi, PHASE } from "../abis/Chroma.ts";

const CHROMA = "0x8162114c056DfC49045c04C66f1E03b761d81eD5" as const;
const RPC =
  process.env.SEPOLIA_RPC_URL?.trim() ||
  (process.env.VITE_ALCHEMY_KEY?.trim()
    ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.VITE_ALCHEMY_KEY.trim()}`
    : "https://ethereum-sepolia-rpc.publicnode.com");

const PHASE_NAMES: Record<number, string> = {
  [PHASE.Closed]: "Closed",
  [PHASE.AllowlistOne]: "AllowlistOne",
  [PHASE.AllowlistTwo]: "AllowlistTwo",
  [PHASE.Public]: "Public",
  [PHASE.Revealed]: "Revealed",
};

const FRESH_WALLET = "0x1111111111111111111111111111111111111111" as const;

function decodeRevert(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as {
    shortMessage?: string;
    message?: string;
    cause?: { data?: string; reason?: string };
    data?: string;
    name?: string;
  };
  const parts = [
    e.shortMessage,
    e.message,
    e.cause?.reason,
    e.cause?.data,
    e.data,
    e.name,
  ].filter(Boolean);
  return parts.join(" | ");
}

async function main() {
  const connectedWallet = (process.argv[2] ?? FRESH_WALLET) as `0x${string}`;

  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });

  console.log("=== Chroma mint diagnostic (Sepolia) ===");
  console.log(`Contract: ${CHROMA}`);
  console.log(`RPC: ${RPC.replace(/\/v2\/[^/]+$/, "/v2/***")}\n`);

  const [
    phase,
    totalSupply,
    maxSupply,
    mintPrice,
    allowlistOnePrice,
    allowlistTwoPrice,
    maxPerWalletOne,
  ] = await Promise.all([
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "phase" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "totalSupply" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "MAX_SUPPLY" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "MINT_PRICE" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "ALLOWLIST_ONE_PRICE" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "ALLOWLIST_TWO_PRICE" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "MAX_PER_WALLET_ONE" }),
  ]);

  console.log("--- On-chain state ---");
  console.log(`phase:              ${phase} (${PHASE_NAMES[Number(phase)] ?? "?"})`);
  console.log(`totalSupply:        ${totalSupply} / ${maxSupply}`);
  console.log(`MINT_PRICE:         ${formatEther(mintPrice)} ETH (${mintPrice} wei)`);
  console.log(`ALLOWLIST_ONE:      ${formatEther(allowlistOnePrice)} ETH`);
  console.log(`ALLOWLIST_TWO:      ${formatEther(allowlistTwoPrice)} ETH`);
  console.log(`MAX_PER_WALLET_ONE: ${maxPerWalletOne}`);

  for (const label of ["fresh wallet", "connected wallet"] as const) {
    const wallet = label === "fresh wallet" ? FRESH_WALLET : connectedWallet;
    const [claimedOne, claimedTwo, claimedPublic] = await Promise.all([
      client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "claimedOne", args: [wallet] }),
      client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "claimedTwo", args: [wallet] }),
      client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "claimedPublic", args: [wallet] }),
    ]);
    console.log(`\n--- ${label}: ${wallet} ---`);
    console.log(`claimedOne: ${claimedOne}, claimedTwo: ${claimedTwo}, claimedPublic: ${claimedPublic}`);
  }

  const scenarios = [
    { label: "public mint(1) @ MINT_PRICE (fresh wallet)", value: mintPrice, from: FRESH_WALLET },
    { label: "public mint(1) @ 0 ETH (fresh wallet)", value: 0n, from: FRESH_WALLET },
    { label: "public mint(1) @ 0.003 ETH wrong price (fresh wallet)", value: parseEther("0.003"), from: FRESH_WALLET },
    { label: "public mint(1) @ MINT_PRICE (connected wallet)", value: mintPrice, from: connectedWallet },
  ];

  console.log("\n--- simulateContract mint(uint256,1) ---");
  for (const s of scenarios) {
    try {
      await client.simulateContract({
        address: CHROMA,
        abi: chromaAbi,
        functionName: "mint",
        args: [1n],
        value: s.value,
        account: s.from,
      });
      console.log(`✓ ${s.label}: SUCCESS`);
    } catch (err) {
      console.log(`✗ ${s.label}: REVERT`);
      console.log(`  ${decodeRevert(err)}`);
    }
  }

  console.log("\n--- estimateContractGas mint(uint256,1) @ MINT_PRICE ---");
  for (const wallet of [FRESH_WALLET, connectedWallet]) {
    try {
      const gas = await client.estimateContractGas({
        address: CHROMA,
        abi: chromaAbi,
        functionName: "mint",
        args: [1n],
        value: mintPrice,
        account: wallet,
      });
      console.log(`✓ ${wallet}: ${gas} gas`);
    } catch (err) {
      console.log(`✗ ${wallet}: estimate failed`);
      console.log(`  ${decodeRevert(err)}`);
    }
  }

  // Token owners 1..totalSupply and whether they can mint again
  console.log("\n--- Current token holders ---");
  for (let id = 1n; id <= totalSupply; id++) {
    const owner = await client.readContract({
      address: CHROMA,
      abi: chromaAbi,
      functionName: "ownerOf",
      args: [id],
    });
    const [c1, c2, cp] = await Promise.all([
      client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "claimedOne", args: [owner] }),
      client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "claimedTwo", args: [owner] }),
      client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "claimedPublic", args: [owner] }),
    ]);
    let sim = "mint(1) OK";
    try {
      await client.simulateContract({
        address: CHROMA,
        abi: chromaAbi,
        functionName: "mint",
        args: [1n],
        value: mintPrice,
        account: owner,
      });
    } catch (err) {
      sim = decodeRevert(err).includes("0xf560625a")
        ? "MaxPerWalletExceeded()"
        : decodeRevert(err).includes("0xcd1c8867")
          ? "InsufficientPayment()"
          : decodeRevert(err).includes("0xe2586bcc")
            ? "WrongPhase()"
            : decodeRevert(err).split("|")[0].trim();
    }
    console.log(`  #${id} ${owner}: claimedPublic=${cp} one=${c1} two=${c2} → ${sim}`);
  }

  console.log("\n--- Stale/wrong frontend tx shapes (fresh wallet) ---");
  const dummyProof = [`0x${"00".repeat(32)}`] as const;
  const wrongPaths = [
    {
      label: "allowlist mint(proof,1) during Public @ tier1 price",
      args: [dummyProof, 1n] as const,
      value: allowlistOnePrice,
    },
    {
      label: "public mint(1) @ tier1 price (0.003 ETH)",
      args: [1n] as const,
      value: allowlistOnePrice,
    },
    {
      label: "public mint(1) @ tier2 price (0.005 ETH)",
      args: [1n] as const,
      value: allowlistTwoPrice,
    },
    {
      label: "public mint(4) exceeds per-wallet cap",
      args: [4n] as const,
      value: mintPrice * 4n,
    },
  ];
  for (const w of wrongPaths) {
    try {
      await client.simulateContract({
        address: CHROMA,
        abi: chromaAbi,
        functionName: "mint",
        args: w.args as never,
        value: w.value,
        account: FRESH_WALLET,
      });
      console.log(`✓ ${w.label}: unexpected SUCCESS`);
    } catch (err) {
      const d = decodeRevert(err);
      const errName = d.includes("0xcd1c8867")
        ? "InsufficientPayment()"
        : d.includes("0xe2586bcc")
          ? "WrongPhase()"
          : d.includes("0xf560625a")
            ? "MaxPerWalletExceeded()"
            : d.includes("0x524f409b")
              ? "InvalidQuantity()"
              : d.match(/0x[a-f0-9]{8}/i)?.[0] ?? d.split("|")[0].trim();
      console.log(`✗ ${w.label}: ${errName}`);
    }
  }

  // If phase is allowlist, test what happens calling public mint overload vs proof mint
  if (phase === PHASE.AllowlistOne || phase === PHASE.AllowlistTwo) {
    console.log(`\n--- Note: phase is ${PHASE_NAMES[Number(phase)]}; public mint(uint256) always reverts WrongPhase ---`);
    console.log("Frontend must call mint(bytes32[],uint256) with merkle proof in allowlist phases.");
  }

  if (phase === PHASE.Closed || phase === PHASE.Revealed) {
    console.log(`\n--- Note: phase is ${PHASE_NAMES[Number(phase)]}; all user mint paths blocked ---`);
  }

  if (totalSupply >= maxSupply) {
    console.log("\n--- Note: MAX_SUPPLY reached ---");
  }

  void zeroAddress;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
