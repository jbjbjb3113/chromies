import React, { useEffect, useState } from "react";
import {
  fetchOnChainTokenMetadata,
  resolveMetadataImageUrl,
  tokenPngUrl,
} from "../lib/chromie-token.js";

function PixelPlaceholderIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 text-ink/25" aria-hidden="true">
      <rect width="64" height="64" fill="currentColor" opacity="0.08" />
      <rect x="20" y="18" width="24" height="24" fill="currentColor" opacity="0.35" />
      <rect x="24" y="44" width="16" height="6" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function ThumbnailShell({ children }) {
  return (
    <div className="aspect-square w-full overflow-hidden border-b border-ink/10 bg-ink/[0.03]">
      {children}
    </div>
  );
}

export default function TokenThumbnail({ tokenId, publicClient, chromaAddress, refreshKey = 0 }) {
  const [metadataSource, setMetadataSource] = useState(null);
  const [onChainImage, setOnChainImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [pngFallbackFailed, setPngFallbackFailed] = useState(false);

  const id = Number(tokenId);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setMetadataSource(null);
      setOnChainImage(null);
      setLoading(false);
      setImageFailed(false);
      setPngFallbackFailed(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setMetadataSource(null);
    setOnChainImage(null);
    setImageFailed(false);
    setPngFallbackFailed(false);

    (async () => {
      try {
        if (publicClient && chromaAddress) {
          try {
            const data = await fetchOnChainTokenMetadata(publicClient, chromaAddress, id);
            if (!cancelled) {
              setMetadataSource("onchain");
              setOnChainImage(data?.image ? resolveMetadataImageUrl(data.image) : null);
            }
          } catch {
            if (!cancelled) setMetadataSource("onchain-failed");
          }
        } else if (!cancelled) {
          setMetadataSource("static");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, publicClient, chromaAddress, refreshKey]);

  if (!Number.isFinite(id) || id < 1 || pngFallbackFailed) {
    return (
      <ThumbnailShell>
        <div className="flex h-full w-full items-center justify-center">
          <PixelPlaceholderIcon />
        </div>
      </ThumbnailShell>
    );
  }

  const imageSrc = (() => {
    if (metadataSource === "onchain") {
      if (onChainImage && !imageFailed) return onChainImage;
      return tokenPngUrl(id);
    }
    return tokenPngUrl(id);
  })();

  return (
    <ThumbnailShell>
      {loading ? (
        <div className="h-full w-full animate-pulse bg-ink/[0.06]" aria-hidden="true" />
      ) : (
        <img
          src={imageSrc}
          alt={`Chromie #${tokenId}`}
          draggable={false}
          className="pixelated h-full w-full object-cover"
          onError={() => {
            if (metadataSource === "onchain" && onChainImage && !imageFailed) {
              setImageFailed(true);
            } else {
              setPngFallbackFailed(true);
            }
          }}
        />
      )}
    </ThumbnailShell>
  );
}
