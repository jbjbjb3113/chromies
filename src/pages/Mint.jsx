import React from "react";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import Countdown from "../components/Countdown.jsx";

// Placeholder mint date — update when confirmed.
const MINT_DATE = new Date("2026-09-01T17:00:00Z");

// Swap for any token in /public/tokens.
const FEATURED_TOKEN = "/tokens/0042.png";

const INFO = [
  { value: "TBD", label: "Price" },
  { value: "TBD", label: "Supply" },
  { value: "TBD", label: "Per Wallet" },
];

const FAQ = [
  {
    q: "What is a Chromie?",
    a: "A Chromie is a 64×64 generative pixel-art identity. Every face is built from a 16-color palette and is unique to its token ID.",
  },
  {
    q: "What does on-chain mean?",
    a: "The artwork is generated, rendered, and stored entirely on the blockchain — no external servers or IPFS. The chain is the source of truth.",
  },
  {
    q: "What is a mutation tier?",
    a: "Each Chromie carries a mutation tier determined at mint. It influences rarity and the visual traits expressed by your token.",
  },
  {
    q: "When is mint?",
    a: "Minting opens soon. Connect your wallet to get notified the moment it goes live — the countdown above is a placeholder until the date is confirmed.",
  },
];

export default function Mint() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-ink-line px-6 pt-32 pb-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">
            CLAIM YOUR CHROMIE
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-neutral-300 sm:text-lg">
            Minting opens soon. Connect your wallet to get notified.
          </p>

          <div className="mt-10">
            <Countdown target={MINT_DATE} />
          </div>

          <div className="mt-10">
            <button
              type="button"
              className="border border-signal bg-signal px-8 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </section>

      {/* Featured token */}
      <section className="border-b border-ink-line bg-ink-soft px-6 py-20">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="w-64 border border-ink-line bg-ink p-3">
            <img
              src={FEATURED_TOKEN}
              alt="Featured Chromie"
              draggable={false}
              className="pixelated aspect-square w-full select-none"
            />
          </div>
          <p className="mt-8 max-w-md text-base leading-relaxed text-neutral-400">
            Each Chromie is generated on-chain from your token ID. No two are
            alike. Your mutation tier is determined at mint.
          </p>
        </div>
      </section>

      {/* Info cards */}
      <section className="border-b border-ink-line">
        <div className="mx-auto grid max-w-6xl grid-cols-1 sm:grid-cols-3">
          {INFO.map((item, i) => (
            <div
              key={item.label}
              className={`border-ink-line px-8 py-12 text-center ${
                i > 0 ? "border-t sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <div className="text-4xl font-black text-signal">{item.value}</div>
              <div className="mt-2 text-sm uppercase tracking-widest text-neutral-500">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-extrabold uppercase tracking-[0.2em] text-neutral-400">
            FAQ
          </h2>
          <div className="mt-10 divide-y divide-ink-line border-y border-ink-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-5 text-base font-semibold text-white transition-colors hover:text-signal">
                  {item.q}
                  <span className="ml-4 text-signal transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-2 pb-5 text-sm leading-relaxed text-neutral-400">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
