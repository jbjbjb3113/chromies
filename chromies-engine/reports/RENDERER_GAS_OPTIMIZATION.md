# Renderer Gas Optimization Report (Pass A)

**Status:** **CLOSED** — Pass B.1 deployed to Sepolia 2026-07-07 (`0xE6Ed418e5175cd56b53e1a8af4B8666f66654DE6`). Mainnet untouched.

**Generated:** 2026-07-07  
**Scope:** `ChromaRenderer.sol` + `ChromaRendererSvgLib.sol` only — palette data, storage, packing, and payloads **frozen**.  
**Sepolia deploy:** renderer-only redeploy complete (2026-07-07).

---

## Executive summary

Pass A replaced per-run `<rect>` SVG output with **palette-grouped `<path>` commands**, **exact-size buffer allocation**, and **decimal writers without `Strings.toString`**. Raster output is **pixel-identical** (100-seed parity harness **PASS**).

**Targets were not met.** Pass B (indexed PNG output path) is required before redeploy. **Do not deploy Pass A to Sepolia expecting RPC-safe `tokenURI`.**

| Metric | Before Pass A | After Pass A | Target | Margin vs target |
|--------|--------------:|-------------:|-------:|-----------------:|
| Worst real token (seed 410) `tokenURI` | 52,338,009 | **30,645,063** | ≤ 5,000,000 | **6.1× over** |
| Synthetic ceiling `tokenURI` | 174,401,412 | **88,452,930** | ≤ 10,000,000 | **8.8× over** |
| Seed 410 `renderSVG` | 35,661,562 | **25,940,273** | — | 27% reduction |
| Synthetic `renderSVG` | 106,555,862 | **71,069,623** | — | 33% reduction |

**Gate decision:** **STOP for redeploy approval** — proceed to Pass B design review, not mainnet/Sepolia renderer swap.

---

## Task 1 — Pre-optimization profile (hypothesis)

### Baseline (from `GAS_STRESS_REPORT.md`, rect renderer)

| Case | `tokenURI` | `renderSVG` | Runs / row (worst) | SVG output size (approx.) |
|------|----------:|------------:|-------------------:|--------------------------:|
| Seed 410 | 52,338,009 | 35,661,562 | max 32 / mean 16 | ~120–200 KB (4096-cap buffer, ~1–2K rects) |
| Synthetic ceiling | 174,401,412 | 106,555,862 | 64 | ~500 KB preallocated body |

### Phase breakdown (seed 410, rect era — inferred + structure)

| Phase | Est. gas | Share of `tokenURI` | Notes |
|-------|----------:|--------------------:|-------|
| SSTORE2 reads (`getTraits` + `getPixels` + `getTotalPixels`) | ~15–25K | &lt;0.1% | Not the bottleneck |
| Pixel decode + RLE scan | ~1–3M | ~5% | `_getCompositePixelIndex` × grid |
| **SVG string assembly + memory expansion** | **~30–35M** | **~65%** | **512 KB fixed body alloc**; up to **4096×** `abi.encodePacked` + `Strings.toString` per rect |
| Base64 (SVG + JSON) + trait JSON assembly | ~15–17M | ~30% | Scales with SVG byte length |
| **Total `tokenURI`** | **52,338,009** | 100% | |

### Hypothesis: **CONFIRMED**

String assembly and memory expansion dominated. Evidence:

1. Removing the 512 KB blind allocation and rect-level `toString` cut seed-410 `tokenURI` **41%** despite unchanged storage reads.
2. SVG byte size dropped from ~120+ KB rects to **23,748 bytes** paths for seed 410 — Base64 cost fell but render pass still ~26M due to **multi-pass scan**, run recording, and color-grouped path writes.

### Post–Pass A profile (instrumented, `ChromaRendererGasProfileTest`)

| Phase | Seed 410 | Synthetic 999001 |
|-------|----------:|-----------------:|
| SSTORE2 reads | 15,459 | 15,238 |
| Render bundle (`profileRenderParts`) | 29,919,125 | 85,391,721 |
| `tokenURI` (cold, gas stress) | **30,645,063** | **88,452,930** |
| SVG bytes | 23,748 | 77,480 |
| Color runs | 1,222 | 4,096 |

