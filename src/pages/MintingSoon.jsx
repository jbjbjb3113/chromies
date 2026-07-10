import React from "react";

// Chromies Twitter/X profile.
const TWITTER_URL = "https://x.com/ChromiesOnChain";

// Drop the final crowd-banner PNG at public/crowd-banner.png (or update this path).
const CROWD_BANNER_SRC = "/crowd-banner.png";

const WORDMARK = "CHROMIES";

// Spectrum tokens, red -> pink, one per letter (8 letters, 8 tokens — exact match).
const SPECTRUM_TOKENS = [
  "--chroma-red",
  "--chroma-orange",
  "--chroma-yellow",
  "--chroma-green",
  "--chroma-teal",
  "--chroma-blue",
  "--chroma-purple",
  "--chroma-pink",
];

function hideOnError(e) {
  e.currentTarget.style.visibility = "hidden";
}

export default function MintingSoon() {
  return (
    <div
      className="pixelated fixed inset-0 flex flex-col items-center overflow-hidden"
      style={{ backgroundColor: "var(--chroma-bg)", imageRendering: "pixelated" }}
    >
      <div className="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-6 text-center">
        <h1
          aria-label={WORDMARK}
          className="font-symtext select-none"
          style={{
            fontSize: "clamp(2.25rem, 10.5vw, 8rem)",
            lineHeight: 1,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {WORDMARK.split("").map((letter, i) => (
            <span
              key={`${letter}-${i}`}
              style={{
                color: `var(${SPECTRUM_TOKENS[i % SPECTRUM_TOKENS.length]})`,
                textShadow: "0.05em 0.05em 0 var(--chroma-ink)",
              }}
            >
              {letter}
            </span>
          ))}
        </h1>

        <p
          className="mt-6 font-semibold uppercase"
          style={{
            color: "var(--chroma-ink)",
            fontSize: "clamp(0.7rem, 2vw, 1rem)",
            letterSpacing: "0.3em",
          }}
        >
          5,150 FULLY ON-CHAIN
        </p>

        <p
          className="font-symtext mt-2 select-none uppercase"
          style={{
            color: "var(--chroma-ink)",
            fontSize: "clamp(1.4rem, 6.4vw, 4.25rem)",
            lineHeight: 1.05,
            whiteSpace: "nowrap",
          }}
        >
          MINTING SOON
        </p>

        <a
          href={TWITTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 uppercase underline-offset-4 transition-opacity hover:opacity-70 hover:underline"
          style={{
            color: "var(--chroma-muted)",
            fontSize: "clamp(0.65rem, 1.6vw, 0.9rem)",
            letterSpacing: "0.25em",
          }}
        >
          Follow Chromies on X
        </a>
      </div>

      <div
        className="relative z-0 w-full shrink-0"
        style={{ height: "clamp(140px, 26vw, 320px)" }}
      >
        <img
          src={CROWD_BANNER_SRC}
          alt="Chromies character crowd"
          draggable={false}
          onError={hideOnError}
          className="pixelated block h-full w-full select-none object-cover object-center"
        />
      </div>
    </div>
  );
}
