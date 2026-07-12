import React, { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContracts,
  useWalletClient,
} from "wagmi";
import { decodeEventLog, formatEther, zeroAddress } from "viem";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import WalletButton from "../components/WalletButton.jsx";
import {
  chromiesCommemorativeAbi,
  getChromiesCommemorativeAddress,
  isChromiesCommemorativeDeployed,
  robinhoodChain,
} from "../lib/robinhood-contract.js";

const FEATURED_TOKEN = "/alien-134.png";

const MINT_CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

function formatEth(wei) {
  if (wei === undefined || wei === null) return "—";
  const value = Number(formatEther(wei));
  // 4 decimals up to 0.1 ETH so prices like the 0.0169 ETH mint price display exactly
  // instead of rounding to 3 decimals (which would show "0.017 ETH").
  return `${value.toFixed(value < 0.1 ? 4 : 3)} ETH`;
}

function extractMintedTokenIds(receipt) {
  const tokenIds = [];
  if (!receipt?.logs) return tokenIds;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: chromiesCommemorativeAbi,
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.eventName === "Transfer" &&
        decoded.args.from?.toLowerCase() === zeroAddress
      ) {
        tokenIds.push(decoded.args.tokenId);
      }
    } catch {
      // skip unrelated logs
    }
  }
  return tokenIds;
}

function shortenError(error) {
  if (!error) return null;
  const message = error.shortMessage || error.message || String(error);
  if (message.includes("User rejected")) return "Transaction cancelled in wallet.";
  if (message.includes("InsufficientPayment")) return "Send the exact mint price.";
  if (message.includes("MaxPerWalletExceeded")) return "Wallet limit is 2 per address.";
  if (message.includes("MintNotOpen")) return "Mint isn't open yet — check back soon.";
  if (message.includes("MaxSupplyReached")) return "All 100 pieces are minted.";
  if (message.includes("InvalidQuantity")) return "Quantity must be 1 or 2.";
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}

