import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import WalletSelectModal from "../components/WalletSelectModal.jsx";
import TokenThumbnail from "../components/TokenThumbnail.jsx";
import {
  chromaAbi,
  chromaCanvasV2Abi,
  DEFAULT_CHAIN,
  getCanvasAddress,
  getChromaAddress,
} from "../lib/chroma-contract.js";
import { fetchBurnApEstimates, generateBurnCommitment } from "../lib/chroma-burn.js";
import { fetchOwnedChromaTokenIds, fetchTokenRevealStatus } from "../lib/chroma-ownership.js";

const CONNECT_BTN_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40 sm:w-auto sm:px-8 sm:py-3";

const EXECUTE_BTN_CLASS =
  "border border-signal bg-signal px-6 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/40";

function errorMessage(error) {
  const message = error?.shortMessage ?? error?.message ?? "Transaction failed";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

function BurnTokenCard({
  tokenId,
  role,
  disabled,
  isRevealed,
  onSelectReceiver,
  onToggleBurn,
  publicClient,
  chromaAddress,
}) {
  const id = tokenId.toString();
  const isReceiver = role === "receiver";
  const isBurn = role === "burn";
  const burnDisabled = disabled || isReceiver || !isRevealed;

  const borderClass = isReceiver
    ? "border-emerald-600 ring-2 ring-emerald-600/30"
    : isBurn
      ? "border-red-600 ring-2 ring-red-600/30"
      : "border-ink";

  return (
    <article
      className={`relative flex flex-col overflow-hidden border-2 bg-white transition-colors ${borderClass} ${
        disabled ? "opacity-60" : "hover:border-signal/60"
      }`}
    >
      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-center gap-1.5 border border-emerald-600/40 bg-white/95 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
          <input
            type="radio"
            name="burn-receiver"
            checked={isReceiver}
            disabled={disabled}
            onChange={() => onSelectReceiver(tokenId)}
            className="accent-emerald-600"
          />
          Keep
        </label>
        <label
          className={`flex items-center gap-1.5 border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
            burnDisabled
              ? "cursor-not-allowed border-ink/20 bg-white/95 text-ink/35"
              : "cursor-pointer border-red-600/40 bg-white/95 text-red-700"
          }`}
        >
          <input
            type="checkbox"
            checked={isBurn}
            disabled={burnDisabled}
            onChange={() => onToggleBurn(tokenId)}
            className="accent-red-600"
          />
          Burn
        </label>
      </div>

      {!isRevealed && (
        <div className="absolute right-2 top-2 z-10 max-w-[9rem] border border-amber-600/50 bg-amber-50 px-2 py-1 text-[8px] font-bold uppercase leading-tight tracking-wide text-amber-800">
          Unrevealed — reveal first to earn AP
        </div>
      )}

      <div className="pointer-events-none">
        <TokenThumbnail
          tokenId={tokenId}
          publicClient={publicClient}
          chromaAddress={chromaAddress}
        />
      </div>

      <div className="border-t border-ink/10 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">CHROMIES</p>
        <h3 className="mt-0.5 text-sm font-black tracking-tight text-ink">Chromie #{id}</h3>
        {isReceiver && (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Receiver — earns AP
          </p>
        )}
        {isBurn && (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-red-700">
            Marked for burn
          </p>
        )}
        {!isRevealed && (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Cannot burn until revealed
          </p>
        )}
      </div>
    </article>
  );
}

function ConfirmBurnModal({
  open,
  onClose,
  onConfirm,
  receiverTokenId,
  burnTokenIds,
  estimatedAp,
  busy,
}) {
  if (!open) return null;

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
          <h2 className="text-lg font-black uppercase tracking-tight text-ink">Confirm burn</h2>
          <p className="mt-2 text-sm text-ink/70">
            This action is permanent. Burned Chromies are sent to the dead address and cannot be
            recovered.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
              Receiver (keeps living)
            </p>
            <p className="mt-1 font-bold text-ink">Chromie #{receiverTokenId?.toString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">
              Tokens to burn ({burnTokenIds.length})
            </p>
            <ul className="mt-1 space-y-1 font-mono text-xs text-ink">
              {burnTokenIds.map((id) => (
                <li key={id.toString()}>#{id.toString()}</li>
              ))}
            </ul>
          </div>
          <div className="border border-ink bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              Estimated AP earned
            </p>
            <p className="mt-1 font-symtext text-2xl font-black text-signal">
              +{estimatedAp.toString()} AP
            </p>
            <p className="mt-1 text-xs text-ink/50">
              Based on each token&apos;s on-chain pixel count (tiered 1–3% yield)
            </p>
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
            disabled={busy}
            onClick={onConfirm}
            className="border border-red-600 bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-transparent hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Burning…" : "Burn permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Burn() {
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [receiverTokenId, setReceiverTokenId] = useState(null);
  const [burnTokenIds, setBurnTokenIds] = useState([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [txError, setTxError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);
  const [estimatedAp, setEstimatedAp] = useState(0n);
  const [burnApByTokenId, setBurnApByTokenId] = useState({});
  const [estimateLoading, setEstimateLoading] = useState(false);

  const burnCount = burnTokenIds.length;
  const hasZeroApBurn =
    burnCount > 0 &&
    !estimateLoading &&
    Object.values(burnApByTokenId).some((ap) => ap === 0n);

  const canExecute =
    isConnected &&
    onSepolia &&
    receiverTokenId != null &&
    burnCount > 0 &&
    estimatedAp > 0n &&
    !estimateLoading &&
    !executing &&
    walletClient &&
    publicClient &&
    chromaAddress &&
    canvasAddress;

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
      setReceiverTokenId((prev) => (prev && ids.some((id) => id === prev) ? prev : null));
      setBurnTokenIds((prev) =>
        prev.filter((id) => ids.some((owned) => owned === id) && revealed[id.toString()] === true),
      );
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
      setReceiverTokenId(null);
      setBurnTokenIds([]);
    }
  }, [isConnected, onSepolia, fetchOwned]);

  useEffect(() => {
    if (!publicClient || !canvasAddress || burnTokenIds.length === 0) {
      setEstimatedAp(0n);
      setBurnApByTokenId({});
      setEstimateLoading(false);
      return undefined;
    }

    let cancelled = false;
    setEstimateLoading(true);
    fetchBurnApEstimates(publicClient, canvasAddress, burnTokenIds)
      .then(({ total, byTokenId }) => {
        if (!cancelled) {
          setEstimatedAp(total);
          setBurnApByTokenId(byTokenId);
        }
      })
      .catch((error) => {
        console.error("Failed to estimate burn AP:", error);
        if (!cancelled) {
          setEstimatedAp(0n);
          setBurnApByTokenId({});
        }
      })
      .finally(() => {
        if (!cancelled) setEstimateLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, canvasAddress, burnTokenIds]);

  const handleSelectReceiver = (tokenId) => {
    setReceiverTokenId(tokenId);
    setBurnTokenIds((prev) => prev.filter((id) => id !== tokenId));
    setSuccessResult(null);
    setTxError(null);
  };

  const handleToggleBurn = (tokenId) => {
    if (receiverTokenId === tokenId) return;
    if (!revealedByTokenId[tokenId.toString()]) return;
    setBurnTokenIds((prev) => {
      const exists = prev.some((id) => id === tokenId);
      return exists ? prev.filter((id) => id !== tokenId) : [...prev, tokenId];
    });
    setSuccessResult(null);
    setTxError(null);
  };

  const getTokenRole = (tokenId) => {
    if (receiverTokenId === tokenId) return "receiver";
    if (burnTokenIds.some((id) => id === tokenId)) return "burn";
    return null;
  };

  const executeBurn = async () => {
    if (!canExecute || receiverTokenId == null || burnTokenIds.length === 0) return;

    setExecuting(true);
    setTxError(null);
    setSuccessResult(null);
    setConfirmOpen(false);

    try {
      const approved = await publicClient.readContract({
        address: chromaAddress,
        abi: chromaAbi,
        functionName: "isApprovedForAll",
        args: [address, canvasAddress],
      });

      if (!approved) {
        setProgressStep("Approving canvas…");
        setProgressDetail("setApprovalForAll on Chroma contract");
        const approveHash = await walletClient.writeContract({
          address: chromaAddress,
          abi: chromaAbi,
          functionName: "setApprovalForAll",
          args: [canvasAddress, true],
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      for (let i = 0; i < burnTokenIds.length; i += 1) {
        const burnTokenId = burnTokenIds[i];
        setProgressStep(`Burning token #${burnTokenId.toString()}…`);
        setProgressDetail(`(${i + 1} of ${burnTokenIds.length})`);

        const { salt, commitment, diffData } = generateBurnCommitment(
          address,
          receiverTokenId,
          burnTokenId,
        );

        const commitHash = await walletClient.writeContract({
          address: canvasAddress,
          abi: chromaCanvasV2Abi,
          functionName: "submitCommit",
          args: [commitment],
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: commitHash });

        const revealHash = await walletClient.writeContract({
          address: canvasAddress,
          abi: chromaCanvasV2Abi,
          functionName: "revealBurnAndApplyDiff",
          args: [receiverTokenId, burnTokenId, salt, diffData],
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: revealHash });
      }

      const apBalance = await publicClient.readContract({
        address: canvasAddress,
        abi: chromaCanvasV2Abi,
        functionName: "actionPoints",
        args: [receiverTokenId],
      });

      setSuccessResult({ tokenId: receiverTokenId, ap: apBalance });
      setProgressStep("Burn complete");
      setProgressDetail(`Chromie #${receiverTokenId.toString()} now has ${apBalance.toString()} AP`);

      setReceiverTokenId(null);
      setBurnTokenIds([]);
      await fetchOwned();
    } catch (error) {
      console.error("Burn flow failed:", error);
      setTxError(errorMessage(error));
      setProgressStep("");
      setProgressDetail("");
    } finally {
      setExecuting(false);
    }
  };

  const showPreview = receiverTokenId != null && burnCount > 0;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">BURN</h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
            Sacrifice Chromies to earn Action Points on a token you keep. Burns are permanent.
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
              Switch to Sepolia testnet to burn Chromies.
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
                  : `${tokenIds.length} Chromie${tokenIds.length === 1 ? "" : "s"} in wallet`}
              </p>
              <button
                type="button"
                onClick={fetchOwned}
                disabled={loading || executing}
                className="text-xs uppercase tracking-widest text-ink/60 transition-colors hover:text-signal disabled:cursor-not-allowed disabled:text-ink/30"
              >
                Refresh
              </button>
            </div>
          )}

          {loadError && <p className="mb-6 text-sm text-red-600">{loadError}</p>}
          {txError && (
            <p className="mb-6 border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-700">
              {txError}
            </p>
          )}

          {successResult && (
            <div className="mb-6 border border-emerald-600/30 bg-emerald-50 px-4 py-4">
              <p className="text-sm font-bold text-emerald-800">Burn successful</p>
              <p className="mt-1 text-sm text-emerald-900">
                Chromie #{successResult.tokenId.toString()} now has{" "}
                <span className="font-symtext text-lg font-black">
                  {successResult.ap.toString()} AP
                </span>
              </p>
            </div>
          )}

          {executing && (
            <div className="mb-6 border border-ink bg-white px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-signal">
                In progress
              </p>
              <p className="mt-2 text-sm font-bold text-ink">{progressStep}</p>
              {progressDetail && (
                <p className="mt-1 text-xs uppercase tracking-widest text-ink/50">
                  {progressDetail}
                </p>
              )}
            </div>
          )}

          {isConnected && onSepolia && !loading && tokenIds.length < 2 && !loadError && (
            <div className="border border-ink bg-white px-6 py-12 text-center">
              <p className="text-base font-semibold text-ink">
                You need at least 2 Chromies to burn — one to keep, one to sacrifice.
              </p>
              <Link
                to="/mint"
                className="mt-4 inline-block border border-signal bg-signal px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal"
              >
                Mint more on /mint
              </Link>
            </div>
          )}

          {isConnected && onSepolia && tokenIds.length >= 2 && (
            <>
              <div className="mb-6 border border-ink bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
                  How it works
                </p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-ink/70">
                  <li>
                    Select one <span className="font-bold text-emerald-700">receiver</span> token
                    (radio) — it keeps living and earns AP
                  </li>
                  <li>
                    Mark one or more <span className="font-bold text-red-700">revealed</span> tokens
                    to burn — unrevealed placeholders earn 0 AP
                  </li>
                  <li>Confirm and execute the on-chain commit-reveal burn sequence</li>
                </ol>
                <p className="mt-3 text-xs text-ink/50">
                  Reveal is not yet available in the site UI — use on-chain scripts for now. A
                  reveal page is needed before burns can earn AP on freshly minted tokens.
                </p>
              </div>

              {showPreview && (
                <div className="mb-6 border border-signal/40 bg-signal/5 px-4 py-3">
                  <p className="text-sm font-semibold text-ink">
                    Burning {burnCount} token{burnCount === 1 ? "" : "s"} into Chromie #
                    {receiverTokenId.toString()} will earn{" "}
                    <span className="font-symtext font-black text-signal">
                      {estimateLoading ? "…" : `+${estimatedAp.toString()} AP`}
                    </span>
                  </p>
                  {hasZeroApBurn && (
                    <p className="mt-2 text-sm font-semibold text-amber-800">
                      Selected token(s) haven&apos;t been revealed and would earn 0 AP.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {tokenIds.map((tokenId) => (
                  <BurnTokenCard
                    key={tokenId.toString()}
                    tokenId={tokenId}
                    role={getTokenRole(tokenId)}
                    isRevealed={revealedByTokenId[tokenId.toString()] === true}
                    disabled={executing}
                    onSelectReceiver={handleSelectReceiver}
                    onToggleBurn={handleToggleBurn}
                    publicClient={publicClient}
                    chromaAddress={chromaAddress}
                  />
                ))}
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  disabled={!canExecute}
                  onClick={() => setConfirmOpen(true)}
                  className={EXECUTE_BTN_CLASS}
                >
                  Execute burn
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <ConfirmBurnModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={executeBurn}
        receiverTokenId={receiverTokenId}
        burnTokenIds={burnTokenIds}
        estimatedAp={estimatedAp}
        busy={executing}
      />

      <SiteFooter />
    </div>
  );
}
