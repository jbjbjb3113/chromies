import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import WalletSelectModal from "../components/WalletSelectModal.jsx";
import TokenThumbnail from "../components/TokenThumbnail.jsx";
import TokenViewerModal from "../components/TokenViewerModal.jsx";
import { chromaAbi, DEFAULT_CHAIN, getCanvasAddress, getChromaAddress } from "../lib/chroma-contract.js";
import { getInscribePayload, preloadRevealData } from "../lib/chroma-inscribe.js";
import {
  fetchOwnedChromaTokenIds,
  fetchTokenCanvasStats,
  fetchTokenLockStatus,
  fetchTokenRevealStatus,
} from "../lib/chroma-ownership.js";

const CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

const INSCRIBE_BTN_CLASS =
  "w-full border border-ink bg-ink px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-paper transition-colors hover:bg-transparent hover:text-ink disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40";

function errorMessage(error) {
  const message = error?.shortMessage ?? error?.message ?? "Transaction failed";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

function ConfirmInscribeModal({
  open,
  onClose,
  onConfirm,
  tokenId,
  customized,
  pixelsEdited,
  busy,
}) {
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setChecked(false);
    }
  }, [open]);

  if (!open) return null;

  const id = tokenId?.toString() ?? "";
  const canConfirm = typed.trim().toUpperCase() === "INSCRIBE" || checked;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      role="presentation"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-ink bg-paper shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-ink px-5 py-4">
          <h2 className="text-lg font-black uppercase tracking-tight text-ink">Inscribe & lock</h2>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-red-700">
            This permanently locks Chromie #{id}&apos;s pixel data on-chain. No further edits via
            canvas will ever be possible. This action cannot be undone.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="border border-ink bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">Current state</p>
            <ul className="mt-2 space-y-1 text-ink">
              <li>
                <span className="text-ink/60">Customized:</span>{" "}
                <span className="font-bold">{customized ? "Yes" : "No"}</span>
              </li>
              <li>
                <span className="text-ink/60">Pixels edited:</span>{" "}
                <span className="font-bold">{pixelsEdited?.toString() ?? "0"}</span>
              </li>
            </ul>
          </div>

          <label className="flex cursor-pointer items-start gap-3 border border-ink bg-white p-3">
            <input
              type="checkbox"
              checked={checked}
              disabled={busy}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 accent-signal"
            />
            <span className="text-xs leading-relaxed text-ink/80">
              I understand this is permanent and irreversible. Canvas edits will be blocked
              forever.
            </span>
          </label>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              Or type INSCRIBE to confirm
            </label>
            <input
              type="text"
              value={typed}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="INSCRIBE"
              className="mt-2 w-full border border-ink bg-white px-3 py-2 text-sm uppercase tracking-wider text-ink outline-none focus:border-signal"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-ink px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="border border-ink bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canConfirm}
            onClick={onConfirm}
            className="border border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-wide text-paper transition-colors hover:bg-transparent hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Inscribing…" : "Inscribe & lock forever"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InscribeTokenCard({
  tokenId,
  isLocked,
  customized,
  pixelsEdited,
  inscribing,
  onInscribe,
  onView,
  publicClient,
  chromaAddress,
}) {
  const id = tokenId.toString();

  return (
    <article
      className={`relative flex flex-col overflow-hidden border-2 bg-white transition-colors ${
        isLocked ? "border-ink/40" : "border-ink hover:border-signal/60"
      }`}
    >
      {isLocked ? (
        <div className="absolute right-2 top-2 z-10 border border-ink/50 bg-ink px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-paper">
          Inscribed 🔒
        </div>
      ) : (
        <div className="absolute right-2 top-2 z-10 border border-signal/50 bg-signal/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-signal">
          Unlocked
        </div>
      )}

      <button
        type="button"
        onClick={() => onView(tokenId)}
        className="block w-full text-left transition-opacity hover:opacity-95"
        aria-label={`View Chromie #${id}`}
      >
        <TokenThumbnail tokenId={tokenId} publicClient={publicClient} chromaAddress={chromaAddress} />
      </button>

      <div className="flex flex-1 flex-col gap-3 border-t border-ink/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">CHROMIES</p>
            <h3 className="mt-0.5 text-sm font-black tracking-tight text-ink">Chromie #{id}</h3>
          </div>
          <button
            type="button"
            onClick={() => onView(tokenId)}
            className="shrink-0 border border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
          >
            View
          </button>
        </div>

        <ul className="space-y-1 text-[10px] text-ink/70">
          <li className="flex justify-between gap-2">
            <span className="font-bold uppercase tracking-wide text-ink/45">Customized</span>
            <span className="font-semibold text-ink">{customized ? "Yes" : "No"}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span className="font-bold uppercase tracking-wide text-ink/45">Pixels edited</span>
            <span className="font-semibold text-ink">{pixelsEdited?.toString() ?? "0"}</span>
          </li>
        </ul>

        {!isLocked && (
          <button
            type="button"
            disabled={inscribing}
            onClick={() => onInscribe(tokenId)}
            className={INSCRIBE_BTN_CLASS}
          >
            {inscribing ? "Inscribing…" : "Inscribe & lock forever"}
          </button>
        )}
      </div>
    </article>
  );
}

