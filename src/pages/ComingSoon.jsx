import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildTokenGridTiles, TOKEN_CELL_PX } from "../data/tokens.js";

const ACCESS_PASSWORD = "serc4321";
const CELL = TOKEN_CELL_PX;

const LINKS = [
  { label: "Twitter / X", href: "#" },
  { label: "Discord", href: "#" },
];

export default function ComingSoon() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [dims, setDims] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  }));

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const tiles = useMemo(
    () => buildTokenGridTiles(dims.w, dims.h, CELL),
    [dims.w, dims.h],
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    if (value === ACCESS_PASSWORD) {
      sessionStorage.setItem("chromies_access", "true");
      navigate("/mint");
    } else {
      setWrong(true);
      setShaking(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="splash-drift absolute -top-16 -left-16 grid gap-0"
          style={{
            gridTemplateColumns: `repeat(auto-fill, ${CELL}px)`,
            width: dims.w + CELL * 6,
          }}
        >
          {tiles.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              draggable={false}
              width={CELL}
              height={CELL}
              className="pixelated block h-16 w-16 select-none"
              style={{ width: CELL, height: CELL }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-6 text-center">
        <h1 className="text-6xl font-black tracking-tighter text-white drop-shadow-[0_0_40px_rgba(255,45,138,0.35)] sm:text-8xl">
          CHROMIES
        </h1>
        <p className="mt-4 font-mono text-[10px] tracking-[0.2em] text-neutral-400 sm:text-xs">
          ON-CHAIN GENERATIVE IDENTITIES IN COLOR
        </p>
        <p className="mt-8 text-[10px] uppercase tracking-[0.3em] text-white/40 sm:text-xs">
          Coming Soon
        </p>

        <form onSubmit={handleSubmit} className="mt-6 w-full max-w-xs">
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setWrong(false);
            }}
            onAnimationEnd={() => setShaking(false)}
            className={`w-full border bg-ink/80 px-4 py-3 text-center text-sm tracking-[0.3em] text-white outline-none backdrop-blur-sm transition-colors placeholder:text-white/25 focus:border-signal ${
              wrong ? "border-red-500" : "border-white/20"
            } ${shaking ? "animate-shake" : ""}`}
            placeholder="••••••••"
          />
        </form>
      </div>

      <nav className="absolute inset-x-0 bottom-6 z-10 flex items-center justify-center gap-6">
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-signal"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
