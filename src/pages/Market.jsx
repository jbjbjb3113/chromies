import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { formatEther, parseEther, zeroAddress } from "viem";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import WalletSelectModal from "../components/WalletSelectModal.jsx";
import { pixelMarketplaceAbi } from "../../abis/PixelMarketplace.ts";
import {
  CANVAS_ADDRESS,
  DEFAULT_CHAIN,
  getCanvasAddress,
  getChromaAddress,
  getMarketplaceAddress,
} from "../lib/chroma-contract.js";
import {
  fetchChromieMetadata,
  fetchOnChainTokenMetadata,
  tokenPngUrl,
} from "../lib/chromie-token.js";

/** PixelMarketplace deploy block on Sepolia — use as fromBlock for any event queries. */
export const MARKETPLACE_DEPLOY_BLOCK = 11037727n;

/** Temporary mock listings for layout/design testing — remove before launch. */
const MOCK_LISTINGS = [
  { id: "mock-1", tokenId: 42, collection: "CHROMIES", apAmount: 150, priceEth: "0.005", seller: "0x1234567890123456789012345678901234567890" },
  { id: "mock-2", tokenId: 108, collection: "CHROMIES", apAmount: 75, priceEth: "0.002", seller: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" },
  { id: "mock-3", tokenId: 7, collection: "NORMIES", apAmount: 300, priceEth: "0.012", seller: "0x9876543210987654321098765432109876543210" },
  { id: "mock-4", tokenId: 256, collection: "CHROMIES", apAmount: 50, priceEth: "0.0015", seller: "0x1111222233334444555566667777888899990000" },
  { id: "mock-5", tokenId: 19, collection: "NORMIES", apAmount: 500, priceEth: "0.02", seller: "0xAAAA1111BBBB2222CCCC3333DDDD4444EEEE5555" },
  { id: "mock-6", tokenId: 333, collection: "CHROMIES", apAmount: 200, priceEth: "0.008", seller: "0x5555666677778888999900001111222233334444" },
];

const CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

const INPUT_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-signal";

const TRAIT_ORDER = [
  "Character",
  "Palette",
  "Hood",
  "Shirt",
  "Body",
  "Bodytattoo",
  "Necklace",
  "Tattoo",
  "Beard",
  "Mustache",
  "Eyes",
  "Earrings",
  "Glasses",
  "Hair",
  "Mutation",
  "Drift",
  "Level",
  "Burns Absorbed",
  "Customized",
  "Pixels Edited",
  "Total Pixels",
];

function orderTraits(attributes = []) {
  const byType = new Map(attributes.map((attr) => [attr.trait_type, attr]));
  const ordered = [];
  for (const traitType of TRAIT_ORDER) {
    const attr = byType.get(traitType);
    if (attr) ordered.push(attr);
  }
  for (const attr of attributes) {
    if (!TRAIT_ORDER.includes(attr.trait_type)) ordered.push(attr);
  }
  return ordered;
}

function formatTraitValue(attr) {
  if (attr?.value === undefined || attr?.value === null) return "—";
  return String(attr.value);
}

function listingPriceLabel(listing, isDemo) {
  if (isDemo) {
    return `${Number(listing.priceEth).toFixed(Number(listing.priceEth) < 0.01 ? 4 : 3)} ETH`;
  }
  return formatEthPrice(listing.price);
}

function listingApAmount(listing, isDemo) {
  return isDemo ? listing.apAmount : listing.amount;
}

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function collectionLabel(canvasAddress, chainId) {
  const chromiesCanvas = CANVAS_ADDRESS[chainId];
  if (chromiesCanvas && canvasAddress?.toLowerCase() === chromiesCanvas.toLowerCase()) {
    return "CHROMIES";
  }
  return shortenAddress(canvasAddress ?? "0x0000000000000000");
}

function errorMessage(error) {
  const message = error?.shortMessage ?? error?.message ?? "Transaction failed";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

function formatEthPrice(wei) {
  const value = Number(formatEther(wei));
  if (value === 0) return "0 ETH";
  if (value < 0.0001) return `${value.toFixed(6)} ETH`;
  if (value < 0.01) return `${value.toFixed(4)} ETH`;
  return `${value.toFixed(3)} ETH`;
}

function TraitBadge({ label, value }) {
  return (
    <div className="border border-ink/20 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink/40">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

function TokenViewerModal({
  open,
  onClose,
  listing,
  isDemo = false,
  collectionOverride,
  chainId,
  publicClient,
  chromaAddress,
}) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  const tokenId = listing ? Number(listing.tokenId) : null;
  const collection =
    collectionOverride ?? (listing ? collectionLabel(listing.canvas, chainId) : "CHROMIES");
  const tokenLabel = collection === "NORMIES" ? "Normie" : "Chromie";
  const priceLabel = listing ? listingPriceLabel(listing, isDemo) : "";
  const apAmount = listing ? listingApAmount(listing, isDemo) : 0;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !listing || !Number.isFinite(tokenId) || tokenId < 1) {
      setMetadata(null);
      setError(null);
      setLoading(false);
      setImageFailed(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMetadata(null);
    setImageFailed(false);

    (async () => {
      try {
        let data = null;
        if (publicClient && chromaAddress) {
          try {
            data = await fetchOnChainTokenMetadata(publicClient, chromaAddress, tokenId);
          } catch {
            data = await fetchChromieMetadata(tokenId);
          }
        } else {
          data = await fetchChromieMetadata(tokenId);
        }
        if (!cancelled) setMetadata(data);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load token metadata.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, listing, tokenId, publicClient, chromaAddress]);

  if (!open || !listing) return null;

  const traits = orderTraits(metadata?.attributes ?? []);
  const imageSrc =
    !imageFailed && metadata?.image ? metadata.image : tokenPngUrl(tokenId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-viewer-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto border border-ink bg-paper shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              {collection}
              {isDemo && (
                <span className="ml-2 border border-signal/40 bg-signal/10 px-1.5 py-0.5 text-signal">
                  Demo
                </span>
              )}
            </p>
            <h2 id="token-viewer-title" className="mt-1 text-xl font-black tracking-tight text-ink">
              {metadata?.name ?? `${tokenLabel} #${tokenId}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close token viewer"
            className="shrink-0 border border-ink px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ink/60 transition-colors hover:border-signal hover:text-signal"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <div className="overflow-hidden border border-ink bg-white">
              <div className="aspect-square w-full bg-[linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] bg-paper">
                {loading ? (
                  <div className="flex h-full min-h-[280px] items-center justify-center text-xs uppercase tracking-widest text-ink/40">
                    Loading…
                  </div>
                ) : (
                  <img
                    src={imageSrc}
                    alt={metadata?.name ?? `${tokenLabel} #${tokenId}`}
                    draggable={false}
                    className="pixelated h-full w-full object-contain"
                    onError={() => setImageFailed(true)}
                  />
                )}
              </div>
            </div>

            <div className="mt-4 border border-ink bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-signal">
                Listing
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">AP</p>
                  <p className="mt-0.5 font-symtext text-lg font-black text-ink">
                    {apAmount.toString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">Price</p>
                  <p className="mt-0.5 font-symtext text-lg font-black text-ink">{priceLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">Seller</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-ink">
                    {shortenAddress(listing.seller)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              Traits
            </p>
            {loading && (
              <p className="text-xs uppercase tracking-widest text-ink/40">Loading traits…</p>
            )}
            {error && (
              <p className="text-sm text-signal">{error}</p>
            )}
            {!loading && !error && traits.length === 0 && (
              <p className="text-xs text-ink/50">No traits found in token metadata.</p>
            )}
            {!loading && traits.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {traits.map((attr) => (
                  <TraitBadge
                    key={attr.trait_type}
                    label={attr.trait_type}
                    value={formatTraitValue(attr)}
                  />
                ))}
              </div>
            )}
            {metadata?.description && (
              <p className="mt-4 text-xs leading-relaxed text-ink/60">{metadata.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PixelPlaceholderIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 text-ink/25" aria-hidden="true">
      <rect width="64" height="64" fill="currentColor" opacity="0.08" />
      <rect x="20" y="18" width="24" height="24" fill="currentColor" opacity="0.35" />
      <rect x="24" y="44" width="16" height="6" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function TokenThumbnail({ tokenId }) {
  const [failed, setFailed] = useState(false);
  const id = Number(tokenId);

  if (failed || !Number.isFinite(id) || id < 1) {
    return (
      <div className="flex aspect-square w-full items-center justify-center border-b border-ink/10 bg-ink/[0.03]">
        <PixelPlaceholderIcon />
      </div>
    );
  }

  return (
    <div className="aspect-square w-full overflow-hidden border-b border-ink/10 bg-ink/[0.03]">
      <img
        src={tokenPngUrl(id)}
        alt={`Chromie #${tokenId}`}
        draggable={false}
        className="pixelated h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ListingCard({
  listing,
  chainId,
  isOwn,
  busy,
  onBuy,
  onCancel,
  onView,
  isDemo = false,
  collectionOverride,
}) {
  const [buyerTokenId, setBuyerTokenId] = useState("");
  const collection = collectionOverride ?? collectionLabel(listing.canvas, chainId);
  const tokenLabel = collection === "NORMIES" ? "Normie" : "Chromie";
  const priceLabel = listingPriceLabel(listing, isDemo);

  return (
    <article className="relative flex flex-col overflow-hidden border border-ink bg-white transition-colors hover:border-signal/60">
      {isDemo && (
        <span className="absolute right-2 top-2 z-10 border border-signal/40 bg-signal/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-signal">
          Demo
        </span>
      )}
      <button
        type="button"
        onClick={() => onView?.(listing)}
        className="block w-full text-left transition-opacity hover:opacity-95"
        aria-label={`View ${tokenLabel} #${listing.tokenId.toString()}`}
      >
        <TokenThumbnail tokenId={listing.tokenId} />
      </button>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              {collection}
            </p>
            <h3 className="mt-1 text-base font-black tracking-tight text-ink">
              {tokenLabel} #{listing.tokenId.toString()}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onView?.(listing)}
            className="shrink-0 border border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
          >
            View
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-ink/20 bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-ink/60">
            {listingApAmount(listing, isDemo).toString()} AP
          </span>
        </div>

        <div className="mt-auto space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
            Price
          </p>
          <p className="font-symtext text-2xl font-black tabular-nums text-ink">
            {priceLabel}
          </p>
          <p className="text-xs tabular-nums text-ink/50">
            Seller {isOwn ? "you" : shortenAddress(listing.seller)}
          </p>
        </div>

        <div className="pt-1">
          {isDemo ? (
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed border border-ink/20 bg-ink/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink/40"
            >
              Demo listing
            </button>
          ) : isOwn ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancel(listing)}
              className="w-full border border-ink bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40"
            >
              Cancel listing
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="number"
                min="1"
                value={buyerTokenId}
                onChange={(event) => setBuyerTokenId(event.target.value)}
                placeholder="Your token # to receive AP"
                className={INPUT_CLASS}
              />
              <button
                type="button"
                disabled={busy || !buyerTokenId}
                onClick={() => onBuy(listing, buyerTokenId)}
                className="w-full border border-signal bg-signal px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40 disabled:hover:bg-ink/10"
              >
                Buy for {priceLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Market() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const onSepolia = chainId === DEFAULT_CHAIN.id;
  const marketplaceAddress = onSepolia ? getMarketplaceAddress(chainId) : null;
  const canvasAddress = onSepolia ? getCanvasAddress(chainId) : null;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [listTokenId, setListTokenId] = useState("");
  const [listAmount, setListAmount] = useState("");
  const [listPrice, setListPrice] = useState("");

  const [pendingAction, setPendingAction] = useState(null); // "list" | "buy:<id>" | "cancel:<id>"
  const [txError, setTxError] = useState(null);
  const [txNotice, setTxNotice] = useState(null);
  const [viewerState, setViewerState] = useState(null);

  const chromaAddress = onSepolia ? getChromaAddress(chainId) : null;

  const openViewer = useCallback((listing, { isDemo = false, collectionOverride } = {}) => {
    setViewerState({ listing, isDemo, collectionOverride });
  }, []);

  const closeViewer = useCallback(() => {
    setViewerState(null);
  }, []);

  const fetchListings = useCallback(async () => {
    if (!publicClient || !marketplaceAddress) return;
    setLoadingListings(true);
    setLoadError(null);
    try {
      // Read listings straight from contract state: loop the listings mapping
      // up to nextListingId. Sold/cancelled listings are deleted (zeroed), so
      // an empty seller means inactive. More reliable than log scanning.
      const nextListingId = await publicClient.readContract({
        address: marketplaceAddress,
        abi: pixelMarketplaceAbi,
        functionName: "nextListingId",
      });

      const ids = [];
      for (let id = 1n; id < nextListingId; id += 1n) ids.push(id);

      const rows = await Promise.all(
        ids.map((id) =>
          publicClient.readContract({
            address: marketplaceAddress,
            abi: pixelMarketplaceAbi,
            functionName: "listings",
            args: [id],
          }),
        ),
      );

      const active = rows
        .map(([seller, canvas, tokenId, amount, price], index) => ({
          listingId: ids[index],
          seller,
          canvas,
          tokenId,
          amount,
          price,
        }))
        .filter((listing) => listing.seller !== zeroAddress)
        .sort((a, b) => (b.listingId > a.listingId ? 1 : -1));

      setListings(active);
    } catch (error) {
      console.error("Failed to load marketplace listings:", error);
      setLoadError(errorMessage(error));
    } finally {
      setLoadingListings(false);
    }
  }, [publicClient, marketplaceAddress]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const runTx = useCallback(
    async (actionKey, buildRequest, successNotice) => {
      if (!walletClient || !publicClient) return;
      setPendingAction(actionKey);
      setTxError(null);
      setTxNotice(null);
      try {
        const hash = await walletClient.writeContract(buildRequest());
        await publicClient.waitForTransactionReceipt({ hash });
        setTxNotice(successNotice);
        await fetchListings();
      } catch (error) {
        console.error("Marketplace transaction failed:", error);
        setTxError(errorMessage(error));
      } finally {
        setPendingAction(null);
      }
    },
    [walletClient, publicClient, fetchListings],
  );

  const handleList = (event) => {
    event.preventDefault();
    if (!marketplaceAddress || !canvasAddress) return;
    runTx(
      "list",
      () => ({
        address: marketplaceAddress,
        abi: pixelMarketplaceAbi,
        functionName: "list",
        args: [
          canvasAddress,
          BigInt(listTokenId),
          BigInt(listAmount),
          parseEther(listPrice),
        ],
        account: address,
      }),
      `Listed ${listAmount} AP from token #${listTokenId}`,
    );
  };

  const handleBuy = (listing, buyerTokenId) => {
    runTx(
      `buy:${listing.listingId}`,
      () => ({
        address: marketplaceAddress,
        abi: pixelMarketplaceAbi,
        functionName: "buy",
        args: [listing.listingId, BigInt(buyerTokenId)],
        value: listing.price,
        account: address,
      }),
      `Bought ${listing.amount.toString()} AP into token #${buyerTokenId}`,
    );
  };

  const handleCancel = (listing) => {
    runTx(
      `cancel:${listing.listingId}`,
      () => ({
        address: marketplaceAddress,
        abi: pixelMarketplaceAbi,
        functionName: "cancel",
        args: [listing.listingId],
        account: address,
      }),
      `Cancelled listing #${listing.listingId.toString()}`,
    );
  };

  const listFormValid = useMemo(() => {
    if (!listTokenId || !listAmount || !listPrice) return false;
    try {
      return BigInt(listTokenId) > 0n && BigInt(listAmount) > 0n && parseEther(listPrice) > 0n;
    } catch {
      return false;
    }
  }, [listTokenId, listAmount, listPrice]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">
            PIXEL MARKETPLACE
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            Trade Action Points token-to-token (NFT to NFT). Non-custodial — AP stays in the
            seller&apos;s Chromie until the moment of purchase.
          </p>

          {!isConnected && (
            <div className="mt-10 flex justify-center">
              <WalletSelectModal
                open={walletModalOpen}
                onOpen={() => setWalletModalOpen(true)}
                onClose={() => setWalletModalOpen(false)}
                buttonClassName={CONNECT_BTN_CLASS}
              />
            </div>
          )}

          {isConnected && !onSepolia && (
            <p className="mt-8 text-sm font-semibold text-signal">
              The Pixel Marketplace lives on Sepolia testnet — switch your wallet network.
            </p>
          )}
        </div>
      </section>

      {isConnected && onSepolia && (
        <section className="border-b border-ink px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-xl font-extrabold uppercase tracking-[0.2em] text-ink/50">
              List AP
            </h2>
            <form
              onSubmit={handleList}
              className="mx-auto mt-8 flex max-w-xl flex-col gap-4 border border-ink bg-white px-6 py-6 sm:flex-row sm:items-end"
            >
              <label className="flex-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
                  Your token #
                </span>
                <input
                  type="number"
                  min="1"
                  value={listTokenId}
                  onChange={(event) => setListTokenId(event.target.value)}
                  placeholder="1"
                  className={`${INPUT_CLASS} mt-1`}
                />
              </label>
              <label className="flex-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
                  AP amount
                </span>
                <input
                  type="number"
                  min="1"
                  value={listAmount}
                  onChange={(event) => setListAmount(event.target.value)}
                  placeholder="100"
                  className={`${INPUT_CLASS} mt-1`}
                />
              </label>
              <label className="flex-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
                  Price (ETH)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={listPrice}
                  onChange={(event) => setListPrice(event.target.value)}
                  placeholder="0.01"
                  className={`${INPUT_CLASS} mt-1`}
                />
              </label>
              <button
                type="submit"
                disabled={!listFormValid || pendingAction !== null}
                className="border border-signal bg-signal px-6 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40 disabled:hover:bg-ink/10"
              >
                {pendingAction === "list" ? "Listing…" : "List"}
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold uppercase tracking-[0.2em] text-ink/50">
              Active Listings
            </h2>
            <button
              type="button"
              onClick={fetchListings}
              disabled={loadingListings}
              className="text-xs uppercase tracking-widest text-ink/60 transition-colors hover:text-signal disabled:cursor-not-allowed disabled:text-ink/30"
            >
              {loadingListings ? "Loading…" : "Refresh"}
            </button>
          </div>

          {txNotice && (
            <p className="mt-6 text-sm font-semibold text-signal">{txNotice}</p>
          )}
          {txError && <p className="mt-6 text-sm text-red-600">{txError}</p>}
          {loadError && <p className="mt-6 text-sm text-red-600">{loadError}</p>}

          {listings.length === 0 && !loadingListings && (
            <p className="mt-6 text-center text-xs uppercase tracking-[0.15em] text-ink/40">
              No on-chain listings — showing demo cards for layout preview
            </p>
          )}

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MOCK_LISTINGS.map((mock) => (
              <ListingCard
                key={mock.id}
                isDemo
                collectionOverride={mock.collection}
                listing={{
                  tokenId: BigInt(mock.tokenId),
                  apAmount: mock.apAmount,
                  priceEth: mock.priceEth,
                  seller: mock.seller,
                }}
                chainId={chainId}
                isOwn={false}
                busy={false}
                onView={(listing) =>
                  openViewer(listing, { isDemo: true, collectionOverride: mock.collection })
                }
              />
            ))}
            {listings.map((listing) => (
              <ListingCard
                key={listing.listingId.toString()}
                listing={listing}
                chainId={chainId}
                isOwn={Boolean(address) && listing.seller.toLowerCase() === address.toLowerCase()}
                busy={pendingAction !== null}
                onBuy={handleBuy}
                onCancel={handleCancel}
                onView={(item) => openViewer(item)}
              />
            ))}
          </div>
        </div>
      </section>

      <TokenViewerModal
        open={viewerState !== null}
        onClose={closeViewer}
        listing={viewerState?.listing ?? null}
        isDemo={viewerState?.isDemo ?? false}
        collectionOverride={viewerState?.collectionOverride}
        chainId={chainId}
        publicClient={publicClient}
        chromaAddress={chromaAddress}
      />

      <SiteFooter />
    </div>
  );
}