export default function Inscribe() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const onSepolia = chainId === DEFAULT_CHAIN.id;
  const chromaAddress = onSepolia ? getChromaAddress(chainId) : null;
  const canvasAddress = onSepolia ? getCanvasAddress(chainId) : null;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenIds, setTokenIds] = useState([]);
  const [revealedByTokenId, setRevealedByTokenId] = useState({});
  const [lockedByTokenId, setLockedByTokenId] = useState({});
  const [canvasStatsByTokenId, setCanvasStatsByTokenId] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  const [confirmTokenId, setConfirmTokenId] = useState(null);
  const [inscribingTokenId, setInscribingTokenId] = useState(null);
  const [progressStep, setProgressStep] = useState("");
  const [txError, setTxError] = useState(null);
  const [successTokenId, setSuccessTokenId] = useState(null);
  const [viewerTokenId, setViewerTokenId] = useState(null);

  const inscribableTokenIds = tokenIds.filter(
    (id) => revealedByTokenId[id.toString()] === true && lockedByTokenId[id.toString()] !== true,
  );
  const inscribedCount = tokenIds.filter((id) => lockedByTokenId[id.toString()] === true).length;

  const fetchOwned = useCallback(async () => {
    if (!publicClient || !chromaAddress || !address) {
      setTokenIds([]);
      setRevealedByTokenId({});
      setLockedByTokenId({});
      setCanvasStatsByTokenId({});
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const ids = await fetchOwnedChromaTokenIds(publicClient, chromaAddress, address);
      const [revealed, locked, canvasStats] = await Promise.all([
        fetchTokenRevealStatus(publicClient, chromaAddress, ids),
        fetchTokenLockStatus(publicClient, chromaAddress, ids),
        canvasAddress
          ? fetchTokenCanvasStats(publicClient, canvasAddress, ids)
          : Promise.resolve({}),
      ]);
      setTokenIds(ids);
      setRevealedByTokenId(revealed);
      setLockedByTokenId(locked);
      setCanvasStatsByTokenId(canvasStats);
    } catch (error) {
      console.error("Failed to load owned Chromies:", error);
      setLoadError(error?.shortMessage ?? error?.message ?? "Failed to load your Chromies.");
      setTokenIds([]);
      setRevealedByTokenId({});
      setLockedByTokenId({});
      setCanvasStatsByTokenId({});
    } finally {
      setLoading(false);
    }
  }, [publicClient, chromaAddress, canvasAddress, address]);

  useEffect(() => {
    if (isConnected && onSepolia) {
      fetchOwned();
    } else {
      setTokenIds([]);
      setRevealedByTokenId({});
      setLockedByTokenId({});
      setCanvasStatsByTokenId({});
      setLoadError(null);
      setDataError(null);
    }
  }, [isConnected, onSepolia, fetchOwned]);

  useEffect(() => {
    if (!isConnected || !onSepolia || inscribableTokenIds.length === 0) {
      setDataLoading(false);
      return undefined;
    }

    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    preloadRevealData()
      .catch((error) => {
        console.error("Failed to preload inscribe data:", error);
        if (!cancelled) setDataError(error?.message ?? "Failed to load inscribe data.");
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, onSepolia, inscribableTokenIds.length]);

  const handleInscribeClick = (tokenId) => {
    if (!isConnected) {
      setWalletModalOpen(true);
      return;
    }
    if (inscribingTokenId != null) return;
    setTxError(null);
    setSuccessTokenId(null);
    setConfirmTokenId(tokenId);
  };

  const executeInscribe = async () => {
    if (!walletClient || !publicClient || !chromaAddress || !address || confirmTokenId == null) {
      return;
    }
    if (inscribingTokenId != null) return;

    const tokenId = confirmTokenId;
    const id = tokenId.toString();
    setInscribingTokenId(tokenId);
    setTxError(null);
    setSuccessTokenId(null);
    setProgressStep(`Preparing Chromie #${id}…`);

    try {
      const { pixelsHex, traitsHex, proof } = await getInscribePayload(tokenId);

      setProgressStep(`Confirm inscribe for Chromie #${id}…`);
      const hash = await walletClient.writeContract({
        address: chromaAddress,
        abi: chromaAbi,
        functionName: "inscribe",
        args: [tokenId, pixelsHex, traitsHex, proof],
        account: address,
      });

      setProgressStep("Waiting for confirmation…");
      await publicClient.waitForTransactionReceipt({ hash });

      setLockedByTokenId((prev) => ({ ...prev, [id]: true }));
      setSuccessTokenId(tokenId);
      setProgressStep(`Chromie #${id} inscribed and locked`);
      setConfirmTokenId(null);
    } catch (error) {
      console.error("Inscribe failed:", error);
      setTxError(errorMessage(error));
      setProgressStep("");
    } finally {
      setInscribingTokenId(null);
    }
  };

  const confirmStats = confirmTokenId
    ? canvasStatsByTokenId[confirmTokenId.toString()] ?? { customized: false, pixelsEdited: 0n }
    : null;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">INSCRIBE</h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            Permanently lock a revealed Chromie&apos;s on-chain pixel data. Inscribed tokens can
            never be edited on the canvas again.
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
              Switch to Sepolia testnet to inscribe Chromies.
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
                  : `${inscribableTokenIds.length} ready to inscribe · ${inscribedCount} inscribed`}
              </p>
              <button
                type="button"
                onClick={fetchOwned}
                disabled={loading || inscribingTokenId != null}
                className="text-xs uppercase tracking-widest text-ink/60 transition-colors hover:text-signal disabled:cursor-not-allowed disabled:text-ink/30"
              >
                Refresh
              </button>
            </div>
          )}

          {loadError && <p className="mb-6 text-sm text-red-600">{loadError}</p>}
          {dataError && <p className="mb-6 text-sm text-red-600">{dataError}</p>}

          {dataLoading && inscribableTokenIds.length > 0 && (
            <p className="mb-6 text-xs uppercase tracking-widest text-ink/45">
              Loading inscribe merkle data…
            </p>
          )}

          {progressStep && (
            <div className="mb-6 border border-signal/40 bg-white px-4 py-3 text-sm text-ink">
              <p className="font-bold uppercase tracking-wide text-signal">{progressStep}</p>
            </div>
          )}

          {txError && <p className="mb-6 text-sm text-red-600">{txError}</p>}

          {successTokenId != null && (
            <div className="mb-6 border border-ink/40 bg-ink px-4 py-3 text-sm text-paper">
              Chromie #{successTokenId.toString()} inscribed 🔒 — canvas is now read-only for this
              token.
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

          {isConnected &&
            onSepolia &&
            !loading &&
            tokenIds.length > 0 &&
            inscribableTokenIds.length === 0 &&
            !loadError && (
              <div className="border border-ink bg-white px-6 py-12 text-center">
                <p className="text-base font-semibold text-ink">
                  {inscribedCount > 0
                    ? "All your revealed Chromies are inscribed"
                    : "Reveal your Chromies before inscribing"}
                </p>
                {inscribedCount === 0 && (
                  <Link
                    to="/reveal"
                    className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-ink/60 transition-colors hover:text-signal"
                  >
                    Go to Reveal →
                  </Link>
                )}
              </div>
            )}

          {isConnected && onSepolia && inscribableTokenIds.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {inscribableTokenIds.map((tokenId) => {
                const stats = canvasStatsByTokenId[tokenId.toString()] ?? {
                  customized: false,
                  pixelsEdited: 0n,
                };
                return (
                  <InscribeTokenCard
                    key={tokenId.toString()}
                    tokenId={tokenId}
                    isLocked={false}
                    customized={stats.customized}
                    pixelsEdited={stats.pixelsEdited}
                    inscribing={inscribingTokenId === tokenId}
                    onInscribe={handleInscribeClick}
                    onView={setViewerTokenId}
                    publicClient={publicClient}
                    chromaAddress={chromaAddress}
                  />
                );
              })}
            </div>
          )}

          {isConnected && onSepolia && inscribedCount > 0 && (
            <div className="mt-12">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-ink/40">
                Already inscribed
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {tokenIds
                  .filter((id) => lockedByTokenId[id.toString()] === true)
                  .map((tokenId) => {
                    const stats = canvasStatsByTokenId[tokenId.toString()] ?? {
                      customized: false,
                      pixelsEdited: 0n,
                    };
                    return (
                      <InscribeTokenCard
                        key={tokenId.toString()}
                        tokenId={tokenId}
                        isLocked
                        customized={stats.customized}
                        pixelsEdited={stats.pixelsEdited}
                        inscribing={false}
                        onInscribe={handleInscribeClick}
                        onView={setViewerTokenId}
                        publicClient={publicClient}
                        chromaAddress={chromaAddress}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </section>

      <ConfirmInscribeModal
        open={confirmTokenId != null}
        onClose={() => !inscribingTokenId && setConfirmTokenId(null)}
        onConfirm={executeInscribe}
        tokenId={confirmTokenId}
        customized={confirmStats?.customized ?? false}
        pixelsEdited={confirmStats?.pixelsEdited ?? 0n}
        busy={inscribingTokenId != null}
      />

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
