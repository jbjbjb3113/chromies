# Sepolia Deploy Log

**Status:** Sepolia dress rehearsal complete (Tasks 0–5)  
**Date:** 2026-07-06  
**Chain:** Sepolia (11155111)  
**Git commit:** `87019af84c2c750d740f2e728fd13916c0b88f1b` (dirty working tree — palette split uncommitted)  
**Deployer:** `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a`  
**Script:** `script/RedeployChroma.s.sol`  
**Broadcast:** `broadcast/RedeployChroma.s.sol/11155111/run-latest.json`

## Preflight (Task 0)

| Field | Value |
|-------|-------|
| Deployer | `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` |
| Balance (pre-deploy) | 0.522643 ETH |
| Chain ID | 11155111 ✓ |
| RPC alias | `sepolia` |

## Deployed contracts

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| ChromaStorage | `0x557933b09005C6254d3884A1F93a03e740920A42` | `0x4ba4dbfc9f1077bf0956578e10dd0621e4b8309dd68d7d5f691e6d7e22cd2754` |
| Chroma | `0x8162114c056DfC49045c04C66f1E03b761d81eD5` | `0x63f47c0f3253ec2b0a85b4aa54801b872f9637fbae5817f3517356cafc4a4cab` |
| ChromaCanvasV2 | `0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB` | `0x9f402c4b7ace32b4f685ea0ddc18b3072b7a09f251fed5378811c9d3181091e5` |
| PixelMarketplace | `0x8D0b8327bcC96eF62b3de94687490298a52D3079` | `0xdd65340e09ff5bf6701dedb0a9c56c128a5edd4f634d8269cc02b9d5146313c0` |
| **ChromaPaletteData** | `0x4Ff9Ef71A403579DdfCaC5294792306ebD38F0a7` | `0x079541a9c243e570fb09bba01c9b70013f560e4a470579ecbb052a5b32870cbd` |
| **ChromaRenderer** | `0xA86f6fa692Ca016F885F82757D2382d8696bFE6d` | `0x71e6973a2142844eb92c8bd43b711f400148464c4eaca49a9f7de625f0cbd618` |

## Wiring txs

| Action | Tx |
|--------|-----|
| storage.setWriter(chroma) | `0x46baaad88fbd7e82079d656d60a62391fa06b6f18af441066e576f9bd5839e19` |
| canvas.setOperatorApproval(marketplace) | `0x0305acde1965c4f958d657c602a2f211aec658ce603b1ef015e483800921be2f` |
| renderer.setCanvas | `0x2e4bfe7440a60205f1ff0bd3dcb44b8337b9d24ccce6ed11231881c56ebf32f1` |
| renderer.setChroma | `0x5545a02abdf02e7d23b18bd6bc4c031017f57e1ceff33de18db23fa8c91e6ded` |
| chroma.setRenderer | *(see broadcast JSON)* |
| chroma.setCanvas | *(see broadcast JSON)* |
| chroma.setMerkleRootOne/Two/setRevealRoot | *(see broadcast JSON)* |

## Merkle roots (on-chain)

| Root | Value |
|------|-------|
| Tier 1 | `0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39` |
| Tier 2 | `0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac` |
| Reveal | `0x3b2d5fa07025cadfea3aea5cd5c1fe160a33ca586f14e2e7de6881b87de1c74d` |

## Superseded Sepolia addresses (casualties)

| Contract | Old address |
|----------|-------------|
| ChromaStorage | `0x78ee267c09be83eee64050e21ecc2ffe8296ae38` |
| Chroma | `0xba4c3797a18958877f895b69ca4a67b914949f5d` |
| ChromaCanvasV2 | `0x684b85535eDFA1C14a16987c6Da20FEf63378c9a` |
| ChromaRenderer | `0xa43f589f399654037fCEB7644707d2566c5b424b` |
| PixelMarketplace | `0x5aa3f3836013fb2c3d7261d885f78a8bdc42123d` |

---

## Task 2 — Etherscan verification

All six contracts verified on Sepolia (2026-07-06):

