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
  getMarketplaceAddress,
} from "../lib/chroma-contract.js";
import { tokenPngUrl } from "../lib/chromie-token.js";

/** PixelMarketplace deploy block on Sepolia — use as fromBlock for any event queries. */
export const MARKETPLACE_DEPLOY_BLOCK = 11037727n;

const CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

const INPUT_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-signal";

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

function ListingCard({ listing, chainId, isOwn, busy, onBuy, onCancel }) {
  const [buyerTokenId, setBuyerTokenId] = useState("");
  const collection = collectionLabel(listing.canvas, chainId);
  const priceLabel = formatEthPrice(listing.price);

  return (
    <article className="flex flex-col overflow-hidden border border-ink bg-white transition-colors hover:border-signal/60">
      <TokenThumbnail tokenId={listing.tokenId} />

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
            {collection}
          </p>
          <h3 className="mt-1 text-base font-black tracking-tight text-ink">
            Chromie #{listing.tokenId.toString()}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-ink/20 bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-ink/60">
            {listing.amount.toString()} AP
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
          {isOwn ? (
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
            AP MARKET
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            Trade Action Points token-to-token. Non-custodial — AP stays in the
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
              The AP market lives on Sepolia testnet — switch your wallet network.
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

          {listings.length === 0 && !loadingListings ? (
            <div className="mt-8 border border-ink/30 px-6 py-10 text-center text-sm text-ink/50">
              No active listings. Be the first — burn a Chromie, earn AP, list it here.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.listingId.toString()}
                  listing={listing}
                  chainId={chainId}
                  isOwn={Boolean(address) && listing.seller.toLowerCase() === address.toLowerCase()}
                  busy={pendingAction !== null}
                  onBuy={handleBuy}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
