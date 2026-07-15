# BG Color Palette — ruling

**Ruling (JB, 2026-07-13):**

> The mint-native background color palette is ratified at eight colors:
>
> | Trait byte | Name | Hex |
> |---|---|---|
> | `0x01` | BG_ROSE | `#E3C8C8` |
> | `0x02` | BG_CREAM | `#E8DFC5` |
> | `0x03` | BG_SEAFOAM | `#BDD9D5` |
> | `0x04` | BG_LILAC | `#D3C9DE` |
> | `0x05` | BG_BLUE | `#C7D4E2` |
> | `0x06` | BG_PEACH | `#E8D2BE` |
> | `0x07` | BG_SAGE | `#CEDAC6` |
> | `0x08` | BG_MAUVE | `#E0CCD9` |
>
> Default (non-colored) background remains `#E3E5E4`, renderer-applied, never
> stored in payload data. Trait byte `0x00` = default.

## Ratified terms

- **Coverage:** colored BG applies to ~35% of the collection at generation.
- **Storage:** stored as a trait byte in `traitsHex`, never in `pixelsHex`.
  Trait byte `0x00` = default; bytes `0x01`–`0x08` map to the palette above in
  listed order.
- **Rendering:** renderer maps trait byte → PLTE slot 0 (the `background`
  role). Canvas state, where set, **overrides** the trait byte —
  single-source precedence rule, parity-checked.
- **Registry:** palette hexes enter `art-pipeline/palette-registry.json` as
  compiled, CI-diffed artifacts (same regime as palette/trait bytes — no
  hand-maintained tables downstream).
- **Verification:** checked against the contrast test set (darkest apparel,
  olive skin, blonde/pale, red hair) via proof sheet. JB approval 2026-07-13.

## Implementation state (this session)

- `art-pipeline/palette-registry.json` — new `bg_colors` section: default
  (byte 0, `#e3e5e4`, renderer-applied note) + the 8 ratified colors with
  trait bytes 1–8.
- `scripts/compile_palette_registry.py` — validates the `bg_colors` section
  (byte ordering, hex format, count of 8, default invariants) and compiles:
  - `art-pipeline/generated/on-chain-bg-colors.js` (`BG_COLOR_BYTES`)
  - `chromies-engine/engine_data/bg_colors.json`
- CI drift gates (`scripts/check_palette_registry.py`,
  `scripts/check_mint_encoder.py`) track both new artifacts.

**Not implemented by this ruling** (no generation/encoder behavior change):
no BG roll exists in `art-pipeline/generate.js` and no renderer change was
made. The `traitsHex` byte index is assigned — index 15, per the addendum
below. The main-collection pipeline remains FROZEN per `SESSION_HANDOFF.md`;
wiring the BG trait into generation/encoding/rendering is follow-up work gated
on the open items below.

## Open (not covered by this ruling)

1. Per-color weighting within the 35%.
2. Mint-native vs burn-applied metadata distinction.
3. Burn redemption structure.
4. Mint-time vs post-mint assignment.

## Addendum (2026-07-13, JB ruling) — trait byte assignment

The BG color trait byte is assigned to **`traitsHex` index 15**, re-designating
the first retired-reserved byte (mutation-era). Index 16 remains
retired-reserved. Byte semantics per the main ruling: `0x00` default,
`0x01`–`0x08` per the ratified palette order.

Pre-assignment safety grep (full repo — engine, pipeline, Solidity, frontend,
CI gates) confirmed nothing live reads or asserts on byte 15: current
`ChromaRenderer.sol` reads traits[0]–[14] only, `ChromaCanvasV2.sol` reads
only 17/18, the traits parity harness skips retired slots semantically and
compares encoder-vs-encoder (no zero assertion), and the frontend treats
`traitsHex` as an opaque blob. Two dead consumers were found and dispositioned:

- Deleted legacy forensic script `check-token29-mutation.mjs`, which decoded
  byte 15 under the retired mutation-era layout. Its subject system (render-time
  mutation) is fully removed; under the new assignment it would misreport BG
  bytes as mutation tiers.
- `docs/chromies-contracts.md` (generated contract bundle) had drifted from
  `contracts/` and still documented the mutation-era layout — regenerated via
  `scripts/bundle-contracts.mjs` from current sources.

Annotation updates (documentation only, no logic changes): the byte-15 line in
`contracts/ChromaStorage.sol`'s trait-layout comment now reads "BG color: 0x00
default, 0x01-0x08 per palette ruling"; byte 16 stays "Retired / unused". The
pipeline remains FROZEN — no `generate.js`, encoder, or renderer logic changes;
wiring the BG roll/encode/render path is still gated on the open items above.
