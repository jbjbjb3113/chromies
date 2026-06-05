import React, { useEffect, useMemo, useRef, useState } from "react";
import { TOKEN_IMAGES } from "../data/tokens.js";

const CELL_PX = 768;
const SCROLL_DURATION_S = 128;

function buildStripTiles(count, offset = 23) {
  const tiles = [];
  for (let i = 0; i < count; i++) {
    tiles.push(TOKEN_IMAGES[(i * 11 + offset) % TOKEN_IMAGES.length]);
  }
  return tiles;
}

function StripPanel({ tiles }) {
  return (
    <div className="flex shrink-0">
      {tiles.map((src, i) => (
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          draggable={false}
          width={CELL_PX}
          height={CELL_PX}
          className="pixelated block shrink-0 select-none"
          style={{ width: CELL_PX, height: CELL_PX }}
        />
      ))}
    </div>
  );
}

export default function TokenHeroForeground({ opacity = 0.45 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(1280);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const parent = el.parentElement;
      if (!parent) return;
      setWidth(parent.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, []);

  const { tiles, stripW } = useMemo(() => {
    const count = Math.ceil(width / CELL_PX) + 8;
    const list = buildStripTiles(count);
    return { tiles: list, stripW: count * CELL_PX };
  }, [width]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 overflow-hidden select-none"
      style={{ top: "0%", height: "100%", opacity }}
    >
      <div className="flex h-full items-center">
        <div
          className="hero-grid-scroll-reverse flex"
          style={{
            width: stripW * 2,
            "--hero-scroll-x": `-${stripW}px`,
            animationDuration: `${SCROLL_DURATION_S}s`,
          }}
        >
          {[0, 1].map((panel) => (
            <StripPanel key={panel} tiles={tiles} />
          ))}
        </div>
      </div>
    </div>
  );
}
