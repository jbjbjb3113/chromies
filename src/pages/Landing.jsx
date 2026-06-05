import React from "react";
import TokenTile from "../components/TokenTile.jsx";
import TokenMarquee from "../components/TokenMarquee.jsx";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { pickTokens } from "../data/tokens.js";

const STATS = [
  { value: "TBD", label: "Supply" },
  { value: "On-Chain", label: "Rendered + stored" },
  { value: "Generative", label: "Deterministic by ID" },
];

function HeroGrid() {
  const tiles = pickTokens(300, 0);
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] content-start"
    >
      {tiles.map((src, i) => (
        <div key={i} className="aspect-square">
          <TokenTile src={src} className="opacity-80" />
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <SiteHeader />

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <HeroGrid />
        <div className="absolute inset-0 bg-ink/75" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-6xl font-black tracking-tighter sm:text-8xl">
            CHROMIES
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-neutral-300 sm:text-lg">
            On-chain generative pixel art identities.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              type="button"
              className="border border-signal bg-signal px-8 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal"
            >
              Enter
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-ink-line">
        <div className="mx-auto grid max-w-6xl grid-cols-1 sm:grid-cols-3">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`border-ink-line px-8 py-12 text-center ${
                i > 0 ? "border-t sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <div className="text-4xl font-black text-signal">{stat.value}</div>
              <div className="mt-2 text-sm uppercase tracking-widest text-neutral-500">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="border-t border-ink-line bg-ink-soft">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            A pixel-art identity system
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-400">
            Every Chromie is a 64×64 pixel face built from a 16-color palette and
            generated deterministically from its token ID. The art is rendered and
            stored entirely on-chain — no servers, no IPFS, just the chain. One
            seed, one face, forever unique.
          </p>
        </div>
      </section>

      {/* Collection strip */}
      <section className="border-t border-ink-line">
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-6 text-center">
          <h2 className="text-xl font-extrabold uppercase tracking-[0.2em] text-neutral-400">
            The Collection
          </h2>
        </div>
        <TokenMarquee count={32} offset={5} />
      </section>

      <SiteFooter />
    </div>
  );
}
