import React from "react";
import { formatTokenId, tokenPngUrl } from "../../lib/chromie-token.js";
import { MIST_BG, MIST_NAME, MIST_TRAIT_SUMMARY, SPRITE_SCALE, TOKEN_ID } from "./constants.js";

export default function MistHero() {
  const size = 64 * SPRITE_SCALE;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-8 lg:py-0">
      <div
        className="flex items-center justify-center"
        style={{
          width: size + 32,
          height: size + 32,
          backgroundColor: MIST_BG,
        }}
      >
        <img
          src={tokenPngUrl(TOKEN_ID)}
          alt={`Chromie #${formatTokenId(TOKEN_ID)} — ${MIST_NAME}`}
          width={size}
          height={size}
          className="pixelated"
          style={{ imageRendering: "pixelated" }}
          draggable={false}
        />
      </div>

      <div className="mt-6 max-w-xs text-center">
        <p className="font-symtext text-base uppercase tracking-wide text-ink">
          Chromie #{formatTokenId(TOKEN_ID)} · &ldquo;{MIST_NAME}&rdquo;
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">{MIST_TRAIT_SUMMARY}</p>
      </div>
    </div>
  );
}
