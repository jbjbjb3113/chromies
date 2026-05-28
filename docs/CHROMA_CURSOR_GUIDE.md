# Chroma — Build Guide for Cursor

> A color, higher-resolution successor to the Normies on-chain NFT format.
> 64×64 pixels · 4 bits-per-pixel · 16-color curated-ramp palettes · fully on-chain.

This document has two parts:
1. **The spec** — the format, encoding, contracts, and API. Read this for context.
2. **The build plan** — an ordered sequence of prompts to give Cursor, one at a time.

Keep this file in your repo (e.g. `docs/chroma-spec.md`) and add it to Cursor's
context (`@docs/chroma-spec.md`) for every prompt below. Also add the Normies
reference doc — see "Before you start."

---

## Before you start

Load two reference files into Cursor's context:

1. **This file.**
2. **The Normies reference.** Fetch `https://api.normies.art/llms.txt` and save it
   as `docs/normies-reference.txt`. Chroma's architecture deliberately mirrors
   Normies (storage / renderer / token / canvas split, SSTORE2 storage,
   RLE-optimized SVG), so this is the proven blueprint to widen.
3. **The reference renderer.** The `PixelChroma.jsx` prototype already contains the
   exact `index-buffer → RLE-rect → SVG` logic the on-chain renderer must reproduce.
   Keep it in the repo as `reference/PixelChroma.jsx` and point Cursor at it when
   building the Solidity renderer — the Solidity output must match its SVG byte-for-byte
   for any given index buffer + palette.

Stack assumption: **Foundry** for contracts, **TypeScript + viem** for the indexer/API,
**Ponder** for event indexing (same as Normies). Adjust the prompts if you use Hardhat.

---

# Part 1 — The Spec

## 1. Overview

Chroma is a 10,000-piece (configurable) generative NFT collection stored entirely
on-chain. Each token is a **64×64 grid of palette indices**. Instead of storing a
color per pixel, each pixel stores a 4-bit index (0–15) into a **16-color palette**.
Palettes are curated by the artist and stored once; each token references a palette
by ID. This keeps per-token storage tiny while delivering full color.

Comparison to Normies:

| | Normies | Chroma |
|---|---|---|
| Grid | 40×40 (1,600 px) | 64×64 (4,096 px) |
| Color | 1 bit (2 colors) | 4 bits (16 colors) |
| Pixel bytes/token | 200 | 2,048 |
| Palette | none (fixed 2 grays) | 48 B, shared by ID |
| Total bytes/token | 200 | ~2,096 |
| SSTORE2 chunks | 1 | 1 |

## 2. Encoding

### 2.1 Pixel buffer
- **4,096 pixels**, row-major, top-left to bottom-right.
- **4 bits per pixel**, value 0–15 = index into the token's palette.
- Two pixels packed per byte: high nibble = even-x pixel, low nibble = odd-x pixel.
- Total: 4,096 × 4 bits = **2,048 bytes**.

```
flatIndex = y * 64 + x
byteIndex = flatIndex >> 1
nibble    = (flatIndex & 1) === 0 ? (data[byteIndex] >> 4) : (data[byteIndex] & 0x0F)
```

### 2.2 Palettes
- A palette is **16 colors × 3 bytes (RGB24) = 48 bytes**.
- Palettes are authored by the artist and stored on-chain in the renderer (or a
  palette registry contract), addressed by `paletteId` (uint8).
- **Index 0 is the background** by convention. The renderer fills the canvas with
  palette[0] once, then only emits rects for indices != 0 (matches the prototype's
  `skipBg`). This keeps the SVG small.
- Ship with a curated set (the prototype uses 6: Ember, Tide, Dusk, Verdant,
  Mono+, Candy). Each is a coherent 16-stop ramp.

### 2.3 Token = palette ID + pixel buffer
On-chain, a token's image is fully described by:
- `paletteId` (uint8) — which curated palette
- `pixels` (bytes, 2048) — the 4bpp index buffer

## 3. Rendering (must match `reference/PixelChroma.jsx`)

The renderer walks the buffer row by row and **run-length-encodes** horizontal runs
of identical index into a single `<rect>`. This is the same optimization Normies' V3
renderer uses. Background runs (index 0) are skipped.

Output SVG shape (1024×1024 viewBox, `shape-rendering="crispEdges"`):
```
<svg ... viewBox="0 0 1024 1024" shape-rendering="crispEdges">
  <rect width="1024" height="1024" fill="{palette[0]}"/>
  <rect x=".." y=".." width=".." height="16" fill="{palette[idx]}"/>
  ...
</svg>
```
Each grid cell is `1024/64 = 16` SVG units. The Solidity renderer must produce
identical output to the JS reference for the same inputs — write a test that asserts this.