Estimated JSON + double-Base64 overhead (seed 410): **~4.7M gas** (`tokenURI` − `renderSVG`).

---

## Task 2 — Pass A changes (ChromaRenderer only)

### `ChromaRendererSvgLib.sol`

1. **Single-pass run collection** into exact-size `RunRecord[]` (no `4096`-slot prealloc).
2. **Palette-grouped paths:** one `<path fill="#rrggbb" d="…"/>` per color index, each run encoded as `Mx,yh{w}v16h-{w}z`.
3. **Exact buffer sizing** via `_scanMeta` (run count + byte length) — fixed undersize bug in path header constants that caused OOB before correction.
4. **Fixed-width decimal writers** — no `Strings.toString` in hot loop.
5. **Background** as single path `M0,0h1024v1024h-1024z` (same raster as full-size rect).
6. **`buildSvgBytes`** — one allocation for full SVG bytes.

### `ChromaRenderer.sol`

1. **`tokenURI`** loads traits once; builds SVG bytes once; Base64-encodes without duplicate `renderSVG` call.
2. **`profileRenderParts` / `profileTokenJsonParts`** — measurement hooks only (no production behavior change).

### Frozen (unchanged)

- `ChromaPaletteData`, `ChromaStorage`, pixel packing, canvas diff semantics, trait JSON schema.

### Raster parity

- Updated `parity_harness.py` path rasterizer (rect + path).
- **100-seed parity harness:** `ok=True` (`chromies-engine/reports/payload_first_parity_report.md`).
- Full 1011-seed gate **not required** — targets missed (Task 4).

---

## Task 3 — Re-measurement

### Headline numbers (Foundry `gasleft`, cold calls)

| Operation | Seed 410 | Synthetic ceiling |
|-----------|----------:|------------------:|
| `renderSVG` | 25,940,273 | 71,069,623 |
| `tokenURI` | **30,645,063** | **88,452,930** |

### Targets vs working caps

| Cap | Seed 410 `tokenURI` | Synthetic `tokenURI` | Pass? |
|-----|--------------------:|---------------------:|:-----:|
| Target (worst real ≤ 5M) | 30.6M | — | **no** (6.1×) |
| Target (synthetic ≤ 10M) | — | 88.5M | **no** (8.8×) |
| Alchemy observed ~16.7M | 30.6M | 88.5M | **no** |
| 20M working cap (2× headroom on 10M synth) | 30.6M | 88.5M | **no** |

### 1000-seed distribution

Full sweep re-running via `py scripts/run_gas_stress.py --skip-csv --skip-batch-csv` after Pass A. Expect **~40–50% reduction** vs pre-optimization medians (rect baseline median **34.3M** → projected **~18–22M**). Still above 5M worst-real target.

Pre-optimization reference (rect renderer):

| Stat | `tokenURI` gas |
|------|---------------:|
| min | 19,978,631 |
| median | 34,259,507 |
| p95 | 46,074,385 |
| max (seed 410) | 52,338,009 |

### Live-style RPC check

Sepolia inscribed tokens 1–5 still **OOG at ~16.7M** under rect renderer (`GAS_STRESS_REPORT.md`). Pass A seed-410 local **`tokenURI` ~30.6M** — still **1.8×** the observed Alchemy cap. **No Sepolia deploy performed;** local measurement remains authoritative.

---

## Task 4 — Gate

| Check | Result |
|-------|--------|
| Worst real ≤ 5M | **FAIL** (30.6M) |
| Synthetic ≤ 10M | **FAIL** (88.5M) |
| 100-seed raster parity | **PASS** |
| Palette byte-stability tests | **PASS** (`ChromaPaletteByteStabilityTest`) |
| Contract size gate (22 KB) | **PASS** — `ChromaRenderer` runtime **~12,939 B** (build trace) |
| Full 1011-seed parity + redeploy | **Not run** — blocked on gas targets |

**Decision:** **STOP for redeploy approval.** Pass B required.

