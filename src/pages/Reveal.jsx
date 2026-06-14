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
import { fetchOwnedChromaTokenIds, fetchTokenRevealStatus } from "../lib/chroma-ownership.js";
import { getRevealPayload, preloadRevealData } from "../lib/chroma-reveal.js";

const CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

const REVEAL_BTN_CLASS =
  "w-full border border-signal bg-signal px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40";

const TRAIT_PREVIEW = ["Character", "Palette", "Hair", "Shirt", "Eyes"];

function errorMessage(error) {
  const message = error?.shortMessage ?? error?.message ?? "Transaction failed";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

function RevealTokenCard({
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
      className={`relative flex flex-col overflow-hidden border-2 bg-white transition-colors ${
        isRevealed ? "border-emerald-600/50" : "border-ink hover:border-signal/60"
      }`}
    >
      {!isRevealed && (
        <div className="absolute right-2 top-2 z-10 border border-amber-600/50 bg-amber-50 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-amber-800">
          Unrevealed
        </div>
      )}
      {isRevealed && (
        <div className="absolute right-2 top-2 z-10 border border-emerald-600/50 bg-emerald-50 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-emerald-800">
          Revealed
        </div>
      )}

      <div className={isRevealed ? "" : "pointer-events-none"}>
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
          <TokenThumbnail
            tokenId={tokenId}
            publicClient={publicClient}
            chromaAddress={chromaAddress}
            refreshKey={refreshKey}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 border-t border-ink/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">CHROMIES</p>
            <h3 className="mt-0.5 text-sm font-black tracking-tight text-ink">Chromie #{id}</h3>
          </div>
          {isRevealed && (
            <button
              type="button"
              onClick={() => onView(tokenId)}
              className="shrink-0 border border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
            >
              View
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

        {!isRevealed && (
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
    </article>
  );
}

export default function Reveal() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const onSepolia = chainId === DEFAULT_CHAIN.id;
  const chromaAddress = onSepolia ? getChromaAddress(chainId) : null;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenIds, setTokenIds] = useState([]);
  const [revealedByTokenId, setRevealedByTokenId] = useState({});
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

  const unrevealedTokenIds = tokenIds.filter((id) => revealedByTokenId[id.toString()] !== true);
  const revealedOwnedCount = tokenIds.length - unrevealedTokenIds.length;

  const fetchOwned = useCallback(async () => {
    if (!publicClient || !chromaAddress || !address) {
      setTokenIds([]);
      setRevealedByTokenId({});
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const ids = await fetchOwnedChromaTokenIds(publicClient, chromaAddress, address);
      const revealed = await fetchTokenRevealStatus(publicClient, chromaAddress, ids);
      setTokenIds(ids);
      setRevealedByTokenId(revealed);
    } catch (error) {
      console.error("Failed to load owned Chromies:", error);
      setLoadError(error?.shortMessage ?? error?.message ?? "Failed to load your Chromies.");
      setTokenIds([]);
      setRevealedByTokenId({});
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
      setLoadError(null);
      setDataError(null);
    }
  }, [isConnected, onSepolia, fetchOwned]);

  useEffect(() => {
    if (!isConnected || !onSepolia || unrevealedTokenIds.length === 0) {
      setDataLoading(false);
      return undefined;
    }

    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    preloadRevealData()
      .catch((error) => {
        console.error("Failed to preload reveal data:", error);
        if (!cancelled) {
          setDataError(error?.message ?? "Failed to load reveal data.");
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, onSepolia, unrevealedTokenIds.length]);

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

      setProgressStep(`Waiting for confirmation…`);
      await publicClient.waitForTransactionReceipt({ hash });

      setRevealedByTokenId((prev) => ({ ...prev, [id]: true }));
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
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">REVEAL</h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            Unveil your minted placeholder Chromies on-chain. Revealed tokens show their true
            character and traits.
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
              Switch to Sepolia testnet to reveal Chromies.
            </p>
          )}
        </div>
      </section>

      <section className="px-6 py-14">
        <div className="mx-auto max-w-6xl">
          {isConnected && onSepolia && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-widest text-ink/50">
                {loading
                  ? "Loading…"
                  : `${unrevealedTokenIds.length} unrevealed · ${revealedOwnedCount} already revealed`}
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

          {dataLoading && unrevealedTokenIds.length > 0 && (
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

          {isConnected && onSepolia && !loading && tokenIds.length > 0 && unrevealedTokenIds.length === 0 && (
            <div className="border border-ink bg-white px-6 py-12 text-center">
              <p className="text-base font-semibold text-ink">All your Chromies are revealed</p>
              <Link
                to="/my-chromies"
                className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-ink/60 transition-colors hover:text-signal"
              >
                View in My Chromies →
              </Link>
            </div>
          )}

          {isConnected && onSepolia && unrevealedTokenIds.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {unrevealedTokenIds.map((tokenId) => (
                <RevealTokenCard
                  key={tokenId.toString()}
                  tokenId={tokenId}
                  isRevealed={revealedByTokenId[tokenId.toString()] === true}
                  revealing={revealingTokenId === tokenId}
                  onReveal={handleReveal}
                  onView={setViewerTokenId}
                  publicClient={publicClient}
                  chromaAddress={chromaAddress}
                  refreshKey={thumbnailRefresh}
                />
              ))}
            </div>
          )}

          {isConnected && onSepolia && revealedOwnedCount > 0 && unrevealedTokenIds.length > 0 && (
            <div className="mt-12">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-ink/40">
                Already revealed
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {tokenIds
                  .filter((id) => revealedByTokenId[id.toString()] === true)
                  .map((tokenId) => (
                    <RevealTokenCard
                      key={tokenId.toString()}
                      tokenId={tokenId}
                      isRevealed
                      revealing={false}
                      onReveal={handleReveal}
                      onView={setViewerTokenId}
                      publicClient={publicClient}
                      chromaAddress={chromaAddress}
                      refreshKey={thumbnailRefresh}
                    />
                  ))}
              </div>
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
