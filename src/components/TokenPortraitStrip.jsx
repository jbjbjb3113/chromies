import React from "react";
import { PORTRAIT_STRIP_CELL_PX, PORTRAIT_STRIP_IMAGES } from "../data/tokens.js";

const SCROLL_DURATION_S = 44;

function StripPanel({ tiles }) {
  return (
    <div className="flex shrink-0">
      {tiles.map((src, i) => (
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          draggable={false}
          width={PORTRAIT_STRIP_CELL_PX}
          height={PORTRAIT_STRIP_CELL_PX}
          loading="lazy"
          className="pixelated block shrink-0 select-none"
          style={{
            width: PORTRAIT_STRIP_CELL_PX,
            height: PORTRAIT_STRIP_CELL_PX,
          }}
        />
      ))}
    </div>
  );
}

export default function TokenPortraitStrip() {
  const stripW = PORTRAIT_STRIP_IMAGES.length * PORTRAIT_STRIP_CELL_PX;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none w-full overflow-hidden select-none"
    >
      <div
        className="hero-grid-scroll flex"
        style={{
          width: stripW * 2,
          "--hero-scroll-x": `-${stripW}px`,
          animationDuration: `${SCROLL_DURATION_S}s`,
        }}
      >
        {[0, 1].map((panel) => (
          <StripPanel key={panel} tiles={PORTRAIT_STRIP_IMAGES} />
        ))}
      </div>
    </div>
  );
}