---

## Pass B — Indexed PNG tokenURI (implemented)

**Generated:** 2026-07-07  
**Scope:** `ChromaRenderer.sol` + `ChromaRendererPngLib.sol` + `ChromaRendererCrc32.sol` only — palette data, storage, packing **frozen**.  
**Sepolia deploy:** renderer-only redeploy complete (2026-07-07).

### Executive summary

Pass B replaces the `tokenURI` image field with a **fixed SVG shell** (`image-rendering="pixelated"`) embedding a **base64 indexed PNG** (64×64, 4 bpp, color type 3). PNG is built from the frozen 2048-byte role-index buffer: IHDR, PLTE from `paletteColors(traits[1])`, IDAT as zlib **STORED** blocks (filter byte 0 per row), IEND. CRC32 via embedded lookup table (`ChromaRendererCrc32`).

**Raster parity: PASS** — 1022/1022 (1011 baseline + 11 supplemental forced-coverage). PLTE bytes match registry per token (on-chain `ChromaRendererPlteTest` + harness PLTE proof).

**Gas targets still not met**, but distribution is **nearly flat** and worst-case is now **~1.1×** the observed Alchemy ~16.7M RPC cap (was ~1.8× under Pass A).

| Metric | Pass A | Pass B | Target | Pass? |
|--------|-------:|-------:|-------:|:-----:|
| Worst real `tokenURI` | 30,645,063 (seed 410) | **17,647,417** (seed 260) | ≤ 5,000,000 | **no** (3.5×) |
| Synthetic ceiling `tokenURI` | 88,452,930 | **17,617,164** | ≤ 10,000,000 | **no** (1.8×) |
| Worst real `renderImageShell` | 25,940,273 (SVG) | **16,711,027** | — | 36% reduction |
| Synthetic `renderImageShell` | 71,069,623 | **16,708,252** | — | 76% reduction |
| `ChromaRenderer` runtime | 12,996 B | **20,360 B** | ≤ 22,000 B | **yes** |

**Gate decision:** **STOP for redeploy approval** — Pass B is parity-safe and RPC-margin improved, but worst `tokenURI` still exceeds 5M target and marginally exceeds default Alchemy cap.

---

### PNG encoder

| Component | Detail |
|-----------|--------|
| IHDR | 64×64, bit depth 4, color type 3 (indexed) |
| PLTE | 48 bytes — 16× RGB from `paletteHexToRgb(paletteColors(id))` |
| IDAT | zlib CMF/FLG `0x78 0x01`, one STORED block, 2112-byte filtered image (64×33), Adler32 |
| IEND | zero-length chunk |
| Output size | PNG **2240 B**; SVG shell **3178 B** (constant for all tokens) |
| `tokenURI` image | `data:image/svg+xml;base64,{shell}` |

### CRC32 gas profile (explicit)

Instrumented via `ChromaRendererPngLib.profileCrcGas` — measures CRC32 only on IHDR + PLTE + IDAT + IEND chunk inputs:

| Case | CRC32 gas | `renderImageShell` gas | CRC share of render |
|------|----------:|-----------------------:|--------------------:|
| Seed 410 (profile) | 12,067,464 | 51,569,264 (bundle incl. double-build) | **~23%** of cold bundle |
| Synthetic 999001 | 12,063,298 | 51,567,129 | **~23%** of cold bundle |
| Seed 260 (gas stress) | — | 16,711,027 | **~72%** est. (12M / 16.7M) |
| Worst `tokenURI` | — | 17,647,417 | **~68%** est. |

The lookup-table CRC (`ChromaRendererCrc32`, 256-entry split across `_T0`–`_T7`) dominates the render path. Pixel packing + zlib STORED + hex palette parse account for the remainder; JSON + double-Base64 adds **~0.9M** (`tokenURI` − `renderImageShell`).

**Next optimization lever (out of Pass B scope):** cheaper CRC (slice tables, fewer chunk CRCs, or precomputed chunk CRCs for fixed IHDR/IEND).

---

### 1000-seed distribution (nearly flat)

