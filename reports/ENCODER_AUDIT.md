# Encoder audit — split-authority defect

**Date:** 2026-07-08  
**Trigger:** testrun_2000 found 12 full-payload duplicates (11 groups) — 6 encoding-collapse, 5 roll-space  
**Status:** Fixed — registry compile + dedupe pass landed (see `testrun_2000_post_encoder_fix_report.md`)

---

## 1. Encoder map (every path)

| # | Module | Role | Palette bytes source | Trait-slot bytes source | Produces `traitsHex`? |
|---|--------|------|----------------------|-------------------------|----------------------|
| A | `art-pipeline/generate.js` | Compositor, trait rolls, `buildTraitVectorKey` | `chromies-config.js` `PALETTES` (full 80+) | *(none — render only)* | **No** |
| B | `art-pipeline/bridge-mint-data.js` | **Mint payload encoder** (`encodeTraits`, `buildMintRecord`) | `on-chain-character-bytes.js` `ON_CHAIN_PALETTE_BYTES` (**27 base + normie, no `*_SHIRT_*`**) | Inline `HOOD_BYTES`, `SHIRT_BYTES`, … (**base names only, ~10/slot**) | **Yes — authoritative for testrun + mint-data** |
| C | `art-pipeline/generated/on-chain-palette-bytes.js` | Compiled palette name→ID | `palette-registry.json` via `compile_palette_registry.py` (**80 palettes**) | — | No |
| D | `chromies-engine/engine/mint_payload.py` | Python mint encoder (`encode_traits`, `build_mint_payload`) | `engine_data/on_chain_palette_bytes.json` (**compiled, 80 palettes**) | Inline `HOOD_BYTES`, … (**same sparse tables as bridge**) | Yes — Python parity path |
| E | `chromies-engine/engine/payload_pipeline.py` | `generate_chromie_payload` (traits→buffer→pack→preview) | Via D | Via D | Yes |
| F | `chromies-engine/scripts/parity_harness.py` | 1011-seed baseline: pack → Foundry renderer → **pixel diff** | Via D→E | Via D | Uses E's output |
| G | `contracts/ChromaRenderer.sol` | On-chain decode: `traits[1]` → palette ID, `traits[2..14]` → *(metadata only today)* | `ChromaPaletteData.sol` (compiled) | Contract does not decode trait variant names | Consumes `traitsHex` |

### Authority split (the defect)

```
                    ┌─────────────────────────────────────┐
  chromies-config   │  PALETTES (80+, shirt variants)      │  ← render truth
  palette-registry  │  compiled → ChromaPaletteData.sol    │  ← on-chain color truth
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   generate.js render          Python mint_payload          bridge-mint-data.js
   (full palette names)        (compiled palettes ✓)        (STALE on-chain-character-bytes.js ✗)
          │                           │                           │
          │                           │                           │
          └──────── pixels ───────────┴──── traitsHex (DIVERGENT) ─┘
```

**`bridge-mint-data.js` does NOT share an encoder with `generate.js`.**  
Compositor and mint encoder are separate codepaths. `generate.js` never calls `encodeTraits`.

**`bridge-mint-data.js` does NOT use `generated/on-chain-palette-bytes.js`.**  
It imports `ON_CHAIN_PALETTE_BYTES` from hand-maintained `on-chain-character-bytes.js` (IDs 0–37 only; no `SIGNAL_SHIRT_RED` = 38, etc.).

**Python `mint_payload.py` partially diverges from bridge:** palettes are compiled (correct), but trait-slot tables are still the same sparse hand-maintained maps copied into Python — archetype variant names (`Female_LookLeft`, `Zombie_Shades`, `Crew_Female`, …) are absent → byte `0`.

---

## 2. Why shirt-byte-0 collapse happened

When `encodeTraits` runs in `bridge-mint-data.js`:

```javascript
const byteVal = lookupByte(slot.table, raw, ...);
// table[value] === undefined → warnings.push(...) → return 0
```

For token #2 (`BLOOD_SHIRT_GREEN`) and #873 (`SIGNAL_SHIRT_RED`):

| Field | #2 | #873 |
|-------|----|------|
| `record.palette` (roll) | `BLOOD_SHIRT_GREEN` | `SIGNAL_SHIRT_RED` |
| `traits[1]` inscribed | **0** | **0** |
| Compositor render | Uses full palette from `chromies-config` | Same |

Both shirt palettes are **absent** from `on-chain-character-bytes.js` → both encode as byte `0` (SIGNAL). Compositor still renders with correct per-token palette keys → pixels can match when stacks are visually identical under different palette families that map to the same role-index buffer.

---

## 3. Why the 1011-seed parity harness did not catch this

### What the harness tests

`parity_harness.py` (1011 baseline + supplemental):

