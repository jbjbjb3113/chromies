import React, { useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { tokenPngUrl } from "../lib/chromie-token.js";

const HEADER_TOKENS = [42, 139];

const HEADER_TOKEN_SIZE = 96;

function PixelPlaceholderIcon({ size = HEADER_TOKEN_SIZE }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className="text-ink/25"
      aria-hidden="true"
    >
      <rect width="64" height="64" fill="currentColor" opacity="0.08" />
      <rect x="20" y="18" width="24" height="24" fill="currentColor" opacity="0.35" />
      <rect x="24" y="44" width="16" height="6" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function FramedChromie({ tokenId, size, className = "" }) {
  const [failed, setFailed] = useState(false);
  const pad = size >= 96 ? 6 : 4;

  return (
    <div
      className={`shrink-0 border border-ink bg-white ${className}`}
      style={{ width: size + pad, height: size + pad, padding: pad / 2 }}
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center bg-paper">
          <PixelPlaceholderIcon size={size} />
        </div>
      ) : (
        <img
          src={tokenPngUrl(tokenId)}
          alt={`Chromie #${tokenId}`}
          width={size}
          height={size}
          draggable={false}
          loading="lazy"
          className="pixelated block h-full w-full select-none"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: "What is a Mutation Tier?",
    a: [
      "Every Chromie is born with a mutation tier — Pristine, Standard, Drifted, or OffKilter.",
      "The tier determines how much pixel drift and palette corruption your Chromie carries. OffKilter Chromies are glitched and chaotic. Pristine Chromies carry perfect signal — no drift, no corruption, no noise.",
    ],
  },
  {
    q: "What is Pristine?",
    a: [
      "The rarest mutation tier.",
      "Only 81 Pristine Chromies exist at mint — 1.6% of the collection.",
      "But Pristine isn't just born — it's earned.",
      "Burn Chromies to generate Action Points (AP). Spend AP to shift your mutation tier toward Pristine. It takes roughly 70 burns to fully purify a token.",
      "The community ultimately determines how rare Pristine becomes over time.",
    ],
  },
  {
    q: "What is the Canvas?",
    a: [
      "Every Chromie includes an editable pixel canvas.",
      "Spend Action Points to modify individual pixels, evolve your artwork, and leave a permanent history of changes. Every edit contributes to your Chromie's progression and level.",
      "No two Chromies need remain the same forever.",
    ],
  },
  {
    q: "What are Action Points?",
    a: [
      "Action Points (AP) are the fuel of the Chromies economy.",
      "Earn AP by burning Chromies. Spend AP to edit pixels on the canvas or shift your mutation tier toward Pristine.",
      "AP can be transferred between wallets, creating a secondary market for collectors pursuing purification and progression.",
    ],
  },
  {
    q: "What is Burn?",
    a: [
      "Burning a Chromie permanently destroys it and yields 100 Action Points.",
      "Tokens with canvas edits applied before burning receive bonus AP. Every burn is recorded on-chain, creating a permanent lineage of sacrificed Chromies.",
    ],
  },
  {
    q: "What is Level?",
    a: [
      "Every Chromie starts at Level 1.",
      "Level increases whenever Action Points are spent — whether editing pixels or shifting mutation tiers. There is no level cap.",
      "Level is displayed as an on-chain trait and contributes heavily to Chromies' native rarity rankings, rewarding collectors who actively evolve their tokens.",
    ],
  },
  {
    q: "What is Inscribe?",
    a: [
      "Inscribing permanently writes your Chromie's pixel data onto Ethereum.",
      "Once inscribed, the art is frozen forever — no edits, no mutations, no changes.",
      "The token receives the Inscribed trait on-chain.",
      "An Inscribed Pristine is the highest form of a Chromie — provably perfect, provably permanent.",
    ],
  },
  {
    q: "Do I Need to Reveal My Chromie?",
    a: [
      "No.",
      "Your Chromie's artwork is committed at launch through an on-chain Merkle root. The final art assignment cannot be changed.",
      "Pixel data is available immediately.",
      "Inscribing is optional and permanently writes your artwork onto Ethereum. If you choose to inscribe, you pay the gas. If not, your Chromie remains fully valid and collectible.",
    ],
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-center gap-5 sm:gap-8">
            <FramedChromie
              tokenId={HEADER_TOKENS[0]}
              size={HEADER_TOKEN_SIZE}
              className="hidden sm:block"
            />
            <div className="min-w-0">
              <div className="mb-5 flex justify-center gap-3 sm:hidden">
                {HEADER_TOKENS.map((id) => (
                  <FramedChromie key={id} tokenId={id} size={64} />
                ))}
              </div>
              <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">FAQ</h1>
              <p className="mx-auto mt-5 max-w-xl text-base font-medium text-ink/70 sm:text-lg">
                Mutation tiers, Action Points, the Canvas, burn mechanics, and everything
                else you need to know about Chromies.
              </p>
            </div>
            <FramedChromie
              tokenId={HEADER_TOKENS[1]}
              size={HEADER_TOKEN_SIZE}
              className="hidden sm:block"
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="divide-y divide-ink border-y border-ink">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-5 text-base font-semibold text-ink transition-colors hover:text-signal">
                  {item.q}
                  <span className="ml-4 text-signal transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="space-y-3 px-2 pb-5">
                  {item.a.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-relaxed text-ink/70">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