Pass B output size is **constant** (~3.2 KB shell) regardless of color-run complexity — unlike Pass A SVG paths.

| Stat | `tokenURI` gas |
|------|---------------:|
| min | 17,618,714 |
| median | 17,631,438 |
| mean | 17,631,719 |
| p95 | 17,640,144 |
| max (seed 260) | 17,647,417 |
| **spread (max − min)** | **28,703** (~0.16%) |

Synthetic ceiling (64 distinct indices/row): **17,617,164** — below baseline worst. Distribution is flat because gas no longer scales with horizontal color runs.

---

### Parity

| Check | Result |
|-------|--------|
| 1011-seed baseline | **1011/1011** zero pixel diff |
| Supplemental forced-coverage (11 palettes) | **11/11** |
| Side-profile seeds (28) | **28/28** |
| Agent-grayscale seeds (7) | **7/7** |
| PLTE vs registry | **PASS** (`ChromaRendererPlteTest` + harness) |
| Palette byte-stability | **PASS** (`ChromaPaletteByteStabilityTest`) |

Harness decodes PNG through the SVG shell via manual 4bpp unpack (Pillow does not decode 4-bit indexed PNGs reliably).

---

### `renderSVG` fate

**Kept as secondary view** — `api/server.ts` calls on-chain `renderSVG` for `/chroma/:id/image.svg` and `/image.png`. Client `PixelChroma.jsx` uses local JS `renderSVG`, not the contract. `ChromaRendererSvgLib` remains linked for this API path; `tokenURI` does not call it.

---

### Live-style RPC check

Sepolia inscribed tokens 1–5 still **OOG at ~16.7M** on Alchemy (`GAS_STRESS_REPORT.md`). Pass B worst local `tokenURI` **17,647,417** is **1.06×** the live cap — marginal improvement from Pass A's **1.8×**. No Sepolia deploy performed.

---

### Gate checklist

| Check | Result |
|-------|--------|
| Worst real ≤ 5M | **FAIL** (17.65M) |
| Synthetic ≤ 10M | **FAIL** (17.62M) |
| 1011 + supplemental parity | **PASS** (1022/1022) |
| PLTE registry proof | **PASS** |
| Byte-stability | **PASS** |
| Contract size ≤ 22 KB | **PASS** (20,360 B) |
| CI gas regression | **PASS** (`ChromaRendererGasRegressionTest`) |
| Sepolia redeploy | **STOP** — approval required |

---

### Pass B files changed

| File | Change |
|------|--------|
| `contracts/ChromaRendererPngLib.sol` | PNG + zlib STORED + SVG shell + PLTE extract |
| `contracts/ChromaRendererCrc32.sol` | CRC32 lookup table |
| `contracts/ChromaRenderer.sol` | `tokenURI` → PNG shell; `renderImageShell`; `renderSVG` retained |
| `chromies-engine/scripts/parity_harness.py` | PNG-in-shell raster + PLTE registry verify |
| `chromies-engine/generated/gas_regression_fixtures.csv` | Seed 260 fixture for CI gas regression |
| `test/ChromaRendererGasRegression.t.sol` | Worst-real + ceiling gas bounds |
| `test/ChromaRendererPlte.t.sol` | On-chain PLTE proof |
| `test/ChromaRendererGasProfile.t.sol` | PNG/CRC profiling |
| `test/ChromaRendererParity.t.sol` | Export `renderImageShell` |
| `test/GasStressTokenURI.t.sol` | Measure `renderImageShell` |

---

### Pass B commands

```powershell
# Profile seed 410 + synthetic (CRC gas explicit)
$env:GAS_STRESS_CSV_PATH='./chromies-engine/generated/gas_stress_parity_410_410.csv'
.\.foundry-bin\forge.exe test --match-contract ChromaRendererGasProfileTest -vv

# Gas stress (1000 seeds + synthetic ceiling)
py scripts/run_gas_stress.py --skip-csv --skip-batch-csv

# Full parity (1011 + supplemental)
py chromies-engine\scripts\parity_harness.py --count 1011

# CI gas regression
.\.foundry-bin\forge.exe test --match-contract ChromaRendererGasRegressionTest -vv

# Size gate
py scripts\check_contract_size_gate.py
```

