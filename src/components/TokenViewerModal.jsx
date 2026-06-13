import React, { useEffect, useState } from "react";
import { formatEther } from "viem";
import {
  fetchChromieMetadata,
  fetchOnChainTokenMetadata,
  tokenPngUrl,
} from "../lib/chromie-token.js";

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

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatEthPrice(wei) {
  const value = Number(formatEther(wei));
  if (value === 0) return "0 ETH";
  if (value < 0.0001) return `${value.toFixed(6)} ETH`;
  if (value < 0.01) return `${value.toFixed(4)} ETH`;
  return `${value.toFixed(3)} ETH`;
}

function listingApAmount(listing, isDemo) {
  return isDemo ? listing.apAmount : listing.amount;
}

function listingPriceLabel(listing, isDemo) {
  if (isDemo) {
    return `${Number(listing.priceEth).toFixed(Number(listing.priceEth) < 0.01 ? 4 : 3)} ETH`;
  }
  return formatEthPrice(listing.price);
}

function TraitBadge({ label, value }) {
  return (
    <div className="border border-ink/20 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink/40">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {bigint|number|null} props.tokenId
 * @param {object|null} [props.listing] — marketplace listing; omit for owned-token view
 * @param {boolean} [props.isDemo]
 * @param {string} [props.collection]
 */
export default function TokenViewerModal({
  open,
  onClose,
  tokenId,
  listing = null,
  isDemo = false,
  collection = "CHROMIES",
  publicClient,
  chromaAddress,
}) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  const resolvedTokenId = tokenId ?? listing?.tokenId ?? null;
  const numericTokenId = resolvedTokenId != null ? Number(resolvedTokenId) : null;
  const tokenLabel = collection === "NORMIES" ? "Normie" : "Chromie";
  const showListing = listing != null;
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
    if (!open || !Number.isFinite(numericTokenId) || numericTokenId < 1) {
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
            data = await fetchOnChainTokenMetadata(publicClient, chromaAddress, numericTokenId);
          } catch {
            data = await fetchChromieMetadata(numericTokenId);
          }
        } else {
          data = await fetchChromieMetadata(numericTokenId);
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
  }, [open, numericTokenId, publicClient, chromaAddress]);

  if (!open || resolvedTokenId == null) return null;

  const traits = orderTraits(metadata?.attributes ?? []);
  const imageSrc =
    !imageFailed && metadata?.image ? metadata.image : tokenPngUrl(numericTokenId);

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
              {metadata?.name ?? `${tokenLabel} #${numericTokenId}`}
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
                    alt={metadata?.name ?? `${tokenLabel} #${numericTokenId}`}
                    draggable={false}
                    className="pixelated h-full w-full object-contain"
                    onError={() => setImageFailed(true)}
                  />
                )}
              </div>
            </div>

            {showListing && (
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
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
                      Price
                    </p>
                    <p className="mt-0.5 font-symtext text-lg font-black text-ink">{priceLabel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
                      Seller
                    </p>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-ink">
                      {shortenAddress(listing.seller)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
              Traits
            </p>
            {loading && (
              <p className="text-xs uppercase tracking-widest text-ink/40">Loading traits…</p>
            )}
            {error && <p className="text-sm text-signal">{error}</p>}
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
