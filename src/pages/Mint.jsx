import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContracts,
  useWalletClient,
} from "wagmi";
import { decodeEventLog, formatEther, zeroAddress } from "viem";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import WalletButton from "../components/WalletButton.jsx";
import {
  chromaAbi,
  DEFAULT_CHAIN,
  getChromaAddress,
  getClaimedCount,
  getRemainingMintAllowance,
  isChromaDeployed,
  PHASE,
  PHASE_LABELS,
} from "../lib/chroma-contract.js";
import { fetchMerkleProofs, lookupProof, proofToBytes32 } from "../lib/merkle.js";
import { projectId, walletConnectConnector } from "../lib/wagmi.js";

const FEATURED_TOKEN = "/alien-134.png";

const FAQ = [
  {
    q: "What is a Chromie?",
    a: "A Chromie is a 64×64 generative pixel-art identity. Every face is built from a 16-color palette and is unique to its token ID.",
  },
  {
    q: "What does on-chain mean?",
    a: "The artwork is committed via merkle root at launch. Holders can optionally inscribe pixel data permanently on-chain. The chain is the source of truth.",
  },
  {
    q: "What is a mutation tier?",
    a: "Each Chromie carries a mutation tier determined at mint. It influences rarity and the visual traits expressed by your token.",
  },
  {
    q: "When is mint?",
    a: "Mint status updates live from the Chromies contract. Connect your wallet on Sepolia to mint when your phase is active.",
  },
];

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatEth(wei) {
  if (wei === undefined || wei === null) return "—";
  const value = Number(formatEther(wei));
  return `${value.toFixed(value < 0.01 ? 4 : 3)} ETH`;
}

function extractMintedTokenId(receipt) {
  if (!receipt?.logs) return null;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: chromaAbi,
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.eventName === "Transfer" &&
        decoded.args.from?.toLowerCase() === zeroAddress
      ) {
        return decoded.args.tokenId;
      }
    } catch {
      // skip unrelated logs
    }
  }
  return null;
}

function shortenError(error) {
  if (!error) return null;
  const message = error.shortMessage || error.message || String(error);
  if (message.includes("User rejected")) return "Transaction cancelled in wallet.";
  if (message.includes("InsufficientPayment")) return "Insufficient ETH sent for mint price.";
  if (message.includes("InvalidMerkleProof")) return "Allowlist proof invalid for this wallet.";
  if (message.includes("MaxPerWalletExceeded")) return "Wallet mint limit reached for this phase.";
  if (message.includes("WrongPhase")) return "Mint phase mismatch — refresh and try again.";
  if (message.includes("MaxSupplyReached")) return "Collection is sold out.";
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}

function MintStatus({ phase, totalSupply, maxSupply, chainId, isConnected }) {
  const label = PHASE_LABELS[phase] ?? "Unknown";
  const onSepolia = chainId === DEFAULT_CHAIN.id;
  const deployed = isChromaDeployed(chainId);
  const wrongNetwork = isConnected && !onSepolia;

  let headline = label;
  if (wrongNetwork) {
    headline = "Wrong Network";
  } else if (!deployed) {
    headline = "Switch to Sepolia";
  }

  return (
    <div className="mx-auto max-w-xl border border-ink bg-white px-6 py-8">
      <div className="text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
        Live Mint Status
      </div>
      <div className="mt-3 font-symtext text-3xl font-black uppercase tracking-tight text-signal sm:text-4xl">
        {headline}
      </div>
      {wrongNetwork && (
        <p className="mt-4 text-sm text-ink/70">
          Chromies mints on <strong className="text-ink">Sepolia testnet</strong>. Switch your
          wallet network to continue.
        </p>
      )}
      {!wrongNetwork && !deployed && isConnected && (
        <p className="mt-4 text-sm text-ink/70">
          The Chromies contract is deployed on Sepolia. Use the button below to switch networks.
        </p>
      )}
      {deployed && onSepolia && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-ink/70">
          <span>
            Minted: <strong className="text-ink">{totalSupply ?? "—"}</strong>
            {maxSupply !== undefined ? ` / ${maxSupply}` : ""}
          </span>
          <span className="hidden h-4 w-px bg-ink/20 sm:inline" />
          <span>Network: Sepolia testnet</span>
        </div>
      )}
    </div>
  );
}