| Contract | Etherscan |
|----------|-----------|
| ChromaStorage | [verified](https://sepolia.etherscan.io/address/0x557933b09005c6254d3884a1f93a03e740920a42) |
| Chroma | [verified](https://sepolia.etherscan.io/address/0x8162114c056dfc49045c04c66f1e03b761d81ed5) |
| ChromaCanvasV2 | [verified](https://sepolia.etherscan.io/address/0xa2e15df33b21ddb62190b2cd8c08e63350608dfb) |
| PixelMarketplace | [verified](https://sepolia.etherscan.io/address/0x8d0b8327bcc96ef62b3de94687490298a52d3079) |
| ChromaPaletteData | [verified](https://sepolia.etherscan.io/address/0x4ff9ef71a403579ddfcac5294792306ebd38f0a7) |
| ChromaRenderer | [verified](https://sepolia.etherscan.io/address/0xa86f6fa692ca016f885f82757d2382d8696bfe6d) |

Wiring script: `scripts/verify_sepolia_wiring.py` — **all assertions PASS**.

## Task 3 — Renderer parity (verification by construction)

**Resolution:** No redeploy, no transactional sampling, no reveal-root change.

Deployed rendering is **deterministic bytecode over data**. Task 3 closes by proving both inputs on the live Sepolia stack:

| Proof | Method | Result |
|-------|--------|--------|
| **A — logic** | `eth_getCode` vs local `forge` artifact | **PASS** — `ChromaRenderer` + `ChromaPaletteData` runtime bytecode match after CBOR strip; renderer immutable slots (`chromaStorage`, `paletteData`) masked at compiler-reported offsets |
| **B — data** | `paletteColors(uint8)` read-back × 80 palettes | **PASS** — **1280/1280** slots exact vs `palette_colors_expanded.json` |

**Coverage IDs explicitly verified (not sampled):** 24 (CAT), 27 (GOLD), 28–36 (normie / wraparound-fix range).

**Script:** `scripts/verify_deployed_artifacts.py`  
**Report:** `chromies-engine/generated/verify_deployed_artifacts.json`  
**Run:** 2026-07-07 — all checks PASS at git `87019af`

### Prior ABI probe (context)

Initial probe (`scripts/sepolia_parity_sample.py`) confirmed the deployed renderer exposes only `renderSVG(uint256)` (storage-backed). Read-only payload rendering is unavailable on-chain — but parity does not require it when logic + data + end-to-end path are proven separately.

### Proof chain (complete)

| Layer | Evidence |
|-------|----------|
| Renderer logic | Bytecode match (Proof A) |
| Palette table | 1280/1280 slot read-back (Proof B) |
| Wiring | `verify_sepolia_wiring.py` — immutables point at deployed storage/paletteData |
| Rendering output | Local **1011-seed** harness (`parity_harness.py`) — authoritative off-chain renderer proof |
| Live end-to-end | Task 4 — 5/5 tokenURI pixel-identical (includes shirt-palette class) |

**No transactions. Reveal merkle root unchanged.**

## Task 4 — Mint pipeline dry run (DRY RUN)

**DRY RUN mint pipeline** — 2026-07-07T01:03:14.760399+00:00
Chroma: `0x8162114c056DfC49045c04C66f1E03b761d81eD5`
Tokens: 1–5
Production reveal root restored: `0x3b2d5fa07025cadfea3aea5cd5c1fe160a33ca586f14e2e7de6881b87de1c74d` ✓

| seed | token_id | category | diff_pixels | ok |
|-----:|---------:|----------|------------:|:---:|
| 1 | 1 | shirt_palette | 0 | yes |
| 6 | 2 | side_profile | 0 | yes |
| 42 | 3 | plain | 0 | yes |
| 100 | 4 | plain | 0 | yes |
| 256 | 5 | plain | 0 | yes |

**Result: 5/5 tokenURI pixel-identical to preview**

## Task 5 — Frontend/env cutover

| File | Updated |
|------|---------|
| `.env` | Six new Sepolia addresses + `CHROMA_PALETTE_DATA_ADDRESS` |
| `.env.example` | Added `CHROMA_PALETTE_DATA_ADDRESS` placeholder |
| `src/lib/chroma-contract.js` | All six Sepolia addresses + `getChromaPaletteDataAddress()` |
| `scripts/*.ts` / `scripts/*.mjs` | Hardcoded Sepolia refs updated to new stack |

**Grep audit:** Old addresses remain only in `SEPOLIA_DEPLOY_LOG.md` (casualties table) and `SEPOLIA_DEPLOY_SCOPE.md` (pre-deploy inventory). Load-bearing code, `.env`, and `src/lib/chroma-contract.js` use the new stack.

---

## Renderer-only redeploy (Pass B.1 gas fix)

**Date:** 2026-07-07  
**Chain:** Sepolia (11155111)  
**Script:** `script/RedeployRendererOnly.s.sol`  
**Broadcast:** `broadcast/RedeployRendererOnly.s.sol/11155111/run-latest.json`  
**Scope:** `ChromaRenderer` only — `ChromaPaletteData`, `ChromaStorage`, `Chroma`, `ChromaCanvasV2`, `PixelMarketplace` **unchanged**. Reveal merkle root **unchanged**.

### New deployment

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| **ChromaRenderer** (Pass B.1) | `0xE6Ed418e5175cd56b53e1a8af4B8666f66654DE6` | `0x11019243ee14ed74e4178c95bfc4e4df1df842884c8e407660d21d82039394a9` |

### Wiring txs

| Action | Tx |
|--------|-----|
| renderer.setCanvas | `0x16f4b2cd3809ea3c02fcb303cd84fabd9227017bcc46a8a92aeca5da8a6203a3` |
| renderer.setChroma | `0x503594e12a4f96ddc2f22bb1fed97c6fb50ec8a6ca7bcbf64a7ff40cbcd738d3` |
| chroma.setRenderer | `0x6209b040f190b4d3c291bce91cbdce30b1a8631463a115cc4df809f6e1cc26b2` |

### Superseded renderer

| Contract | Old address |
|----------|-------------|
| ChromaRenderer (Pass A rect / pre-B.1) | `0xA86f6fa692Ca016F885F82757D2382d8696bFE6d` |

### Etherscan

| Contract | Status |
|----------|--------|
| ChromaRenderer | [verified](https://sepolia.etherscan.io/address/0xe6ed418e5175cd56b53e1a8af4b8666f66654de6) |

### Post-deploy verification (runbook order)

| Step | Tool | Result |
|------|------|--------|
| Wiring | `scripts/verify_sepolia_wiring.py` | **PASS** — immutables → existing paletteData/storage; `Chroma.renderer` → new address |
| Artifacts | `scripts/verify_deployed_artifacts.py` | **PASS** — renderer bytecode vs HEAD artifact (masked immutables/CBOR); palette Proof B unchanged (1280/1280) |
| Money test | `scripts/sepolia_tokenuri_money_test.py` | **PASS** — inscribed tokens 1–5 `eth_call tokenURI` via Alchemy |

### `tokenURI` gas — before vs after (inscribed tokens 1–5, Alchemy RPC)

| token_id | seed | Old renderer (Alchemy) | New renderer (`estimateGas`) | Parity |
|---------:|-----:|----------------------|-----------------------------:|:------:|
| 1 | 1 | OOG — exceeds 16,777,216 | **3,024,364** | 0 diff |
| 2 | 6 | OOG — exceeds 16,777,216 | **3,022,548** | 0 diff |
| 3 | 42 | OOG — exceeds 16,777,216 | **3,024,351** | 0 diff |
| 4 | 100 | OOG — exceeds 16,777,216 | **3,021,477** | 0 diff |
| 5 | 256 | OOG — gas exhausted (memory expansion) | **3,024,696** | 0 diff |

**Result: 5/5 tokenURI return + pixel-identical to pre-mint previews**  
Report: `chromies-engine/generated/sepolia_tokenuri_money_test.json`

### `renderSVG` API path (secondary)

`api/server.ts` resolves renderer via `Chroma.renderer()` (no hardcoded address). Smoke-tested on new deployment: `renderSVG(1)` returns valid SVG (12,920 bytes; ~14.9M gas — under Alchemy cap).

### Config cutover

| File | Updated |
|------|---------|
| `.env` | `CHROMA_RENDERER_ADDRESS` → `0xE6Ed…4DE6` |
| `src/lib/chroma-contract.js` | Sepolia renderer address |
| `scripts/verify_*.py`, `sepolia_*`, `run_gas_stress.py` | Default renderer address |

**Renderer pointer audit:** Only `Chroma.sol` holds `renderer`; Canvas and Marketplace have no renderer reference.

**Mainnet:** untouched.

---

## Renderer-only redeploy (universal background ruling)

**Date:** 2026-07-08  
**Chain:** Sepolia (11155111)  
**Script:** `script/RedeployRendererOnly.s.sol`  
**Scope:** `ChromaRenderer` only — universal PLTE slot 0 / SVG background `#e3e5e4` (payload index-0 semantics unchanged). `ChromaPaletteData`, `ChromaStorage`, `Chroma`, `ChromaCanvasV2`, `PixelMarketplace` **unchanged**. Reveal merkle root **unchanged**. Mint data **untouched**. Mainnet **untouched**.  
**Git commit (broadcast tree):** `f3eae41c936f2bd394769729b8d3caa26a47630b` (renderer bytecode includes uncommitted background-ruling working-tree changes compiled at deploy time)

### New deployment

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| **ChromaRenderer** (background ruling) | `0x7680D210ed242330877b31D9749a92307484Aae1` | `0x09af27fb94da4ee4184e67e2f335b1666e651b604493b079c4b5b722222ee885` |

### Wiring txs

| Action | Tx |
|--------|-----|
| renderer.setCanvas | `0xf603830ce0fec308f982752d40f5085aaf98b21e9360c5ee1889d68089a86a0a` |
| renderer.setChroma | `0x3c85b43b9d25febcc92ff0b5bd3d8b1820800fc704dca84bfba8e68a9d723f28` |
| chroma.setRenderer | `0x4ae28e2aaadf89b2fbaa5cf7dd59c4476bcbff585eca04790f5937dd64b37008` |

### Superseded renderers

| Contract | Old address |
|----------|-------------|
| ChromaRenderer (Pass B.1 gas fix) | `0xE6Ed418e5175cd56b53e1a8af4B8666f66654DE6` |
| ChromaRenderer (intermediate cutover) | `0x6753e8af307E463318428bdC5F53Ad0C8f18c17d` |

### Etherscan

| Contract | Status |
|----------|--------|
| ChromaRenderer | [verified](https://sepolia.etherscan.io/address/0x7680d210ed242330877b31d9749a92307484aae1) |

### Post-deploy verification (runbook order)

| Step | Tool | Result |
|------|------|--------|
| Renderer pointer | `grep setRenderer` / `renderer` in `contracts/` | **PASS** — only `Chroma.sol` holds `renderer`; Canvas/Marketplace have no renderer ref |
| Wiring | `scripts/verify_sepolia_wiring.py` | **PASS** — immutables → existing paletteData/storage; `Chroma.renderer` → `0x7680…Aae1` |
| Artifacts | `scripts/verify_deployed_artifacts.py` | **PASS-WITH-WAIVER** — `ChromaRenderer` bytecode vs HEAD (masked immutables/CBOR). Proof B drift on palette IDs 28/29/32/33/34 waived per [`KNOWN_DRIFT.md`](./KNOWN_DRIFT.md) (artist legendary repopulation; `ChromaPaletteData` redeploy deferred) |
| Money test | `scripts/sepolia_tokenuri_money_test.py` | **PASS** — inscribed tokens 1–5 `eth_call tokenURI` via Alchemy |

### `tokenURI` gas — Pass B.1 vs background ruling (inscribed tokens 1–5, Alchemy `estimateGas`)

| token_id | seed | Pass B.1 (`0xE6Ed…4DE6`) | Background ruling (`0x7680…Aae1`) | Parity |
|---------:|-----:|-------------------------:|------------------------------------:|:------:|
| 1 | 1 | 3,024,364 | **3,025,790** | 0 diff |
| 2 | 6 | 3,022,548 | **3,023,974** | 0 diff |
| 3 | 42 | 3,024,351 | **3,025,777** | 0 diff |
| 4 | 100 | 3,021,477 | **3,022,902** | 0 diff |
| 5 | 256 | 3,024,696 | **3,026,122** | 0 diff |

**Result: 5/5 tokenURI return without OOG + pixel-identical to NEW fixtures (`#e3e5e4` background visible)**  
Report: `chromies-engine/generated/sepolia_tokenuri_money_test.json`

### `renderSVG` API path (secondary)

`api/server.ts` resolves renderer via `Chroma.renderer()` (no hardcoded address). Smoke-tested token 1 on new deployment:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/chroma/1/image.svg` | 200 | 12,870 bytes; `#e3e5e4` background present |
| `/chroma/1/image.png` | 200 | 36,078 bytes PNG rasterized via sharp |

### Config cutover

| File | Updated |
|------|---------|
| `.env` | `CHROMA_RENDERER_ADDRESS` → `0x7680…Aae1` |
| `src/lib/chroma-contract.js` | Sepolia renderer address |
| `scripts/verify_*.py`, `sepolia_*`, `run_gas_stress.py`, `test-level-burn.ts`, `verify-canvas-deploy.ts` | Default renderer address |

**Grep audit:** Superseded renderer addresses (`0xE6Ed418e…`, `0x6753e8af…`) survive only in this log (casualties tables) and historical reports (`RENDERER_GAS_OPTIMIZATION.md`, `PALETTE_CONTRACT_INTEGRATION.md`). Load-bearing code uses `0x7680…Aae1`.

### `render_bundle` vs `renderImageShell` / `tokenURI` (seed 680 profile)

`gas_render_bundle` in `ChromaRendererGasProfile.t.sol` measures the full `profileRenderParts()` diagnostic hook — not a production entrypoint. That function loads PNG context, runs `profilePhases()` (which builds filtered image data, PLTE, Adler32, zlib IDAT, CRC table work, **and** calls `buildPng()` inside the phase profiler), then calls `buildPng()` and `buildImageShellSvg()` **again**. The ~6.06M figure is therefore ~2–3× a single `renderImageShell()` pass plus CRC-table allocation and per-phase gas accounting overhead. CI gas regression gates use `_measureRenderGas()` = `renderImageShell()` only (~2.27M ceiling) and `_measureTokenURIGas()` = `tokenURI()` (~2.89M ceiling + margin). **Not a deployed-path regression:** forcing `paletteRgb[0] = UNIVERSAL_BACKGROUND_RGB` is a constant write and cannot explain a 3× jump in an instrumented multi-build path. **Gating metric `tokenURI` ~2.915M (forge) / ~3.02M (Alchemy estimate) is green.**

**Mainnet:** untouched.