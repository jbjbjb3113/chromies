import React from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader.jsx";
import TokenGridBackground from "../components/TokenGridBackground.jsx";
import TokenHeroForeground from "../components/TokenHeroForeground.jsx";

const FEATURED = [
  { id: "0042", label: "SIGNAL" },
  { id: "0139", label: "ACID" },
  { id: "0010", label: "GHOST" },
  { id: "0001", label: "BLOOD" },
];

const PILLARS = [
  {
    label: "CC0",
    text: "Chromies are public domain. Remix, reuse, and build on them without permission. The art is yours to take anywhere.",
  },
  {
    label: "Interoperable",
    text: "64×64 indexed pixels with fixed 16-color palettes — built to travel across games, tools, agents, and on-chain apps.",
  },
  {
    label: "Community-Driven",
    text: "Holders shape the collection through pixel edits, purification burns, and action-point spending. The face evolves with its owner.",
  },
];

const PALETTES = [
  { tag: "#ff-signal", token: "0044", accent: "#ff2d8a" },
  { tag: "#ff-acid", token: "0139", accent: "#a8ff2d" },
  { tag: "#ff-ghost", token: "0010", accent: "#c8a8ff" },
  { tag: "#ff-blood", token: "0001", accent: "#ff3030" },
];

const ARCH_STATS = [
  {
    value: "TBD",
    unit: "BYTES",
    detail: "Per token — art, metadata, and palette data stored entirely on-chain.",
  },
  {
    value: "4,096",
    unit: "PIXELS",
    detail: "64×64 grid. One pixel, one palette index. No anti-aliasing. No servers.",
  },
  {
    value: "100%",
    unit: "ON-CHAIN",
    detail: "Rendered and stored on the blockchain. The chain is the source of truth.",
  },
];

const FUTURE = [
  {
    title: "CHROMIE CANVAS",
    href: "/canvas",
    text: "Edit pixels. Burn to purify. Spend action points. Your art, on-chain.",
  },
  {
    title: "AWAKEN",
    href: "/lab",
    text: "Give your Chromie a voice. Register as an on-chain AI agent.",
  },
];

function SectionShell({ children, className = "", innerClassName = "", id }) {
  return (
    <section id={id} className={`border-t border-ink ${className}`}>
      <div className={`mx-auto max-w-[960px] px-5 py-16 sm:px-6 ${innerClassName}`}>
        {children}
      </div>
    </section>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="mb-10 text-sm uppercase tracking-[0.25em] text-ink/50">
      {children}
    </h2>
  );
}

const FEATURED_TOKEN_SIZE = 160;

function FeaturedToken({ src, label }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={src}
        alt={label ? `Chromie ${label}` : "Chromie"}
        width={FEATURED_TOKEN_SIZE}
        height={FEATURED_TOKEN_SIZE}
        draggable={false}
        loading="lazy"
        className="pixelated block shrink-0 select-none"
        style={{ width: FEATURED_TOKEN_SIZE, height: FEATURED_TOKEN_SIZE }}
      />
      {label && (
        <span className="text-[10px] tracking-widest text-ink/60">{label}</span>
      )}
    </div>
  );
}

function TokenFrame({ src, size = 128 }) {
  return (
    <img
      src={src}
      alt="Chromie"
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      className="pixelated block shrink-0 select-none"
      style={{ width: size, height: size }}
    />
  );
}

