import React, { useCallback, useEffect, useState } from "react";
import {
  formatNormiesApiError,
  getHolderNormies,
  getNormieCanvasInfo,
  getNormieImageUrl,
  getNormieOwner,
} from "../lib/normiesApi.ts";

const INPUT_CLASS =
  "w-full border border-ink bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-signal";

function shortenAddress(address) {
  if (!address || address.length < 10) return address ?? "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function NormieDetailCard({ tokenId, canvasInfo, owner, imageError, onImageError }) {
  return (
    <div className="mt-6 grid gap-6 border border-ink/15 bg-paper p-4 sm:grid-cols-[minmax(0,140px)_1fr]">
      <div className="mx-auto w-full max-w-[140px] overflow-hidden border border-ink/20 bg-white">
        {!imageError ? (
          <img
            src={getNormieImageUrl(tokenId)}
            alt={`Normie #${tokenId}`}
            className="block h-auto w-full"
            onError={onImageError}
          />
        ) : (
          <div className="flex aspect-square items-center justify-center bg-ink/5 px-2 text-center text-[10px] font-bold uppercase tracking-wide text-ink/40">
            Image unavailable
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">Normie</p>
          <p className="mt-1 text-lg font-black tracking-tight text-ink">#{tokenId}</p>
        </div>

        {canvasInfo && (
          <div className="flex flex-wrap gap-2">
            <span className="border border-ink/20 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-ink/70">
              {canvasInfo.actionPoints ?? "—"} AP
            </span>
            <span className="border border-ink/20 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-ink/70">
              Level {canvasInfo.level ?? "—"}
            </span>
            <span className="border border-ink/20 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-ink/70">
              {canvasInfo.customized ? "Customized" : "Base"}
            </span>
          </div>
        )}

        {owner && (
          <p className="text-xs text-ink/60">
            Owner{" "}
            <span className="font-mono font-semibold text-ink">{shortenAddress(owner)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function NormiesCrossCollectionPanel({ address, isConnected }) {
  const [tokenIdInput, setTokenIdInput] = useState("");
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [heldTokenIds, setHeldTokenIds] = useState([]);
  const [canvasInfo, setCanvasInfo] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [holderLoading, setHolderLoading] = useState(false);
  const [error, setError] = useState(null);
  const [holderError, setHolderError] = useState(null);
  const [imageError, setImageError] = useState(false);

  const loadNormieDetails = useCallback(async (tokenId) => {
    const id = Number(tokenId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Enter a valid Normie token ID.");
      return;
    }

    setLoading(true);
    setError(null);
    setCanvasInfo(null);
    setOwner(null);
    setImageError(false);
    setSelectedTokenId(id);

    try {
      const [info, ownerInfo] = await Promise.all([
        getNormieCanvasInfo(id),
        getNormieOwner(id),
      ]);
      setCanvasInfo(info);
      setOwner(ownerInfo.owner ?? null);
    } catch (err) {
      console.warn("Normies lookup failed:", err);
      setError(formatNormiesApiError(err, id));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLookupSubmit = (event) => {
    event.preventDefault();
    loadNormieDetails(tokenIdInput);
  };

  useEffect(() => {
    if (!isConnected || !address) {
      setHeldTokenIds([]);
      setHolderError(null);
      return;
    }

    let cancelled = false;
    setHolderLoading(true);
    setHolderError(null);

    getHolderNormies(address)
      .then((data) => {
        if (cancelled) return;
        const ids = Array.isArray(data.tokenIds)
          ? [...data.tokenIds].sort((a, b) => a - b)
          : [];
        setHeldTokenIds(ids);
        if (ids.length === 0) {
          setHolderError("No Normies held by this wallet.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Normies holder lookup failed:", err);
        setHeldTokenIds([]);
        setHolderError(formatNormiesApiError(err));
      })
      .finally(() => {
        if (!cancelled) setHolderLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  return (
    <section className="border-b border-ink px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h2 className="text-center text-xl font-extrabold uppercase tracking-[0.2em] text-ink/50">
            Normies
          </h2>
          <span className="border border-ink/25 bg-paper px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink/55">
            Cross-collection view (read-only)
          </span>
        </div>

        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-ink/65">
          See Normies AP, level, and ownership alongside Chromies — informational only; no AP
          transfers between collections.
        </p>

        <form onSubmit={handleLookupSubmit} className="mx-auto mt-8 max-w-md">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              Normie token ID
            </span>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                min="1"
                value={tokenIdInput}
                onChange={(event) => setTokenIdInput(event.target.value)}
                placeholder="e.g. 42"
                className={INPUT_CLASS}
              />
              <button
                type="submit"
                disabled={loading || !tokenIdInput}
                className="shrink-0 border border-ink bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40"
              >
                {loading ? "Loading…" : "Look up"}
              </button>
            </div>
          </label>
        </form>

        {isConnected && address && (
          <div className="mx-auto mt-6 max-w-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              Your Normies
            </p>
            {holderLoading && (
              <p className="mt-2 text-xs uppercase tracking-wider text-ink/45">Loading wallet…</p>
            )}
            {!holderLoading && holderError && (
              <p className="mt-2 text-xs text-ink/55">{holderError}</p>
            )}
            {!holderLoading && heldTokenIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {heldTokenIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setTokenIdInput(String(id));
                      loadNormieDetails(id);
                    }}
                    disabled={loading}
                    className={`border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      selectedTokenId === id
                        ? "border-signal bg-signal/10 text-signal"
                        : "border-ink/20 bg-white text-ink/70 hover:border-signal/60 hover:text-signal"
                    }`}
                  >
                    #{id}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mx-auto mt-6 max-w-md text-center text-sm text-ink/70">{error}</p>
        )}

        {selectedTokenId != null && !error && (canvasInfo || loading) && (
          loading ? (
            <p className="mt-6 text-center text-xs uppercase tracking-wider text-ink/45">
              Loading Normie #{selectedTokenId}…
            </p>
          ) : (
            <NormieDetailCard
              tokenId={selectedTokenId}
              canvasInfo={canvasInfo}
              owner={owner}
              imageError={imageError}
              onImageError={() => setImageError(true)}
            />
          )
        )}
      </div>
    </section>
  );
}