## 4. Traits

Traits drive generation and metadata (Normies-style: one byte per category).
Starter schema (extend as you like):

| Byte | Category | Example values |
|---|---|---|
| 0 | Type | Human, Cat, Alien, Droid, Specter |
| 1 | Expression | Neutral, Smile, Serious, Smug, Surprised, Sleepy |
| 2 | Headgear | None, Cap, Crown, Halo, Antenna, Top Hat, Visor, Beanie |
| 3 | Eyewear | None, Shades, Round Glasses, Visor, Eyepatch, VR |
| 4 | Palette | (the paletteId, 0–N) |

Traits can be derived deterministically from the token's pixel data at render time
(decode-from-image, like Normies) OR stored explicitly. Recommend: store the trait
bytes alongside the pixel buffer for cheap reads.

## 5. Contracts (mirror the Normies split)

Build four contracts. Reuse the Normies architecture from `normies-reference.txt`.

1. **ChromaStorage** — SSTORE2 storage for per-token pixel buffers (2,048 B each)
   and trait bytes. One SSTORE2 pointer per token; data is immutable after write.
2. **ChromaRenderer** — pure/view contract. Takes a tokenId, reads pixels + paletteId
   from storage, looks up the 48-byte palette, emits RLE-optimized SVG and the full
   `tokenURI` metadata JSON (base64 data URI). Must match the JS reference renderer.
3. **Chroma (ERC721)** — the token contract. ERC721C-style with ERC-2981 royalties
   (same as Normies). Holds mint logic, delegates rendering to ChromaRenderer via
   an upgradeable renderer pointer (so you can ship renderer V2 later).
4. **ChromaCanvas** (optional, phase 2) — burn-to-edit layer. **Key difference from
   Normies:** Normies stores edits as a 1-bit XOR overlay because flipping a bit is
   self-inverse. With 4-bit indices that doesn't work. Store edits as a **sparse diff**:
   a list of `(pixelIndex uint16, newColorIndex uint8)` entries, OR a full replacement
   buffer for heavily-edited tokens. The composited image = original buffer with diffs
   applied.

Palette storage: simplest is to hardcode the curated palettes as constants in
ChromaRenderer (cheapest reads, immutable). If you want to add palettes later, use a
separate `PaletteRegistry` the renderer reads from.

## 6. API (mirror Normies' open, keyless, rate-limited design)

Same philosophy as Normies: no auth, no API key, ~60 req/min/IP, data sourced from
on-chain contracts via a Ponder indexer. Endpoints, widened for indices + palette:

```
GET /chroma/:id/pixels            -> 4096-char string of hex nibbles (0-F), row-major
GET /chroma/:id/buffer            -> raw 2048-byte buffer as hex string
GET /chroma/:id/palette           -> { id, name, colors: ["#rrggbb", ...16] }
GET /chroma/:id/traits            -> decoded traits JSON (human-readable labels)
GET /chroma/:id/image.svg         -> RLE-optimized SVG (1024x1024)
GET /chroma/:id/image.png         -> rasterized PNG
GET /chroma/:id/metadata          -> full ERC721 tokenURI metadata JSON
GET /chroma/:id/owner             -> current owner (404 if burned/unminted)
GET /holders/:address             -> all token IDs owned by a wallet
GET /palettes                     -> list all curated palettes
# Canvas (phase 2):
GET /chroma/:id/canvas/diff       -> [{ x, y, fromColor, toColor }, ...]
GET /chroma/:id/canvas/info       -> { actionPoints, level, customized, ... }
GET /history/...                  -> burns, versions, stats (as Normies)
```

Every response includes rate-limit headers. Errors return `{ "error": "message" }`
with 400 / 404 / 429 / 500 as appropriate.

---

# Part 2 — Cursor Build Plan

Give Cursor these prompts **in order**, one at a time. Wait for each to finish and
review the output before moving on. Prefix every prompt with the context files:
`@docs/chroma-spec.md @docs/normies-reference.txt`.

### Prompt 0 — scaffold
```
@docs/chroma-spec.md @docs/normies-reference.txt
Set up a Foundry project for the Chroma NFT contracts described in the spec.
Create the directory structure, foundry.toml, and empty contract stubs for
ChromaStorage, ChromaRenderer, Chroma (ERC721), and ChromaCanvas. Install
solmate or OpenZeppelin for ERC721 + ERC2981. Add a SSTORE2 library
(solady's is fine). Don't implement logic yet — just compiling stubs and a
passing empty test.
```