---

## Pass B — Original design notes (pre-implementation)


### Problem Pass A cannot solve

`tokenURI` must embed metadata image bytes in JSON + Base64. Even at **24 KB SVG**, double Base64 + multi-pass SVG construction costs **~30M gas**. Worst-case art approaches **4K horizontal runs** → path command strings **~80 KB+** → still **88M gas** synthetic.

### Proposed Pass B: indexed PNG `image` field

1. **On `inscribe` (or lazy on first `tokenURI`):** decode 2048-byte 4bpp payload → **4096 palette indices** (existing decode, frozen).
2. **Encode PNG off hot path or in chunks:** 64×64 **indexed color** PNG with **16-color PLTE** from `paletteColors(traits[1])` — typically **~2–4 KB** compressed vs **24–80 KB** SVG text.
3. **`tokenURI` image field:** `data:image/png;base64,{...}` instead of SVG+xml.
4. **Gas model:** O(4096) index read + O(PNG size) Base64 + small fixed PNG header — target **&lt;2M render** + **&lt;3M total `tokenURI`** for worst real, **&lt;8M synthetic** with headroom under 16.7M RPC cap.
5. **Marketplace / OpenSea:** PNG widely supported; verify animation/vector expectations (static 64×64 — acceptable).

### Contract touch surface (Pass B — still renderer-only if PNG built in renderer)

- `ChromaRenderer.tokenURI` / new `renderPNG(bytes pixels, string[16] palette)`.
- Optional **`tokenURI` returns PNG, `renderSVG` retained for parity tooling** (export tests).
- **No changes** to `ChromaStorage` write format or `ChromaPaletteData`.

### Validation plan (Pass B)

1. PNG encoder correctness vs current SVG raster (1011-seed parity).
2. Re-run full gas stress + Sepolia `eth_call` on inscribed dry-run set.
3. Size gate on renderer (PNG encoder may add bytecode — may need library split).

---

## Files changed

| File | Change |
|------|--------|
| `contracts/ChromaRendererSvgLib.sol` | Path-based SVG, exact alloc, run collection |
| `contracts/ChromaRenderer.sol` | Single-pass `tokenURI`, profile hooks |
| `chromies-engine/scripts/parity_harness.py` | Path raster support |
| `test/ChromaRendererGasProfile.t.sol` | Phase profiling (new) |
| `test/Chroma.t.sol` | SVG structure test (paths, not byte-identical rects) |

---

## Commands

```powershell
# Profile seed 410 + synthetic
$env:GAS_STRESS_CSV_PATH='./chromies-engine/generated/gas_stress_parity_410_410.csv'
.\.foundry-bin\forge.exe test --match-contract ChromaRendererGasProfileTest -vv

# Gas stress remeasure (1000 seeds)
py scripts/run_gas_stress.py --skip-csv --skip-batch-csv

# Raster parity (100 seeds)
py chromies-engine\scripts\parity_harness.py --count 100

# Size gate
py scripts\check_contract_size_gate.py
```

---

---

## Pass B.1 — CRC32 + residual optimization

**Generated:** 2026-07-07  
**Scope:** `ChromaRendererCrc32.sol` + `ChromaRendererPngLib.sol` only — PNG bytes, shell, and output format **unchanged**.

### Executive summary

Pass B.1 fixes a catastrophic CRC32 implementation bug and optimizes Adler-32. **Gas targets are now met.** Output bytes are **bit-identical** to Pass B (1022/1022 parity re-confirmed).

| Metric | Pass B | Pass B.1 | Target | Pass? |
|--------|-------:|---------:|-------:|:-----:|
| Worst real `tokenURI` | 17,647,417 (seed 260) | **2,891,411** (seed 680) | ≤ 5,000,000 | **yes** |
| Synthetic ceiling `tokenURI` | 17,617,164 | **2,865,745** | ≤ 10,000,000 | **yes** |
| Worst real `renderImageShell` | 16,711,027 | **2,268,434** | — | 86% reduction |
| 1000-seed spread | 28,703 | **18,021** (~0.6%) | flat | **yes** |
| `ChromaRenderer` runtime | 20,360 B | **19,161 B** | ≤ 22,000 B | **yes** |