export default function Landing() {
  return (
    <div className="landing-mono min-h-screen bg-paper text-ink">
      <SiteHeader />

      {/* 1. Hero — logo top, face unobstructed, MINT at torso */}
      <section className="relative min-h-screen overflow-hidden border-b border-ink">
        <TokenGridBackground opacity={0.08} animate />
        <TokenHeroForeground opacity={0.95} />

        <div className="relative z-10 px-5 pt-28 text-center sm:px-6 sm:pt-32">
          <h1 className="font-symtext text-5xl font-black tracking-tighter text-ink sm:text-7xl">
            CHROMIES
          </h1>
          <p className="mt-4 text-[10px] tracking-[0.3em] text-ink/60 sm:text-xs">
            ON-CHAIN GENERATIVE IDENTITIES IN COLOR
          </p>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-[76%] z-10 flex justify-center sm:top-[74%]">
          <Link
            to="/mint"
            className="pointer-events-auto border border-[#8a8780] bg-paper/80 px-8 py-3 text-xs uppercase tracking-[0.2em] text-signal backdrop-blur-sm transition-colors hover:border-ink hover:bg-paper/95"
          >
            MINT →
          </Link>
        </div>
      </section>

      {/* 2. What are Chromies? — pt-8 halves the default py-16 top gap below the hero scroll */}
      <SectionShell innerClassName="pt-8">
        <SectionTitle>What are Chromies?</SectionTitle>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-prose text-sm leading-relaxed text-ink/80">
            <p>
              Chromies are on-chain generative pixel-art identities — 64×64 faces
              built from a fixed 16-color palette, deterministic from token ID.
            </p>
            <p className="mt-4">
              Every Chromie is rendered and stored entirely on the blockchain. No
              IPFS. No external servers. One seed, one face, forever unique — but
              editable by holders through the Chromie Canvas.
            </p>
            <p className="mt-4">
              They are CC0, interoperable, and built for a colorful on-chain future.
            </p>
          </div>
          <div className="mx-auto grid grid-cols-2 gap-x-10 gap-y-8 lg:mx-0">
            {FEATURED.map((t) => (
              <FeaturedToken
                key={t.id}
                src={`/tokens/${t.id}.png`}
                label={t.label}
              />
            ))}
          </div>
        </div>
      </SectionShell>

      {/* 3. What is a Chromie? + Quick Summary */}
      <section className="border-t border-ink px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-extrabold uppercase tracking-[0.2em] text-ink/50">
            What is a Chromie?
          </h2>
          <p className="mt-8 text-center text-sm leading-relaxed text-ink/70">
            A 64×64 pixel-art identity permanently committed to Ethereum. Every face is
            built from a fixed 16-color palette, hand-crafted and deterministically
            assigned to a token ID. 5,150 exist. No duplicates. No replacements.
          </p>

          <div className="mt-12 border border-ink px-6 py-8 text-center">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.2em] text-ink/50">
              Quick Summary
            </h3>
            <p className="mt-4 text-sm font-semibold tracking-wide text-ink">
              Mint → Collect → Edit → Burn → Earn AP → Purify → Inscribe
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-ink/40">or</p>
            <p className="mt-2 text-sm font-semibold tracking-wide text-signal">
              Mint → Hold Forever
            </p>
          </div>
        </div>
      </section>

      {/* 4. Built Together */}
      <SectionShell>
        <SectionTitle>Built Together</SectionTitle>
        <div className="flex flex-col gap-10">
          {PILLARS.map((p) => (
            <div
              key={p.label}
              className="grid grid-cols-1 gap-3 border-b border-ink pb-10 last:border-b-0 last:pb-0 md:grid-cols-[10rem_1fr] md:gap-8"
            >
              <p className="text-sm uppercase tracking-[0.2em] text-signal">{p.label}</p>
              <p className="text-sm leading-relaxed text-ink/80">{p.text}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* 4. The Palettes */}
      <SectionShell id="palettes">
        <SectionTitle>The Palettes</SectionTitle>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-4">
          {PALETTES.map((p) => (
            <div key={p.tag} className="flex flex-col items-center text-center">
              <p
                className="mb-3 text-[10px] uppercase tracking-[0.15em] sm:text-xs"
                style={{ color: p.accent }}
              >
                {p.tag}
              </p>
              <TokenFrame src={`/tokens/${p.token}.png`} size={112} />
            </div>
          ))}
        </div>
        <p className="mt-12 text-center text-sm tracking-[0.15em] text-signal">
          Chromies come in color.
        </p>
      </SectionShell>

      {/* 5. On-Chain Architecture */}
      <SectionShell>
        <SectionTitle>On-Chain Architecture</SectionTitle>
        <div className="grid grid-cols-1 gap-0 border border-ink sm:grid-cols-3">
          {ARCH_STATS.map((s, i) => (
            <div
              key={s.unit}
              className={`px-6 py-10 text-center ${
                i > 0 ? "border-t border-ink sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <p className="text-4xl text-signal sm:text-5xl">{s.value}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.25em] text-signal">
                {s.unit}
              </p>
              <p className="mx-auto mt-4 max-w-xs text-xs leading-relaxed text-ink/60">
                {s.detail}
              </p>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* 6. The Future */}
      <SectionShell>
        <SectionTitle>The Future</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FUTURE.map((card) => (
            <Link
              key={card.title}
              to={card.href}
              className="border border-ink bg-paper p-6 transition-colors hover:border-signal"
            >
              <h3 className="text-sm uppercase tracking-[0.2em] text-signal">
                {card.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                {card.text}
              </p>
            </Link>
          ))}
        </div>
      </SectionShell>

      {/* 8. Footer — dark */}
      <footer className="border-t border-ink bg-ink text-white">
        <div className="mx-auto max-w-[960px] px-5 py-16 sm:px-6">
          <p className="text-center text-sm tracking-wide text-neutral-400">
            TBD faces. Zero servers.
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href="#"
              className="border border-signal px-8 py-3 text-xs uppercase tracking-[0.2em] text-signal transition-colors hover:bg-signal hover:text-white"
            >
              VIEW ON OPENSEA →
            </a>
          </div>
          <nav className="mt-10 flex items-center justify-center gap-8">
            <a
              href="#"
              className="text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-signal"
            >
              X
            </a>
            <a
              href="#"
              className="text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-signal"
            >
              Discord
            </a>
          </nav>
          <p className="mt-12 text-center text-sm tracking-tight text-white">
            chromies<span className="text-signal">.art</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
