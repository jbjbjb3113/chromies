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

const FLOW_STEP_LINK_CLASS =
  "inline-flex shrink-0 border border-[#8a8780] bg-paper/80 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-signal backdrop-blur-sm transition-colors hover:border-ink hover:bg-paper/95";

function FlowStepLink({ to, children }) {
  return (
    <Link to={to} className={FLOW_STEP_LINK_CLASS}>
      {children} →
    </Link>
  );
}

function FlowArrow() {
  return <span className="shrink-0 text-ink/40">→</span>;
}

function FlowScrollRow({ children, className = "" }) {
  return (
    <div className="relative sm:static">
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-paper/80 to-transparent sm:hidden"
        aria-hidden
      />
      <div className="overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:whitespace-normal">
        <div
          className={`flex flex-nowrap items-center justify-start gap-x-2 gap-y-2 text-sm font-semibold tracking-wide sm:flex-wrap sm:justify-center ${className}`}
        >
          {children}
        </div>
      </div>
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

      {/* 1. Hero — logo top, Quick Summary + MINT at bottom */}
      <section className="relative flex min-h-screen flex-col overflow-hidden border-b border-ink">
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

        <div className="relative z-10 mt-auto px-5 pb-10 pt-8 text-center sm:px-6 sm:pb-12">
          <div className="mx-auto max-w-3xl border border-ink bg-paper/80 px-6 py-8 text-center backdrop-blur-sm">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.2em] text-ink/50">
              Quick Summary
            </h3>
            <FlowScrollRow className="mt-4 text-ink">
              <FlowStepLink to="/mint">MINT</FlowStepLink>
              <FlowArrow />
              <FlowStepLink to="/my-chromies">Collect</FlowStepLink>
              <FlowArrow />
              <FlowStepLink to="/canvas">Edit</FlowStepLink>
              <FlowArrow />
              <FlowStepLink to="/burn">Burn</FlowStepLink>
              <FlowArrow />
              <FlowStepLink to="/market">Earn AP</FlowStepLink>
              <FlowArrow />
              <FlowStepLink to="/canvas">Purify</FlowStepLink>
              <FlowArrow />
              <FlowStepLink to="/inscribe">Inscribe</FlowStepLink>
            </FlowScrollRow>
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink/40">or</p>
            <FlowScrollRow className="mt-3">
              <FlowStepLink to="/mint">MINT</FlowStepLink>
              <FlowArrow />
              <span className="shrink-0 text-signal">Hold Forever</span>
            </FlowScrollRow>
          </div>
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

      {/* 3. Built Together */}
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

      {/* 5. The Future */}
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
