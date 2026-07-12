import React from "react";

// Spectrum tokens, red -> pink, one per letter (8 tokens, cycled if the
// given text is longer). Shared so header and marketing copy stay in sync.
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

export default function SpectrumWordmark({ text, className }) {
  return (
    <span className={className}>
      {text.split("").map((letter, i) => (
        <span
          key={`${letter}-${i}`}
          style={{ color: `var(${SPECTRUM_TOKENS[i % SPECTRUM_TOKENS.length]})` }}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