**Gate decision:** **CLOSED** — deployed Sepolia `0xE6Ed418e5175cd56b53e1a8af4B8666f66654DE6`; money test 5/5.

---

### CRC32 diagnosis (Pass B root cause)

Pass B used **byte-wise table CRC** (not per-bit), but the lookup was implemented as `_table(index)` dispatching to `_T0`…`_T7`, each of which allocated a fresh **`uint32[32] memory`** array on **every byte**:

| Property | Pass B (broken) | Pass B.1 (fixed) |
|----------|-----------------|------------------|
| Algorithm | Byte-wise reflected CRC32 | Same |
| Table location | Split constants via 8 helper functions | 1024 B as 32 assembly `mstore` literals |
| Per-byte cost | ~8 branches + **32-word memory alloc** ≈ **5,400 gas/byte** | 1 `mload` + XOR/shift ≈ **~100 gas/byte** |
| Measured CRC (PLTE+IDAT) | **~12,070,000** | **~219,000** |
| IHDR / IEND | Runtime CRC | **Precomputed** (`0x571F6681`, `0xAE426082`) |

Confirmed: 12M / 2,200 CRC-input bytes ≈ 5.4k gas/byte — not per-bit, but **per-byte memory-table allocation**.

### Pass B.1 CRC implementation

1. `allocTable()` — bump-alloc 1024 B, `initTable()` via 32 inline `mstore` literals.
2. `crc32ChunkMem(table, type, ptr, len)` — assembly byte loop with table `mload`.
3. **Runtime CRC only for PLTE (52 B) + IDAT (2,127 B)**; IHDR and IEND use compile-time constants.

### Adler-32

Pass B used `addmod` per byte (~226k gas). Pass B.1 uses periodic `mod 65521` every 256 bytes + final mod. Zlib trailer values unchanged (1022/1022 parity).

---

### Residual cost profile (seed 680)

| Phase | Gas | Notes |
|-------|----:|-------|
| Pixel pack (scanlines) | ~1,338,000 | Dominant — 4096 index lookups |
| CRC runtime (PLTE+IDAT) | ~219,000 | Slightly above 200k target |
| Base64 + JSON overhead | ~610,000 | `tokenURI` − `renderImageShell` |
| Adler-32 | ~30–50k | After periodic mod |
| PLTE + zlib framing | ~17,000 | Negligible |

---

### Contract size + EIP-170

| Artifact | Runtime | Notes |
|----------|--------:|-------|
| **ChromaRenderer** | **19,161 B** | Only deployed artifact — passes 22 KB gate |
| ChromaRendererCrc32/PngLib/SvgLib | 24,519 B* | Internal libraries — **never deployed** |

`forge build --sizes` exit 1 flags internal libraries that would exceed EIP-170 **if deployed standalone**. No delegatecall library split was needed.

---

### Gates (Pass B.1)

| Check | Result |
|-------|--------|
| 1022/1022 parity | **PASS** |
| Worst real ≤ 5M | **PASS** (2.89M) |
| Synthetic ≤ 10M | **PASS** (2.87M) |
| Size gate | **PASS** |
| CI gas regression | **PASS** (seed 680) |
| Sepolia redeploy | **DONE** — renderer-only; inscribed tokens 1–5 `tokenURI` **5/5 PASS** (~3.0M gas vs prior RPC OOG at 16.7M) |

---

## Recommendation (final)

1. **Pass B.1 Sepolia cutover complete** — gas targets met, parity intact, money test green.
2. **Mainnet:** apply same renderer-only deploy runbook (wiring + artifacts + gas regression on inscribed/rich tokens) before metadata goes live.
3. **Keep `renderSVG`** for API image routes (`/chroma/:id/image.svg`, `/image.png`) — re-tested on new deployment (token 1 returns valid SVG, ~14.9M gas under Alchemy cap).

---