1. `generate_chromie_payload(seed)` → Python encoder (D/E)
2. Export `(pixelsHex, traitsHex)` to Foundry
3. Rasterize on-chain renderer output
4. **Assert zero pixel diff** vs Python payload preview
5. **Assert PLTE chunk** matches registry for `palette_id = traits[1]`
6. Fail on `encode_warnings` starting with `"Palette"` only

### What it does NOT test

| Check | Covered? | Gap |
|-------|:--------:|-----|
| Pixel preview vs on-chain renderer | ✅ | — |
| PLTE bytes vs registry for encoded `palette_id` | ✅ | — |
| **`traitsHex` round-trip to rolled `palette_key`** | ❌ | **Blind spot** |
| **`traitsHex` round-trip to rolled `render_picks` variant names** | ❌ | **Blind spot** |
| Cross-seed payload uniqueness | ❌ | Not in scope |
| **JS `bridge-mint-data.js` encoder** | ❌ | Harness never calls bridge |
| Trait-slot encode warnings (non-palette) | ❌ | Only `_palette_encode_failure` checked |

### Precise answer

The harness did not catch shirt-byte-0 collapse because of **three compounding gaps**:

1. **Divergent encoders** — Harness exercises **Python** `mint_payload.py` which loads **compiled** `on_chain_palette_bytes.json` (80 palettes). Shirt variants encode to correct IDs (38–79). The **JS bridge** used for testrun_2000 was never exercised.

2. **Pixel-only parity** — Even if Python encoded shirt palettes correctly, the harness only asks: “does this seed's renderer output match this seed's payload preview?” It never asks: “does `traits[1]` equal the rolled `palette_key`?” A seed with `palette_key=SIGNAL_SHIRT_RED` and `traits[1]=38` passes pixel parity. The harness would **not** detect `traits[1]=0` unless that caused a pixel mismatch — and it often doesn't, because the **preview is rendered from the pipeline palette table**, not from re-decoding `traits[1]`.

3. **traitsHex path vs pixel path** — Payload preview uses `render_from_payload(pixels, traits)` which reads `palette_id = traits[1]` for color lookup. **Wait** — if Python encodes shirt correctly, traits[1]=38 and preview uses palette 38. If bridge encodes 0, preview from bridge decode would use SIGNAL colors — different from compositor. The testrun uses bridge pixels packed from compositor buffer but traits from bridge encoder — **split within the same token**: pixels from full-palette compositor, traits from collapsed encoder. The parity harness builds both from Python consistently.

**Explicit blind spot statement:** The 1011-seed harness has a **traitsHex semantic blind spot**. It validates **pixel-level** parity between payload decode and on-chain renderer for the **Python encoder path only**. It does **not** validate that inscribed trait bytes faithfully represent the rolled trait vector. Encoding collapse (trait bytes → 0) is invisible when pixel previews are built from the compositor palette key rather than from a traitsHex round-trip audit.

---

## 4. Visual-only collisions (19 groups / 30 instances)

Same `pixelsHex`, different `traitsHex` — compositor rendered identical pixels but encoders produced different byte patterns (often one encodes a variant name, another falls back to 0, yet pixels match because the non-encoded visual difference is occluded or maps to transparent).

**Stance (for JB ruling):** Recommend **dedupe key = `pixelsHex` alone** for mint uniqueness, with `traitsHex` required to be consistent with pixels (traits-level parity gate). Rationale:

- **On-chain identity is visual** — holders see decoded PNG/SVG, not metadata strings.
- **30 visually identical tokens at 5,150 scale (~77 projected)** is a collection-integrity defect regardless of metadata distinction.
- Including `pixelsHex` in dedupe does **not** change determinism for non-colliding tokens; colliding tokens get `payloadDedupe:N` rerolls logged in provenance.
- **Do not accept** visual-only duplicates for production mint.

---

## 5. Approved remediation (implementation plan)

| Step | Action |
|------|--------|
| 1 | `trait-byte-registry.json` + extend `compile_palette_registry.py` → compiled `on-chain-character-bytes.js`, `on-chain-trait-bytes.js`, Python `engine_data` |
| 2 | Kill hand-maintained tables; bridge + `mint_payload.py` import compiled artifacts only |
| 3 | CI: `check_mint_encoder.py` diff gate (same discipline as palettes) |
| 4 | Traits-level parity: baseline seeds assert `encode(rolls) === traitsHex` decode |
| 5 | Payload dedupe: `pixelsHex‖traitsHex` collision → `tokenId:payloadDedupe:N` reroll, provenance log |
| 6 | Re-run testrun 2000; expect 0 full-payload dups post-fix |

**Not approved:** weight adjustments (distribution stays JB-tuned).

**Not in scope:** mint-data batch write, contract changes.
