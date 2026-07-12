# Sepolia Deploy Scope Audit

**Date:** 2026-07-06  
**Git commit (workspace):** `87019af84c2c750d740f2e728fd13916c0b88f1b` (+ **uncommitted** palette-split / parity integration — see below)  
**Auditor recommendation:** **Full-suite redeploy** — not an incremental renderer patch.

---

## 1. Current Sepolia deployment (live)

| Contract | Address | Notes |
|----------|---------|--------|
| ChromaStorage | `0x78ee267c09be83eee64050e21ecc2ffe8296ae38` | Pre–palette-split |
| Chroma (NFT) | `0xba4c3797a18958877f895b69ca4a67b914949f5d` | Pre–palette-split economics batch |
| ChromaCanvasV2 | `0x684b85535eDFA1C14a16987c6Da20FEf63378c9a` | Wired to old stack |
| ChromaRenderer | `0xa43f589f399654037fCEB7644707d2566c5b424b` | **Monolithic** inline palettes + `% 26` wraparound |
| PixelMarketplace | `0x5aa3f3836013fb2c3d7261d885f78a8bdc42123d` | Operator on canvas |
| **ChromaPaletteData** | *(none)* | **Not deployed** — split architecture absent |

**Last documented verify commit:** `5525ea8` (*chore: verify sepolia contracts on etherscan*) — verifies pre-batch stack above.

**On-chain merkle roots (current Chroma):**

| Root | Value |
|------|--------|
| Tier 1 allowlist | `0xcceafb12…781c39` |
| Tier 2 allowlist | `0xd582654a…4bb2ac` |
| Reveal | `0x3b2d5fa0…c7d54d` |

**Expected casualties on full redeploy:**

- All test mints / inscriptions on old contracts become historical only
- Allowlist + reveal merkle roots must be re-set on **new** Chroma (same root bytes can be re-applied if mint-data unchanged)
- Frontend `src/lib/chroma-contract.js` addresses must update
- Any AP/canvas state on old canvas is **not** migrated (by design on testnet)

---

## 2. Contract-surface changes since live Sepolia

### A. Committed since `9404326` (mint economics batch — likely closest on-chain baseline)

| Change | Contracts | Sepolia impact if not redeployed |
|--------|-----------|----------------------------------|
| Mint phase pricing (0.0025 / 0.0035 / 0.0045 ETH) | `Chroma.sol` | Old deploy may pre-date or match — verify on-chain |
| Per-wallet cap 5, phase supply caps, community cap 4950 | `Chroma.sol` | Must match for dress rehearsal |
| Rollover accounting (implicit public absorbs unsold allowlist) | `Chroma.sol` | Logic-only |
| **Mutation removal** (revealTokenData, trait mutation, renderer drift) | `Chroma.sol`, `ChromaRenderer.sol` | Old renderer still has mutation-era bytecode if pre-9404326 |
| Reveal / inscribe split (cheap reveal, expensive inscribe+lock) | `Chroma.sol` | Core mainnet path |

### B. Uncommitted / local-only (palette parity phase — **NOT on Sepolia**)

