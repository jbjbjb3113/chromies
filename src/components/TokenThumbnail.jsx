import React, { useState } from "react";
import { tokenPngUrl } from "../lib/chromie-token.js";

function PixelPlaceholderIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 text-ink/25" aria-hidden="true">
      <rect width="64" height="64" fill="currentColor" opacity="0.08" />
      <rect x="20" y="18" width="24" height="24" fill="currentColor" opacity="0.35" />
      <rect x="24" y="44" width="16" height="6" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

export default function TokenThumbnail({ tokenId }) {
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
