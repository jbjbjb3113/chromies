import React, { useEffect, useState } from "react";
import { tokenPngUrl } from "../lib/chromie-token.js";
import {
  loadTokenDisplayImage,
  logRevealedSvgLoadError,
} from "../lib/token-display-image.js";

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
  const [imageSrc, setImageSrc] = useState(null);
  const [imageKind, setImageKind] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayFailed, setDisplayFailed] = useState(false);

  const id = Number(tokenId);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setImageSrc(null);
      setImageKind(null);
      setLoading(false);
      setDisplayFailed(false);
      return undefined;
    }

    let cancelled = false;
    let cleanupImage = () => {};

    setLoading(true);
    setImageSrc(null);
    setImageKind(null);
    setDisplayFailed(false);

    loadTokenDisplayImage({ publicClient, chromaAddress, tokenId: id })
      .then((result) => {
        if (cancelled) {
          result.cleanup();
          return;
        }
        cleanupImage = result.cleanup;
        setImageSrc(result.src);
        setImageKind(result.kind);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[TokenThumbnail] Failed to load display image", {
          tokenId: id,
          error: error?.message ?? error,
        });
        setImageSrc(tokenPngUrl(id));
        setImageKind("static-png-fallback");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      cleanupImage();
    };
  }, [id, publicClient, chromaAddress, refreshKey]);

  if (!Number.isFinite(id) || id < 1) {
    return (
      <ThumbnailShell>
        <div className="flex h-full w-full items-center justify-center">
          <PixelPlaceholderIcon />
        </div>
      </ThumbnailShell>
    );
  }

  if (!loading && (displayFailed || !imageSrc)) {
    return (
      <ThumbnailShell>
        <div className="flex h-full w-full items-center justify-center">
          <PixelPlaceholderIcon />
        </div>
      </ThumbnailShell>
    );
  }

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
            if (imageKind === "onchain-svg-blob") {
              logRevealedSvgLoadError(id, imageKind);
              setDisplayFailed(true);
              return;
            }
            if (imageKind === "unrevealed-placeholder") {
              console.warn("[TokenThumbnail] Reveal placeholder failed to load", { tokenId: id });
              setDisplayFailed(true);
              return;
            }
            console.warn("[TokenThumbnail] Static PNG fallback failed to load", { tokenId: id });
            setDisplayFailed(true);
          }}
        />
      )}
    </ThumbnailShell>
  );
}
