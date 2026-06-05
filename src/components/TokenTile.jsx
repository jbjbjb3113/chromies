import React from "react";

export default function TokenTile({ src, className = "" }) {
  return (
    <img
      src={src}
      alt="Chromie"
      loading="lazy"
      draggable={false}
      className={`pixelated block h-full w-full select-none object-cover ${className}`}
    />
  );
}
