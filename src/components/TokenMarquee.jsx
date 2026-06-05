import React from "react";
import TokenTile from "./TokenTile.jsx";
import { pickTokens } from "../data/tokens.js";

export default function TokenMarquee({ count = 30, offset = 3 }) {
  const tokens = pickTokens(count, offset);
  const loop = [...tokens, ...tokens];

  return (
    <div className="marquee-track w-full overflow-hidden border-y border-ink-line bg-ink-soft">
      <div className="flex w-max animate-marquee">
        {loop.map((src, i) => (
          <div
            key={i}
            className="h-24 w-24 shrink-0 border-r border-ink-line"
          >
            <TokenTile src={src} />
          </div>
        ))}
      </div>
    </div>
  );
}
