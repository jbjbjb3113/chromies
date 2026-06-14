import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import WalletSelectModal from "../components/WalletSelectModal.jsx";
import TokenThumbnail from "../components/TokenThumbnail.jsx";
import TokenViewerModal from "../components/TokenViewerModal.jsx";
import { chromaAbi, DEFAULT_CHAIN, getChromaAddress } from "../lib/chroma-contract.js";
import { fetchOnChainTokenMetadata } from "../lib/chromie-token.js";
import {
  fetchOwnedChromaTokenIds,
  fetchTokenLockStatus,
  fetchTokenRevealStatus,
} from "../lib/chroma-ownership.js";
import { getRevealPayload, preloadRevealData } from "../lib/chroma-reveal.js";

const CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

const REVEAL_BTN_CLASS =
  "shrink-0 border border-signal bg-signal px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40";

const TRAIT_PREVIEW = ["Character", "Palette", "Hair", "Shirt", "Eyes"];

function errorMessage(error) {
  const message = error?.shortMessage ?? error?.message ?? "Transaction failed";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

function OwnedChromieCard({
  tokenId,
  isRevealed,
  revealing,
  onReveal,
  onView,
  publicClient,
  chromaAddress,
  refreshKey,
}) {
  const id = tokenId.toString();
  const [traits, setTraits] = useState([]);
  const [traitsLoading, setTraitsLoading] = useState(false);

  useEffect(() => {
    if (!isRevealed || !publicClient || !chromaAddress) {
      setTraits([]);
      return undefined;
    }

    let cancelled = false;
    setTraitsLoading(true);

    fetchOnChainTokenMetadata(publicClient, chromaAddress, Number(tokenId))
      .then((metadata) => {
        if (cancelled) return;
        const attrs = metadata?.attributes ?? [];
        const preview = TRAIT_PREVIEW.map((type) => attrs.find((a) => a.trait_type === type)).filter(
          Boolean,
        );
        setTraits(preview);
      })
      .catch(() => {
        if (!cancelled) setTraits([]);
      })
      .finally(() => {
        if (!cancelled) setTraitsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isRevealed, publicClient, chromaAddress, tokenId, refreshKey]);

  return (
    <article
      className={`relative flex flex-col overflow-hidden border bg-white transition-colors ${
        isRevealed ? "border-ink hover:border-signal/60" : "border-ink hover:border-signal/60"
      }`}
    >
      {!isRevealed && (
        <div className="absolute right-2 top-2 z-10 border border-amber-600/50 bg-amber-50 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-amber-800">
          Unrevealed
        </div>
      )}

      {isRevealed ? (
        <button
          type="button"
          onClick={() => onView(tokenId)}
          className="block w-full text-left transition-opacity hover:opacity-95"
          aria-label={`View Chromie #${id}`}
        >
          <TokenThumbnail
            tokenId={tokenId}
            publicClient={publicClient}
            chromaAddress={chromaAddress}
            refreshKey={refreshKey}
          />
        </button>
      ) : (
        <div className="pointer-events-none">
          <TokenThumbnail
            tokenId={tokenId}
            publicClient={publicClient}
            chromaAddress={chromaAddress}
            refreshKey={refreshKey}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">CHROMIES</p>
            <h3 className="mt-1 text-base font-black tracking-tight text-ink">Chromie #{id}</h3>
          </div>
          {isRevealed ? (
            <button
              type="button"
              onClick={() => onView(tokenId)}
              className="shrink-0 border border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
            >
              View
            </button>
          ) : (
            <button
              type="button"
              disabled={revealing}
              onClick={() => onReveal(tokenId)}
              className={REVEAL_BTN_CLASS}
            >
              {revealing ? "Revealing…" : "Reveal"}
            </button>
          )}
        </div>

        {isRevealed && traitsLoading && (
          <p className="text-[10px] uppercase tracking-wider text-ink/40">Loading traits…</p>
        )}

        {isRevealed && !traitsLoading && traits.length > 0 && (
          <ul className="space-y-1 text-[10px] text-ink/70">
            {traits.map((attr) => (
              <li key={attr.trait_type} className="flex justify-between gap-2">
                <span className="font-bold uppercase tracking-wide text-ink/45">{attr.trait_type}</span>
                <span className="font-semibold text-ink">{String(attr.value)}</span>
              </li>
            ))}
          </ul>
        )}

        {isRevealed && (
          <div className="mt-auto">
            <Link
              to="/canvas"
              className="inline-block text-[10px] font-bold uppercase tracking-wider text-ink/50 transition-colors hover:text-signal"
            >
              Open in Canvas →
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

export default function MyChromies() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const onSepolia = chainId === DEFAULT_CHAIN.id;
  const chromaAddress = onSepolia ? getChromaAddress(chainId) : null;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenIds, setTokenIds] = useState([]);
  const [revealedByTokenId, setRevealedByTokenId] = useState({});
  const [inscribableCount, setInscribableCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  const [revealingTokenId, setRevealingTokenId] = useState(null);
  const [progressStep, setProgressStep] = useState("");
  const [txError, setTxError] = useState(null);
  const [successTokenId, setSuccessTokenId] = useState(null);
  const [thumbnailRefresh, setThumbnailRefresh] = useState(0);
  const [viewerTokenId, setViewerTokenId] = useState(null);

  const unrevealedCount = tokenIds.filter((id) => revealedByTokenId[id.toString()] !== true).length;

  const fetchOwned = useCallback(async () => {
    if (!publicClient || !chromaAddress || !address) {
      setTokenIds([]);
      setRevealedByTokenId({});
      setInscribableCount(0);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const ids = await fetchOwnedChromaTokenIds(publicClient, chromaAddress, address);
      const [revealed, locked] = await Promise.all([
        fetchTokenRevealStatus(publicClient, chromaAddress, ids),
        fetchTokenLockStatus(publicClient, chromaAddress, ids),
      ]);
      const inscribable = ids.filter(
        (id) => revealed[id.toString()] === true && locked[id.toString()] !== true,
      ).length;
      setTokenIds(ids);
      setRevealedByTokenId(revealed);
      setInscribableCount(inscribable);
    } catch (error) {
      console.error("Failed to load owned Chromies:", error);
      setLoadError(error?.shortMessage ?? error?.message ?? "Failed to load your Chromies.");
      setTokenIds([]);
      setRevealedByTokenId({});
      setInscribableCount(0);
    } finally {
      setLoading(false);
    }
  }, [publicClient, chromaAddress, address]);

  useEffect(() => {
    if (isConnected && onSepolia) {
      fetchOwned();
    } else {
      setTokenIds([]);
      setRevealedByTokenId({});
      setInscribableCount(0);
      setLoadError(null);
      setDataError(null);
    }
  }, [isConnected, onSepolia, fetchOwned]);

  useEffect(() => {
    if (!isConnected || !onSepolia || unrevealedCount === 0) {
      setDataLoading(false);
      return undefined;
    }

    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    preloadRevealData()
      .catch((error) => {
        console.error("Failed to preload reveal data:", error);
        if (!cancelled) setDataError(error?.message ?? "Failed to load reveal data.");
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, onSepolia, unrevealedCount]);

  const handleRevealClick = (tokenId) => {
    if (!isConnected) {
      setWalletModalOpen(true);
      return;
    }
    handleReveal(tokenId);
  };

  const handleReveal = async (tokenId) => {
    if (!walletClient || !publicClient || !chromaAddress || !address) return;
    if (revealingTokenId != null) return;

    const id = tokenId.toString();
    setRevealingTokenId(tokenId);
    setTxError(null);
    setSuccessTokenId(null);
    setProgressStep(`Preparing Chromie #${id}…`);

    try {
      const { pixelsHex, traitsHex, proof } = await getRevealPayload(tokenId);

      setProgressStep(`Confirm reveal for Chromie #${id}…`);
      const hash = await walletClient.writeContract({
        address: chromaAddress,
        abi: chromaAbi,
        functionName: "reveal",
        args: [tokenId, pixelsHex, traitsHex, proof],
        account: address,
      });

      setProgressStep("Waiting for confirmation…");
      await publicClient.waitForTransactionReceipt({ hash });

      setRevealedByTokenId((prev) => ({ ...prev, [id]: true }));
      setInscribableCount((n) => n + 1);
      setSuccessTokenId(tokenId);
      setThumbnailRefresh((n) => n + 1);
      setProgressStep(`Chromie #${id} revealed`);
    } catch (error) {
      console.error("Reveal failed:", error);
      setTxError(errorMessage(error));
      setProgressStep("");
    } finally {
      setRevealingTokenId(null);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">MY CHROMIES</h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            Chromies in your connected wallet on Sepolia.
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
              Switch to Sepolia testnet to see your Chromies.
            </p>
          )}
        </div>
      </section>

      <section className="px-6 py-14">
        <div className="mx-auto max-w-6xl">
          {isConnected && onSepolia && (
            <div className="mb-6 flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-ink/50">
                {loading
                  ? "Loading…"
                  : `${tokenIds.length} Chromie${tokenIds.length === 1 ? "" : "s"} owned${
                      unrevealedCount > 0 ? ` · ${unrevealedCount} unrevealed` : ""
                    }`}
              </p>
              <button
                type="button"
                onClick={fetchOwned}
                disabled={loading || revealingTokenId != null}
                className="text-xs uppercase tracking-widest text-ink/60 transition-colors hover:text-signal disabled:cursor-not-allowed disabled:text-ink/30"
              >
                Refresh
              </button>
            </div>
          )}

          {loadError && <p className="mb-6 text-sm text-red-600">{loadError}</p>}
          {dataError && <p className="mb-6 text-sm text-red-600">{dataError}</p>}

          {dataLoading && unrevealedCount > 0 && (
            <p className="mb-6 text-xs uppercase tracking-widest text-ink/45">
              Loading reveal data (~27 MB, cached after first load)…
            </p>
          )}

          {progressStep && (
            <div className="mb-6 border border-signal/40 bg-white px-4 py-3 text-sm text-ink">
              <p className="font-bold uppercase tracking-wide text-signal">{progressStep}</p>
            </div>
          )}

          {txError && <p className="mb-6 text-sm text-red-600">{txError}</p>}

          {successTokenId != null && (
            <div className="mb-6 border border-emerald-600/40 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Chromie #{successTokenId.toString()} revealed successfully. Traits are now on-chain.
            </div>
          )}

          {isConnected && onSepolia && !loading && inscribableCount > 0 && (
            <div className="mb-6 flex flex-col gap-3 border border-ink/40 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-ink">
                  {inscribableCount} Chromie{inscribableCount === 1 ? "" : "s"} ready to inscribe
                </p>
                <p className="mt-1 text-xs text-ink/60">
                  Permanently lock on-chain pixel data — canvas edits will be disabled forever.
                </p>
              </div>
              <Link
                to="/inscribe"
                className="shrink-0 border border-ink bg-ink px-5 py-2 text-xs font-bold uppercase tracking-wide text-paper transition-colors hover:bg-transparent hover:text-ink"
              >
                Inscribe
              </Link>
            </div>
          )}

          {isConnected && onSepolia && !loading && tokenIds.length === 0 && !loadError && (
            <div className="border border-ink bg-white px-6 py-12 text-center">
              <p className="text-base font-semibold text-ink">
                You don&apos;t own any Chromies yet
              </p>
              <Link
                to="/mint"
                className="mt-4 inline-block border border-signal bg-signal px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal"
              >
                Mint a Chromie
              </Link>
            </div>
          )}

          {isConnected && onSepolia && tokenIds.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {tokenIds.map((tokenId) => (
                <OwnedChromieCard
                  key={tokenId.toString()}
                  tokenId={tokenId}
                  isRevealed={revealedByTokenId[tokenId.toString()] === true}
                  revealing={revealingTokenId === tokenId}
                  onReveal={handleRevealClick}
                  onView={setViewerTokenId}
                  publicClient={publicClient}
                  chromaAddress={chromaAddress}
                  refreshKey={thumbnailRefresh}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <TokenViewerModal
        open={viewerTokenId !== null}
        onClose={() => setViewerTokenId(null)}
        tokenId={viewerTokenId}
        publicClient={publicClient}
        chromaAddress={chromaAddress}
      />

      <SiteFooter />
    </div>
  );
}
