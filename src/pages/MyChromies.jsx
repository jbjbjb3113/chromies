import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import WalletSelectModal from "../components/WalletSelectModal.jsx";
import TokenThumbnail from "../components/TokenThumbnail.jsx";
import TokenViewerModal from "../components/TokenViewerModal.jsx";
import { DEFAULT_CHAIN, getChromaAddress } from "../lib/chroma-contract.js";
import {
  fetchOwnedChromaTokenIds,
  fetchTokenLockStatus,
  fetchTokenRevealStatus,
} from "../lib/chroma-ownership.js";

const CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

function OwnedChromieCard({ tokenId, onView, publicClient, chromaAddress }) {
  return (
    <article className="relative flex flex-col overflow-hidden border border-ink bg-white transition-colors hover:border-signal/60">
      <button
        type="button"
        onClick={() => onView(tokenId)}
        className="block w-full text-left transition-opacity hover:opacity-95"
        aria-label={`View Chromie #${tokenId.toString()}`}
      >
        <TokenThumbnail
          tokenId={tokenId}
          publicClient={publicClient}
          chromaAddress={chromaAddress}
        />
      </button>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              CHROMIES
            </p>
            <h3 className="mt-1 text-base font-black tracking-tight text-ink">
              Chromie #{tokenId.toString()}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onView(tokenId)}
            className="shrink-0 border border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
          >
            View
          </button>
        </div>

        <div className="mt-auto">
          <Link
            to="/canvas"
            className="inline-block text-[10px] font-bold uppercase tracking-wider text-ink/50 transition-colors hover:text-signal"
          >
            Open in Canvas →
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function MyChromies() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const onSepolia = chainId === DEFAULT_CHAIN.id;
  const chromaAddress = onSepolia ? getChromaAddress(chainId) : null;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenIds, setTokenIds] = useState([]);
  const [unrevealedCount, setUnrevealedCount] = useState(0);
  const [inscribableCount, setInscribableCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [viewerTokenId, setViewerTokenId] = useState(null);

  const fetchOwned = useCallback(async () => {
    if (!publicClient || !chromaAddress || !address) {
      setTokenIds([]);
      setUnrevealedCount(0);
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
      const unrevealed = ids.filter((id) => revealed[id.toString()] !== true).length;
      const inscribable = ids.filter(
        (id) => revealed[id.toString()] === true && locked[id.toString()] !== true,
      ).length;
      setTokenIds(ids);
      setUnrevealedCount(unrevealed);
      setInscribableCount(inscribable);
    } catch (error) {
      console.error("Failed to load owned Chromies:", error);
      setLoadError(error?.shortMessage ?? error?.message ?? "Failed to load your Chromies.");
      setTokenIds([]);
      setUnrevealedCount(0);
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
      setUnrevealedCount(0);
      setInscribableCount(0);
      setLoadError(null);
    }
  }, [isConnected, onSepolia, fetchOwned]);

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
                  : `${tokenIds.length} Chromie${tokenIds.length === 1 ? "" : "s"} owned`}
              </p>
              <button
                type="button"
                onClick={fetchOwned}
                disabled={loading}
                className="text-xs uppercase tracking-widest text-ink/60 transition-colors hover:text-signal disabled:cursor-not-allowed disabled:text-ink/30"
              >
                Refresh
              </button>
            </div>
          )}

          {loadError && <p className="mb-6 text-sm text-red-600">{loadError}</p>}

          {isConnected && onSepolia && !loading && unrevealedCount > 0 && (
            <div className="mb-6 flex flex-col gap-3 border border-amber-600/40 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-900">
                  {unrevealedCount} unrevealed Chromie{unrevealedCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs text-amber-800/80">
                  Reveal placeholders to see your character and unlock burn AP.
                </p>
              </div>
              <Link
                to="/reveal"
                className="shrink-0 border border-signal bg-signal px-5 py-2 text-xs font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal"
              >
                Reveal now
              </Link>
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
                  onView={setViewerTokenId}
                  publicClient={publicClient}
                  chromaAddress={chromaAddress}
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
