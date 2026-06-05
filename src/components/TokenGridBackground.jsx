import React, { useEffect, useMemo, useRef, useState } from "react";
import { TOKEN_CELL_PX, TOKEN_IMAGES } from "../data/tokens.js";

const SCROLL_DURATION_S = 100;

function buildPanelTiles(cols, rows) {
  const count = cols * rows;
  const tiles = [];
  for (let i = 0; i < count; i++) {
    tiles.push(TOKEN_IMAGES[i % TOKEN_IMAGES.length]);
  }
  return tiles;
}

function TokenPanel({ tiles, cols, panelW, panelH }) {
  return (
    <div
      className="grid gap-0"
      style={{
        width: panelW,
        height: panelH,
        gridTemplateColumns: `repeat(${cols}, ${TOKEN_CELL_PX}px)`,
        gridTemplateRows: `repeat(${Math.ceil(tiles.length / cols)}, ${TOKEN_CELL_PX}px)`,
      }}
    >
      {tiles.map((src, i) => (
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          draggable={false}
          width={TOKEN_CELL_PX}
          height={TOKEN_CELL_PX}
          className="pixelated block select-none"
          style={{ width: TOKEN_CELL_PX, height: TOKEN_CELL_PX }}
        />
      ))}
    </div>
  );
}

export default function TokenGridBackground({
  opacity = 0.1,
  animate = false,
  className = "",
}) {
  const wrapRef = useRef(null);
  const [dims, setDims] = useState({ w: 1280, h: 720 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const parent = el.parentElement;
      if (!parent) return;
      setDims({
        w: parent.clientWidth,
        h: parent.clientHeight,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, []);

  const { tiles, cols, rows, panelW, panelH } = useMemo(() => {
    const c = Math.ceil(dims.w / TOKEN_CELL_PX) + 6;
    const r = Math.ceil(dims.h / TOKEN_CELL_PX) + 6;
    return {
      tiles: buildPanelTiles(c, r),
      cols: c,
      rows: r,
      panelW: c * TOKEN_CELL_PX,
      panelH: r * TOKEN_CELL_PX,
    };
  }, [dims.w, dims.h]);

  if (!animate) {
    return (
      <div
        ref={wrapRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
        style={{ opacity }}
      >
        <TokenPanel tiles={tiles} cols={cols} panelW={panelW} panelH={panelH} />
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <div
        className="hero-grid-scroll absolute top-0 left-0"
        style={{
          width: panelW * 2,
          height: panelH,
          "--hero-scroll-x": `-${panelW}px`,
          animationDuration: `${SCROLL_DURATION_S}s`,
        }}
      >
        {[0, 1].map((q) => (
          <div
            key={q}
            className="absolute top-0"
            style={{ left: q * panelW }}
          >
            <TokenPanel tiles={tiles} cols={cols} panelW={panelW} panelH={panelH} />
          </div>
        ))}
      </div>
    </div>
  );
}