function QuantitySelector({ quantity, maxQuantity, onChange, disabled }) {
  const canDecrease = !disabled && quantity > 1;
  const canIncrease = !disabled && quantity < maxQuantity;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-ink/50">
        Quantity
      </span>
      <div className="flex items-center border border-ink">
        <button
          type="button"
          onClick={() => onChange(quantity - 1)}
          disabled={!canDecrease}
          aria-label="Decrease quantity"
          className="h-11 w-11 text-lg font-bold transition-colors hover:bg-signal hover:text-ink disabled:cursor-not-allowed disabled:text-ink/25 disabled:hover:bg-transparent"
        >
          −
        </button>
        <span className="min-w-12 border-x border-ink px-4 text-center text-lg font-black tabular-nums">
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => onChange(quantity + 1)}
          disabled={!canIncrease}
          aria-label="Increase quantity"
          className="h-11 w-11 text-lg font-bold transition-colors hover:bg-signal hover:text-ink disabled:cursor-not-allowed disabled:text-ink/25 disabled:hover:bg-transparent"
        >
          +
        </button>
      </div>
      <span className="text-xs text-ink/50">
        {maxQuantity > 0
          ? `${maxQuantity} remaining this phase`
          : "No mints remaining"}
      </span>
    </div>
  );
}