### Prompt 1 — storage
```
@docs/chroma-spec.md
Implement ChromaStorage. It stores, per tokenId: a 2048-byte 4bpp pixel buffer
and a 5-byte trait array, written via SSTORE2 (one pointer per token), immutable
after write. Add a write function gated to an authorized writer (the Chroma token
contract or a deployer), and view functions getPixels(id) and getTraits(id).
Write Foundry tests that round-trip a known buffer.
```

### Prompt 2 — renderer (the critical one)
```
@docs/chroma-spec.md @reference/PixelChroma.jsx
Implement ChromaRenderer as a view contract. Given a tokenId it reads pixels +
paletteId from ChromaStorage, looks up the 16-color palette (hardcode the 6
curated palettes from PixelChroma.jsx as constants), and produces:
(a) renderSVG(id) -> RLE-optimized SVG string, identical in output to the
    renderSVG() function in PixelChroma.jsx (1024x1024, crispEdges, skip index 0,
    merge horizontal same-index runs into one rect),
(b) tokenURI(id) -> base64 data URI with name, attributes (decoded traits),
    and the embedded SVG image.
Write a test that decodes a known buffer and asserts the SVG matches the exact
bytes the JS reference produces for the same buffer + palette. Match nibble
ordering (high nibble = even x) exactly.
```

### Prompt 3 — token contract
```
@docs/chroma-spec.md @docs/normies-reference.txt
Implement the Chroma ERC721 contract. ERC721 + ERC2981 royalties. Mint function
that writes the token's pixel buffer + traits to ChromaStorage. tokenURI(id)
delegates to ChromaRenderer through an owner-settable renderer address (so a
future renderer V2 can be swapped in). Mirror the Normies minter patterns from
the reference where useful. Tests: mint, tokenURI returns valid data URI, royalty
info correct, renderer swap works.
```

### Prompt 4 — indexer + API
```
@docs/chroma-spec.md @docs/normies-reference.txt
Set up a Ponder indexer that watches the Chroma contract's Transfer events to
maintain an ownership index. Then build a TypeScript HTTP API (the framework of
your choice) exposing the endpoints in the spec's API section: pixels, buffer,
palette, traits, image.svg, image.png, metadata, owner, holders, palettes.
Read on-chain data via viem; reuse the Ponder index for ownership/holders.
Match Normies' design: no auth, 60 req/min/IP rate limit with headers, JSON
errors. image.png should rasterize the SVG server-side.
```

### Prompt 5 — canvas (optional, phase 2)
```
@docs/chroma-spec.md
Implement ChromaCanvas: a burn-to-edit layer. Unlike Normies' XOR overlay, store
edits as a sparse diff of (pixelIndex uint16, newColorIndex uint8) entries per
token. Add commit-reveal burn -> action points -> applyDiff flow modeled on the
Normies Canvas in the reference. The renderer's composited view applies the diff
on top of the original buffer. Add the /canvas/diff, /canvas/info, and /history
API endpoints. Tests for diff application and the composited render.
```

### Prompt 6 — art engine (replace placeholder generation)
```
@reference/PixelChroma.jsx
The generateToken() function in PixelChroma.jsx is placeholder art. Build a
richer deterministic art engine in TypeScript that produces 64x64 4bpp index
buffers from a tokenId seed, using layered trait-based composition (base shape,
features, headgear, eyewear) per the trait schema. Output must be a 2048-byte
buffer ready to write to ChromaStorage. Keep it fully deterministic (same seed
=> same token). Generate the full collection's buffers as a build step.
```

---

## Build order rationale

- **Renderer before token contract**: the renderer is the hard, correctness-critical
  piece. Get its output matching the JS reference exactly before anything depends on it.
- **Storage before renderer**: the renderer reads from it.
- **API after contracts**: it reads on-chain data, so contracts must exist first.
- **Canvas and art engine last**: both are independent of the core mint/render path
  and can ship in a later phase.

## Things to verify as you go

- Nibble packing order is consistent everywhere (JS reference, Solidity, API).
- The Solidity SVG matches the JS reference byte-for-byte (write the assertion test).
- Per-token SSTORE2 write stays under the ~24KB contract-bytecode limit (2KB is fine).
- Gas per mint is acceptable on your target chain — 2KB writes are ~10x a Normie.
- Index 0 = background is treated consistently (filled once, skipped in rects).
