# Robinhood label-fix renderer deploy

**Date:** 2026-07-14  
**Chain:** Robinhood Chain mainnet (chain ID 4663)  
**Status:** Deployed + bytecode verified. **`setRenderer()` not called** — live tokenURI still served by old renderer until JB confirms Step 4.

---

## What changed

Metadata-only correction in `ChromaRenderer` / `ChromaRendererRobinhood`:

- Removed 13 stale hardcoded `_xxxLabel()` ladders from `contracts/ChromaRenderer.sol`
- Replaced with registry-compiled `contracts/generated/ChromaTraitLabels.sol` (via `scripts/compile_palette_registry.py` → `trait_byte_registry.py`)
- **traitsHex / pixelsHex / PNG rendering unchanged** — label strings in `tokenURI` JSON only

### Deploy-time size fix (required)

Initial label-fix build inlined `ChromaTraitLabels` (`internal` functions) → renderer runtime **29,623 bytes** (over EIP-170 24,576 limit). Deploy blocked.

**Fix applied:** `ChromaTraitLabels` functions emitted as `external`; library deployed separately and linked at deploy:

| Artifact | Runtime size |
|----------|----------------|
| `ChromaTraitLabels` (library) | 11,613 bytes |
| `ChromaRendererRobinhood` (linked) | 18,340 bytes |

Label semantics unchanged; library is called via `DELEGATECALL` instead of inlined if-chains.

### ChromaTraitLabels linking model (deployed renderer)

**Statically linked at compile/deploy time — not a stored or mutable address.**

- `ChromaTraitLabels` is a Solidity **`library`** with **`external`** functions (not `internal` inlined).
- `ChromaRenderer` / `ChromaRendererRobinhood` call `ChromaTraitLabels.<slot>Label(...)` with **no** `address` field, storage slot, setter, or `immutable` variable holding the library location.
- At deploy, Foundry resolves the library link and **embeds** `0x93f1e6358a2f78d7a024e6e3e7c2e3997bd9caa6` directly in the renderer runtime bytecode (verified: on-chain `eth_getCode` contains that address; broadcast `libraries` entry matches).
- Each label lookup executes as an **`external library call`** → `DELEGATECALL` to that **fixed, bytecode-baked** address for the lifetime of this renderer instance.
- **Cannot** repoint an already-deployed renderer to a different `ChromaTraitLabels` without redeploying a new renderer (and re-linking). This is distinct from `chromaStorage` / `paletteData`, which are constructor `immutable`s patched into bytecode separately.

---

## Deployed addresses

| Contract | Address |
|----------|---------|
| **ChromaRendererRobinhood (NEW)** | `0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364` |
| **ChromaTraitLabels (NEW library)** | `0x93f1e6358a2f78d7a024e6e3e7c2e3997bd9caa6` |
| ChromiesCommemorative (unchanged) | `0x3C8C9615889762bDcF9647a3C86C74aFA498a158` |
| ChromaPaletteData (unchanged) | `0xb3ad67d60C44E6db461f8957AF7a2f664c01275a` |
| Previous renderer (still live) | `0x9C34Bd0c872983e33611f0cF1cF3C1C968516736` |

### Deploy transaction

| Field | Value |
|-------|-------|
| Renderer deploy tx | `0x450285670dbdfc134b4a81f2f7176bb40117912a3f017a71a5bafaf8596a50b5` |
| Block number | `10111139` (`0x9a43a3`) |
| Deployer / owner | `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` |

Full JSON: [`deploy-result.json`](./deploy-result.json)

---

## Pre-deploy verification (local)

| Check | Result |
|-------|--------|
| 100-token label parity | **PASS** — [`parity-report.json`](../label-parity-100/parity-report.json) (0 divergences) |
| `ChromaTraitLabels.t.sol` | 5/5 PASS (pre-deploy session) |
| `test/robinhood/*` | 23/23 PASS (pre-deploy session) |
| traitsHex / pixelsHex | Unchanged for all 100 tokens (parity report) |
| PNG vs mainnet baseline | Byte-identical for all 100 (parity report) |

**Git tree:** NOT clean at deploy — label-fix artifacts uncommitted on `f289ec0`. See [`step1-sanity.md`](./step1-sanity.md).

---

## Bytecode verification (Step 3)

**OVERALL: PASS** — [`bytecode-verify.txt`](./bytecode-verify.txt)

- `ChromaTraitLabels` on-chain runtime: byte-identical to local build
- `ChromaRendererRobinhood` on-chain runtime: matches local linked build with immutable slots patched (`chromaStorage`, `paletteData`); CBOR metadata suffix excluded from compare (hash-only diff at tail)

---

## Step 4 — setRenderer() [PARKED]

**Not executed.** See [`step4-await-setrenderer.md`](./step4-await-setrenderer.md).

Irreversible live-facing call:

```
ChromiesCommemorative.setRenderer(0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364)
```

---

## Step 5 — Post-deploy readback [PENDING setRenderer]

After JB confirms `setRenderer()`, run live `tokenURI(n)` readback for ~10–15 tokens across fallback-bucket coverage and diff against [`reports/robinhood/label-parity-100/uri-{n}.txt`](../label-parity-100/). Token #1 PNG must remain byte-identical to pre-deploy mainnet baseline.

Output target: `post-deploy-readback.md` (not yet created).

---

## Marketplace / indexer note

Existing minted tokens will show corrected labels only after:

1. `setRenderer()` points commemorative at the new renderer, **and**
2. Marketplaces refresh metadata (e.g. OpenSea “Refresh metadata”)

New mints after cutover get correct labels immediately.

---

## Out of scope (PARKED)

Mask / head_shape / hat / accessory label emission — not part of this fix; documented in label audit as deferred.

---

## Authoritative regen

```bash
py -3 scripts/compile_palette_registry.py   # emits ChromaTraitLabels.sol + palette artifacts
forge build
```

Do **not** run `trait_byte_registry.py` directly for production regen.