export default function Mint() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending: isConnectingWallet } = useConnect();
  const { disconnect } = useDisconnect();
  const onSepolia = chainId === DEFAULT_CHAIN.id;
  const chromaAddress = onSepolia ? getChromaAddress(chainId) : null;
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [tier1Proof, setTier1Proof] = useState(null);
  const [tier2Proof, setTier2Proof] = useState(null);
  const [merkleError, setMerkleError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [mintedTokenIds, setMintedTokenIds] = useState([]);
  const [batchError, setBatchError] = useState(null);
  const [isBatchMinting, setIsBatchMinting] = useState(false);
  const [batchStep, setBatchStep] = useState(0);

  const { data: contractData, refetch: refetchContract } = useReadContracts({
    contracts: chromaAddress
      ? [
          { address: chromaAddress, abi: chromaAbi, functionName: "phase" },
          { address: chromaAddress, abi: chromaAbi, functionName: "totalSupply" },
          { address: chromaAddress, abi: chromaAbi, functionName: "MAX_SUPPLY" },
          { address: chromaAddress, abi: chromaAbi, functionName: "MINT_PRICE" },
          { address: chromaAddress, abi: chromaAbi, functionName: "ALLOWLIST_ONE_PRICE" },
          { address: chromaAddress, abi: chromaAbi, functionName: "ALLOWLIST_TWO_PRICE" },
          { address: chromaAddress, abi: chromaAbi, functionName: "MAX_PER_WALLET_ONE" },
          ...(address
            ? [
                {
                  address: chromaAddress,
                  abi: chromaAbi,
                  functionName: "claimedOne",
                  args: [address],
                },
                {
                  address: chromaAddress,
                  abi: chromaAbi,
                  functionName: "claimedTwo",
                  args: [address],
                },
                {
                  address: chromaAddress,
                  abi: chromaAbi,
                  functionName: "claimedPublic",
                  args: [address],
                },
              ]
            : []),
        ]
      : [],
    query: { enabled: Boolean(chromaAddress) },
  });

  const phase = contractData?.[0]?.result;
  const totalSupply = contractData?.[1]?.result;
  const maxSupply = contractData?.[2]?.result;
  const publicPrice = contractData?.[3]?.result;
  const tier1Price = contractData?.[4]?.result;
  const tier2Price = contractData?.[5]?.result;
  const maxPerWalletOne = contractData?.[6]?.result;
  const claimedOne = address ? contractData?.[7]?.result : undefined;
  const claimedTwo = address ? contractData?.[8]?.result : undefined;
  const claimedPublic = address ? contractData?.[9]?.result : undefined;

  const claimedCount = useMemo(
    () => getClaimedCount(phase, claimedOne, claimedTwo, claimedPublic),
    [phase, claimedOne, claimedTwo, claimedPublic]
  );

  const maxQuantity = useMemo(
    () => getRemainingMintAllowance(phase, claimedOne, claimedTwo, claimedPublic, maxPerWalletOne),
    [phase, claimedOne, claimedTwo, claimedPublic, maxPerWalletOne]
  );

  useEffect(() => {
    setQuantity((current) => {
      if (maxQuantity <= 0) return 1;
      return Math.min(Math.max(1, current), maxQuantity);
    });
  }, [maxQuantity, phase, address]);

  useEffect(() => {
    let cancelled = false;
    async function loadProofs() {
      try {
        setMerkleError(null);
        const [t1, t2] = await Promise.all([
          fetchMerkleProofs(1),
          fetchMerkleProofs(2),
        ]);
        if (cancelled || !address) return;
        setTier1Proof(lookupProof(t1.proofs, address));
        setTier2Proof(lookupProof(t2.proofs, address));
      } catch (error) {
        if (!cancelled) setMerkleError(error.message);
      }
    }
    if (address) loadProofs();
    else {
      setTier1Proof(null);
      setTier2Proof(null);
    }
    return () => {
      cancelled = true;
    };
  }, [address]);

  const allowlistStatus = useMemo(() => {
    if (!address) return null;
    if (phase === PHASE.AllowlistOne && tier1Proof) {
      return { eligible: true, tier: 1, price: tier1Price };
    }
    if (phase === PHASE.AllowlistTwo && tier2Proof) {
      return { eligible: true, tier: 2, price: tier2Price };
    }
    if (tier1Proof || tier2Proof) {
      return {
        eligible: false,
        onList: true,
        price: phase === PHASE.Public ? publicPrice : undefined,
      };
    }
    return { eligible: false, onList: false, price: publicPrice };
  }, [address, phase, tier1Proof, tier2Proof, tier1Price, tier2Price, publicPrice]);

  const unitPrice = useMemo(() => {
    if (phase === PHASE.AllowlistOne && tier1Proof) return tier1Price;
    if (phase === PHASE.AllowlistTwo && tier2Proof) return tier2Price;
    if (phase === PHASE.Public) return publicPrice;
    return allowlistStatus?.price ?? publicPrice;
  }, [phase, tier1Proof, tier2Proof, tier1Price, tier2Price, publicPrice, allowlistStatus]);

  const totalPrice = useMemo(() => {
    if (unitPrice === undefined) return undefined;
    return unitPrice * BigInt(quantity);
  }, [unitPrice, quantity]);

  const buildMintRequest = useCallback(() => {
    if (phase === PHASE.AllowlistOne && tier1Proof) {
      return {
        functionName: "mint",
        args: [proofToBytes32(tier1Proof)],
        value: tier1Price,
      };
    }
    if (phase === PHASE.AllowlistTwo && tier2Proof) {
      return {
        functionName: "mint",
        args: [proofToBytes32(tier2Proof)],
        value: tier2Price,
      };
    }
    if (phase === PHASE.Public) {
      return {
        functionName: "mint",
        args: [],
        value: publicPrice,
      };
    }
    return null;
  }, [phase, tier1Proof, tier2Proof, tier1Price, tier2Price, publicPrice]);

  const handleMint = useCallback(async () => {
    if (!chromaAddress || !walletClient || !publicClient) return;

    const request = buildMintRequest();
    if (!request) return;

    setBatchError(null);
    setMintedTokenIds([]);
    setIsBatchMinting(true);

    const tokenIds = [];

    try {
      for (let i = 0; i < quantity; i++) {
        setBatchStep(i + 1);

        const hash = await walletClient.writeContract({
          address: chromaAddress,
          abi: chromaAbi,
          functionName: request.functionName,
          args: request.args,
          value: request.value,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const tokenId = extractMintedTokenId(receipt);
        if (tokenId !== null) tokenIds.push(tokenId);
      }

      setMintedTokenIds(tokenIds);
      await refetchContract();
    } catch (error) {
      setBatchError(shortenError(error));
      if (tokenIds.length > 0) {
        setMintedTokenIds(tokenIds);
        await refetchContract();
      }
    } finally {
      setIsBatchMinting(false);
      setBatchStep(0);
    }
  }, [
    chromaAddress,
    walletClient,
    publicClient,
    buildMintRequest,
    quantity,
    refetchContract,
  ]);

  const mintDisabledReason = useMemo(() => {
    if (!isConnected) return "Connect wallet to mint";
    if (!onSepolia) return "Switch to Sepolia testnet";
    if (!walletClient) return "Wallet not ready";
    if (!isChromaDeployed(chainId)) return "Chromies not deployed on this network";
    if (phase === PHASE.Closed) return "Mint not open";
    if (phase === PHASE.Revealed) return "Mint complete";
    if (phase === PHASE.AllowlistOne && !tier1Proof) return "Not on Tier 1 allowlist";
    if (phase === PHASE.AllowlistTwo && !tier2Proof) return "Not on Tier 2 allowlist";
    if (maxQuantity <= 0) return "Wallet mint limit reached";
    if (totalSupply !== undefined && maxSupply !== undefined && totalSupply >= maxSupply) {
      return "Sold out";
    }
    if (!buildMintRequest()) return "Mint unavailable for current phase";
    return null;
  }, [
    isConnected,
    onSepolia,
    walletClient,
    chainId,
    phase,
    tier1Proof,
    tier2Proof,
    maxQuantity,
    totalSupply,
    maxSupply,
    buildMintRequest,
  ]);

  const buttonLabel = (() => {
    if (mintedTokenIds.length > 0 && !isBatchMinting) {
      if (mintedTokenIds.length === 1) {
        return `Chromie #${mintedTokenIds[0]} minted!`;
      }
      return `${mintedTokenIds.length} Chromies minted!`;
    }
    if (isBatchMinting && batchStep > 0) {
      return quantity > 1
        ? `Minting ${batchStep} of ${quantity}…`
        : "Minting…";
    }
    if (isBatchMinting) return "Confirm in wallet";
    if (mintDisabledReason) return mintDisabledReason;
    const priceLabel = formatEth(totalPrice);
    return quantity > 1 ? `Mint ${quantity} — ${priceLabel}` : `Mint — ${priceLabel}`;
  })();

  const infoCards = [
    {
      value: formatEth(totalPrice),
      label: quantity > 1 ? `Total (${quantity}×)` : "Your Price",
    },
    { value: maxSupply !== undefined ? String(maxSupply) : "—", label: "Supply" },
    {
      value: maxQuantity > 0 ? String(maxQuantity) : "0",
      label: "Remaining",
    },
  ];

  const showQuantity =
    isConnected &&
    maxQuantity > 0 &&
    (phase === PHASE.AllowlistOne ||
      phase === PHASE.AllowlistTwo ||
      phase === PHASE.Public);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">
            CLAIM YOUR CHROMIE
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            Connect on Sepolia testnet. Mint status and pricing read live from the Chromies contract.
          </p>

          <div className="mt-10">
            <MintStatus
              phase={phase}
              totalSupply={totalSupply}
              maxSupply={maxSupply}
              chainId={chainId}
              isConnected={isConnected}
            />
          </div>

          {address && allowlistStatus?.onList && (
            <p className="mt-6 text-sm font-semibold text-signal">
              You&apos;re on the allowlist
              {allowlistStatus.eligible
                ? ` — ${formatEth(unitPrice)} each`
                : " — wait for your phase or use public mint"}
            </p>
          )}

          {address && !allowlistStatus?.onList && phase === PHASE.Public && (
            <p className="mt-6 text-sm text-ink/60">
              Public mint: <strong className="text-ink">{formatEth(publicPrice)}</strong> each
              {claimedCount > 0 ? ` · ${claimedCount} already minted` : ""}
            </p>
          )}

          {merkleError && (
            <p className="mt-4 text-sm text-red-600">{merkleError}</p>
          )}

          <div className="mt-10 flex flex-col items-center gap-6">
            {isConnected && address && onSepolia ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold tabular-nums text-ink/80">
                  {shortenAddress(address)}
                </span>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="border border-ink bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition-colors hover:border-signal hover:text-signal"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <WalletButton />
            )}

            {!isConnected && walletConnectConnector && (
              <button
                type="button"
                onClick={() => connect({ connector: walletConnectConnector })}
                disabled={isConnectingWallet || !projectId}
                className="border border-ink bg-white px-8 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40"
              >
                {isConnectingWallet ? "Connecting…" : "Connect Mobile Wallet (QR)"}
              </button>
            )}

            {showQuantity && (
              <QuantitySelector
                quantity={quantity}
                maxQuantity={maxQuantity}
                onChange={setQuantity}
                disabled={isBatchMinting || Boolean(mintDisabledReason)}
              />
            )}

            {showQuantity && unitPrice !== undefined && quantity > 1 && (
              <p className="text-sm text-ink/60">
                {formatEth(unitPrice)} × {quantity} ={" "}
                <strong className="text-ink">{formatEth(totalPrice)}</strong>
              </p>
            )}

            <button
              type="button"
              onClick={handleMint}
              disabled={Boolean(mintDisabledReason) || isBatchMinting}
              className="border border-signal bg-signal px-8 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40 disabled:hover:bg-ink/10 disabled:hover:text-ink/40"
            >
              {buttonLabel}
            </button>

            {batchError && (
              <p className="max-w-md text-sm text-red-600">{batchError}</p>
            )}

            {mintedTokenIds.length > 0 && (
              <p className="text-sm font-semibold text-signal">
                {mintedTokenIds.length === 1
                  ? `Chromie #${String(mintedTokenIds[0])} minted successfully.`
                  : `Chromies #${mintedTokenIds.map(String).join(", #")} minted successfully.`}
              </p>
            )}

            {quantity > 1 && !isBatchMinting && mintedTokenIds.length === 0 && !batchError && (
              <p className="max-w-sm text-xs text-ink/50">
                Each Chromie requires a separate on-chain transaction (one mint per tx).
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="border-b border-ink bg-white px-6 py-20">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="w-64 border border-ink bg-paper p-3">
            <img
              src={FEATURED_TOKEN}
              alt="Featured Chromie"
              draggable={false}
              className="pixelated aspect-square w-full select-none"
            />
          </div>
          <p className="mt-8 max-w-md text-base leading-relaxed text-ink/70">
            Each Chromie is generated on-chain from your token ID. No two are
            alike. Your mutation tier is determined at mint.
          </p>
        </div>
      </section>

      <section className="border-b border-ink">
        <div className="mx-auto grid max-w-6xl grid-cols-1 sm:grid-cols-3">
          {infoCards.map((item, i) => (
            <div
              key={item.label}
              className={`border-ink px-8 py-12 text-center ${
                i > 0 ? "border-t sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <div className="text-4xl font-black text-signal">{item.value}</div>
              <div className="mt-2 text-sm uppercase tracking-widest text-ink/50">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-extrabold uppercase tracking-[0.2em] text-ink/50">
            FAQ
          </h2>
          <div className="mt-10 divide-y divide-ink border-y border-ink">
            {FAQ.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-5 text-base font-semibold text-ink transition-colors hover:text-signal">
                  {item.q}
                  <span className="ml-4 text-signal transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-2 pb-5 text-sm leading-relaxed text-ink/70">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