function MintStatus({ mintOpen, totalSupply, maxSupply, price, chainId, isConnected }) {
  const onRobinhood = chainId === robinhoodChain.id;
  const wrongNetwork = isConnected && !onRobinhood;
  // mintOpen resolves to a live value once the (always-on, chain-pinned) contract read
  // completes — this no longer depends on the wallet's own active chain, so a first-time
  // visitor with no wallet connected still sees real price/supply/mintOpen data.
  const dataLoaded = mintOpen !== undefined;

  const headline = !dataLoaded ? "Loading…" : mintOpen ? "Mint Open" : "Not Yet Open";

  return (
    <div className="mx-auto max-w-xl border border-ink bg-white px-6 py-8">
      <div className="text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
        Chain Launch Status
      </div>
      <div className="mt-3 font-symtext text-3xl font-black uppercase tracking-tight text-signal sm:text-4xl">
        {headline}
      </div>
      {wrongNetwork && (
        <p className="mt-4 text-sm text-ink/70">
          The Chain Launch Edition mints on{" "}
          <strong className="text-ink">Robinhood Chain</strong>. Switch your wallet network
          to mint — supply and price below are live regardless of your current network.
        </p>
      )}
      {dataLoaded && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-ink/70">
            <span>
              Minted: <strong className="text-ink">{totalSupply ?? "—"}</strong>
              {maxSupply !== undefined ? ` / ${maxSupply}` : ""}
            </span>
            <span className="hidden h-4 w-px bg-ink/20 sm:inline" />
            <span>Network: Robinhood Chain</span>
          </div>
          <div className="mt-5 flex flex-col gap-2 border-t border-ink/10 pt-5">
            <div className="flex items-baseline justify-center gap-2">
              <span className="font-symtext text-xl font-black text-ink">
                {formatEth(price)}
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-ink/50">
                Price
              </span>
            </div>
            <div className="flex items-baseline justify-center gap-2">
              <span className="font-symtext text-xl font-black text-ink">100</span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-ink/50">
                Supply
              </span>
            </div>
            <div className="flex items-baseline justify-center gap-2">
              <span className="font-symtext text-xl font-black text-ink">
                {totalSupply !== undefined ? (100n - totalSupply).toString() : "—"}
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-ink/50">
                Remaining
              </span>
            </div>
          </div>
        </>
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
        {maxQuantity > 0 ? `${maxQuantity} remaining for this wallet` : "Wallet limit reached"}
      </span>
    </div>
  );
}

export default function LaunchEdition() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onRobinhood = chainId === robinhoodChain.id;
  // Deliberately NOT gated on onRobinhood — this is a single-network (Robinhood Chain
  // mainnet) mint, so the live contract state (price/supply/mintOpen) must render for
  // every visitor, including before a wallet connects or while it's on a different chain.
  // Only the mint ACTION itself (handleMint) requires the wallet to actually be on
  // Robinhood Chain. Each read below pins chainId: robinhoodChain.id so wagmi queries
  // that chain's public client regardless of the wallet's currently active network.
  const contractAddress = getChromiesCommemorativeAddress(robinhoodChain.id);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [quantity, setQuantity] = useState(1);
  const [mintedTokenIds, setMintedTokenIds] = useState([]);
  const [mintError, setMintError] = useState(null);
  const [isMinting, setIsMinting] = useState(false);

  const { data: contractData, refetch: refetchContract } = useReadContracts({
    contracts: contractAddress
      ? [
          {
            address: contractAddress,
            abi: chromiesCommemorativeAbi,
            functionName: "mintOpen",
            chainId: robinhoodChain.id,
          },
          {
            address: contractAddress,
            abi: chromiesCommemorativeAbi,
            functionName: "totalSupply",
            chainId: robinhoodChain.id,
          },
          {
            address: contractAddress,
            abi: chromiesCommemorativeAbi,
            functionName: "MAX_SUPPLY",
            chainId: robinhoodChain.id,
          },
          {
            address: contractAddress,
            abi: chromiesCommemorativeAbi,
            functionName: "MINT_PRICE",
            chainId: robinhoodChain.id,
          },
          {
            address: contractAddress,
            abi: chromiesCommemorativeAbi,
            functionName: "MAX_PER_WALLET",
            chainId: robinhoodChain.id,
          },
          ...(address
            ? [
                {
                  address: contractAddress,
                  abi: chromiesCommemorativeAbi,
                  functionName: "walletMinted",
                  args: [address],
                  chainId: robinhoodChain.id,
                },
              ]
            : []),
        ]
      : [],
    query: { enabled: Boolean(contractAddress) },
  });

  const mintOpen = contractData?.[0]?.result;
  const totalSupply = contractData?.[1]?.result;
  const maxSupply = contractData?.[2]?.result;
  const mintPrice = contractData?.[3]?.result;
  const maxPerWallet = contractData?.[4]?.result;
  const walletMinted = address ? contractData?.[5]?.result : undefined;

  const maxQuantity = useMemo(() => {
    if (maxPerWallet === undefined) return 0;
    const claimed = walletMinted !== undefined ? Number(walletMinted) : 0;
    return Math.max(0, Number(maxPerWallet) - claimed);
  }, [maxPerWallet, walletMinted]);

  const totalPrice = useMemo(() => {
    if (mintPrice === undefined) return undefined;
    return mintPrice * BigInt(quantity);
  }, [mintPrice, quantity]);

  const handleMint = useCallback(async () => {
    if (!contractAddress || !walletClient || !publicClient || mintPrice === undefined) return;

    setMintError(null);
    setMintedTokenIds([]);
    setIsMinting(true);

    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: chromiesCommemorativeAbi,
        functionName: "mint",
        args: [BigInt(quantity)],
        value: mintPrice * BigInt(quantity),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setMintedTokenIds(extractMintedTokenIds(receipt));
      await refetchContract();
    } catch (error) {
      setMintError(shortenError(error));
    } finally {
      setIsMinting(false);
    }
  }, [contractAddress, walletClient, publicClient, mintPrice, quantity, refetchContract]);

  const mintDisabledReason = useMemo(() => {
    if (!isConnected) return "Connect wallet to mint";
    if (!onRobinhood) return "Switch to Robinhood Chain";
    if (!walletClient) return "Wallet not ready";
    if (!isChromiesCommemorativeDeployed(chainId)) return "Not deployed on this network yet";
    if (mintOpen === false) return "Mint not open yet";
    if (maxQuantity <= 0) return "Wallet limit reached (2 max)";
    if (totalSupply !== undefined && maxSupply !== undefined && totalSupply >= maxSupply) {
      return "Sold out";
    }
    return null;
  }, [isConnected, onRobinhood, walletClient, chainId, mintOpen, maxQuantity, totalSupply, maxSupply]);

  const buttonLabel = (() => {
    if (mintedTokenIds.length > 0 && !isMinting) {
      if (mintedTokenIds.length === 1) {
        return `Chromie #${mintedTokenIds[0]} minted!`;
      }
      return `${mintedTokenIds.length} Chromies minted!`;
    }
    if (isMinting) return "Confirm in wallet…";
    if (mintDisabledReason) return mintDisabledReason;
    const priceLabel = formatEth(totalPrice);
    return quantity > 1 ? `Mint ${quantity} — ${priceLabel}` : `Mint — ${priceLabel}`;
  })();

  const infoCards = [
    { value: formatEth(totalPrice), label: quantity > 1 ? `Total (${quantity}×)` : "Price" },
    { value: maxSupply !== undefined ? String(maxSupply) : "100", label: "Supply" },
    { value: maxQuantity > 0 ? String(maxQuantity) : "0", label: "Remaining" },
  ];

  const showQuantity = isConnected && maxQuantity > 0 && mintOpen;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-20 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto mb-4 inline-block border border-signal px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-signal">
            Chain Launch Edition
          </div>
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">
            CHROMIES: ROBINHOOD CHAIN COMMEMORATIVE
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            The canonical first 100 — fully on-chain, rendered by the same engine as the
            original Chromies collection. 0.0169 ETH, max 2 per wallet.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium text-ink/60">
            Holders at snapshot receive whitelist access and free ETH-edition Chromies at
            main launch.
          </p>

          <div className="mt-10">
            <MintStatus
              mintOpen={mintOpen}
              totalSupply={totalSupply}
              maxSupply={maxSupply}
              price={mintPrice}
              chainId={chainId}
              isConnected={isConnected}
            />
          </div>

          <div className="mt-10 flex w-full max-w-sm flex-col items-center gap-4 sm:max-w-none sm:gap-6">
            <WalletButton
              className="w-full sm:w-auto"
              connectClassName={MINT_CONNECT_BTN_CLASS}
              requiredChain={robinhoodChain}
            />

            {showQuantity && (
              <QuantitySelector
                quantity={quantity}
                maxQuantity={maxQuantity}
                onChange={setQuantity}
                disabled={isMinting || Boolean(mintDisabledReason)}
              />
            )}

            {showQuantity && mintPrice !== undefined && quantity > 1 && (
              <p className="text-sm text-ink/60">
                {formatEth(mintPrice)} × {quantity} ={" "}
                <strong className="text-ink">{formatEth(totalPrice)}</strong>
              </p>
            )}

            <button
              type="button"
              onClick={handleMint}
              disabled={Boolean(mintDisabledReason) || isMinting}
              className="border border-signal bg-signal px-8 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40 disabled:hover:bg-ink/10 disabled:hover:text-ink/40"
            >
              {buttonLabel}
            </button>

            {mintError && <p className="max-w-md text-sm text-red-600">{mintError}</p>}

            {mintedTokenIds.length > 0 && (
              <p className="text-sm font-semibold text-signal">
                {mintedTokenIds.length === 1
                  ? `Chromie #${String(mintedTokenIds[0])} minted successfully.`
                  : `Chromies #${mintedTokenIds.map(String).join(", #")} minted successfully.`}
              </p>
            )}

            <p className="max-w-sm text-xs text-ink/50">
              Max 2 per wallet · 100 total · Robinhood Chain mainnet only.
            </p>
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
            Each Chain Launch Edition Chromie is a fully on-chain 64×64 pixel identity,
            rendered by the same ChromaRenderer bytecode that powers the original
            collection — pre-inscribed and permanent from the moment you mint.
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

      <SiteFooter />
    </div>
  );
}
