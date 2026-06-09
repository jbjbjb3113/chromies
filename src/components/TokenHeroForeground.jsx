import React, { useEffect, useMemo, useRef, useState } from "react";
import { FOREGROUND_MANIFEST_URL } from "../data/tokens.js";

const CELL_PX = 851;
const SCROLL_DURATION_S = 128;

function buildStripTiles(images, count, offset = 23) {
  const tiles = [];
  for (let i = 0; i < count; i++) {
    tiles.push(images[(i * 11 + offset) % images.length]);
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

export default function TokenHeroForeground({ opacity = 0.95 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(1280);
  const [images, setImages] = useState([]);

  useEffect(() => {
    let cancelled = false;

    fetch(FOREGROUND_MANIFEST_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.images)
          ? data.images.filter((src) => typeof src === "string" && src.length > 0)
          : [];
        setImages(list);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!images.length) return { tiles: [], stripW: 0 };
    const count = Math.ceil(width / CELL_PX) + 8;
    const list = buildStripTiles(images, count);
    return { tiles: list, stripW: count * CELL_PX };
  }, [width, images]);

  if (!images.length) return null;

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
