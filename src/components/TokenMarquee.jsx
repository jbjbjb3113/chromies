import React from "react";
import TokenTile from "./TokenTile.jsx";
import { pickTokens } from "../data/tokens.js";

export default function TokenMarquee({ count = 32, offset = 0 }) {
  const tiles = pickTokens(count, offset);
  const doubled = [...tiles, ...tiles];

  return (
    <div className="marquee-track w-full overflow-hidden border-y border-ink bg-white">
      <div className="animate-marquee flex w-max">
        {doubled.map((src, i) => (
          <div
            key={i}
            className="h-24 w-24 shrink-0 border-r border-ink"
          >
            <TokenTile src={src} />
          </div>
        ))}
      </div>
    </div>
  );
}