| Change | Contracts / artifacts |
|--------|----------------------|
| **Palette split** | `ChromaPaletteData` (new), `ChromaRenderer` delegates to immutable `paletteData` |
| 80-palette table (IDs 0–79), normie 28–36 fix (no `% 26`) | `ChromaPaletteData` generated from `palette-registry.json` |
| ERROR palette (#FF00FF) for out-of-range tokenURI | `ChromaPaletteData` |
| Byte-stability: IDs 0–27, 37 match legacy deployed; GOLD(27) deployed bytes | Registry + compiler |
| Shirt palettes 38–79 | Registry |
| Local parity harness 1000/1000 + supplemental 11/11 | Python + Foundry export |

**Incremental `RedeployPaletteStack.s.sol` alone is insufficient:** it assumes **existing** storage + Chroma + canvas. Those contracts lack the new renderer constructor wiring from genesis and would leave a **mixed-vintage** stack (old storage writer rules, old canvas, new palette table only on renderer swap).

---

## 3. Recommendation

### Full-suite redeploy (approved scope)

Deploy **everything as it will ship to mainnet** using `script/RedeployChroma.s.sol`:

| Step | Contract | Purpose |
|------|----------|---------|
| 1 | `ChromaStorage` | Fresh SSTORE2 writer graph |
| 2 | `Chroma` | NFT + mint phases + reveal/inscribe |
| 3 | `ChromaCanvasV2` | AP, burn, canvas diffs |
| 4 | `PixelMarketplace` | Canvas operator |
| 5 | **`ChromaPaletteData`** | Ownerless immutable palette table |
| 6 | **`ChromaRenderer`** | `(storage, paletteData, owner)` — immutable palette ref |
| 7 | Wiring | `setWriter`, `setRenderer`, `setCanvas`, merkle roots, marketplace approval |

**Why not renderer-only patch?**

- Live Sepolia has **no** `ChromaPaletteData`; renderer uses inline `% 26` palettes → **564/1000 shirt tokens wrong** vs payload pipeline
- Dress rehearsal against mixed vintage invalidates parity, byte-stability, and migration tests
- Mutation-era / economics-era bytecode may differ from current `Chroma.sol` + `ChromaRenderer.sol` pair

---

## 4. Deploy order (exact)

```
1. ChromaStorage(deployer, writer=0) → setWriter(Chroma) after Chroma deploy
2. Chroma(storage, royaltyReceiver, owner, bps=500)
3. ChromaCanvasV2(chroma, storage, owner)
4. PixelMarketplace()
5. ChromaPaletteData()                    ← no constructor args, no owner
6. ChromaRenderer(storage, paletteData, deployer)
7. renderer.setCanvas(canvas)
8. renderer.setChroma(chroma)
9. chroma.setRenderer(renderer)
10. chroma.setCanvas(canvas)
11. canvas.setOperatorApproval(marketplace, true)
12. chroma.setMerkleRootOne / Two / setRevealRoot
```

Implemented in: **`script/RedeployChroma.s.sol`** (superset of `RedeployPaletteStack.s.sol`).

---

## 5. Post-deploy verification plan

| Task | Tool |
|------|------|
| Etherscan verify all 6 contracts | `forge verify-contract` runbook |
| Wiring assertions | `scripts/verify_sepolia_wiring.py` |
| Bytecode + palette data (Proof A/B) | `scripts/verify_deployed_artifacts.py` |
| Mint pipeline dry run (3–5 tokens, DRY RUN) | `scripts/sepolia_mint_dry_run.py` |

### Renderer-only redeploy (palette stack frozen)

| Task | Tool |
|------|------|
| Etherscan verify `ChromaRenderer` | `forge verify-contract` |
| Wiring + `Chroma.setRenderer` | `scripts/verify_sepolia_wiring.py` |
| Renderer bytecode (Proof A) | `scripts/verify_deployed_artifacts.py` |
| **`tokenURI` gas regression** (inscribed/rich tokens, Alchemy RPC) | `scripts/sepolia_tokenuri_money_test.py` |
| `renderSVG` API smoke | `api/server.ts` image routes (via `Chroma.renderer()`) |

Script: `script/RedeployRendererOnly.s.sol` — does **not** touch palette data, storage, Chroma, canvas, or marketplace.

---

## 6. Preflight checklist (required before broadcast)

**Executed:** 2026-07-06

| Field | Value |
|-------|-------|
| Deployer | `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` |
| Sepolia ETH balance | **0.522643 ETH** |
| Chain ID | **11155111** (Sepolia) ✓ |
| RPC alias | `sepolia` → `SEPOLIA_RPC_URL` |
| Git commit | `87019af84c2c750d740f2e728fd13916c0b88f1b` |
| Working tree | **dirty** (uncommitted palette-split artifacts) |

Run: `python scripts/sepolia_preflight.py`

**Sepolia chain ID confirmed before broadcast.**

---

## 7. Mainnet

**Untouched.** This scope is Sepolia dress rehearsal only.
