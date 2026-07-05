# Chromies Session Handoff

Last updated: 2026-07-05

## Pipeline — FROZEN

Do **not** regenerate mint/reveal merkle or change trait generation until legendary-finals gate clears.

**Locked systems (do not change without explicit unlock):**

- `art-pipeline/generate.js` — dedupe guard, combo cap (60), anti-None-stacking, Female hood/hair weights
- `art-pipeline/chromies-config.js` — trait weights, palette tables, legendary token map
- `art-pipeline/legendary-finals.js` + `legendary-token-ids.js` — injection path only (no placeholder PNGs in repo)
- `art-pipeline/snapshot-holders.js` + `generate-merkle.js` — Tier 2 = Brain Rots ∪ Akutars
- Trait bytes **15/16 retired** (unused); bytes **17/18** = Total Pixels (unchanged)
- Mutation / pixel-mutation system removed from pipeline and contracts

**Legendary-finals gate (blocking regen):**

| Slot | Token | Status |
|------|-------|--------|
| DOPEMIND | #2222 | Palette wired (`NORMIE_DOPEMIND.gpl`); **PNG pending** |
| UPCOMING2 | #3792 | Concept pending |
| Other 7 finals | various | **9/9 PNGs missing** — `verify-legendary-finals.js --check-missing` hard-fails |

Run gate check:

```powershell
cd X:\Cursor\Homies\art-pipeline
node verify-legendary-finals.js --check-missing
```

---

## Contract batch (this run — local, not yet redeployed Sepolia)

### Economics (locked)

| Phase | Price | Per-wallet cap | Phase supply cap |
|-------|-------|----------------|------------------|
| Tier 1 allowlist | 0.0025 ETH | 5 | 2,500 |
| Tier 2 allowlist | 0.0035 ETH | 5 | 1,000 |
| Public | 0.0045 ETH | 5 | — |

- **Total supply:** 5,150
- **Team reserve:** 200 (owner `mint()` only, tokens 4,951–5,150)
- **Community mint cap:** 4,950 (= 5,150 − 200)

### Rollover

No explicit phase handoff function. Unsold Tier 1/2 supply rolls into Public implicitly:

- Allowlist phases enforce `mintedAllowlistOne/Two` caps (2,500 / 1,000).
- Public mints only check per-wallet cap + community cap (`totalSupply + 1 ≤ 4,950`).
- Unsold allowlist allocation remains mintable in Public until community cap is hit.

### Mutation removal

Deleted from contracts: `revealTokenData`, `updateTrait`, `setTraitUpdater`, `shiftMutationTier`, renderer mutation pixel swap, Mutation/Drift JSON attributes. Stored pixels render verbatim.

**Tests:** `forge test -vv` → **80 passed** (was ~79 prior session).

---

## Sepolia (live — pre-batch deploy)

| Contract | Address |
|----------|---------|
| ChromaStorage | `0x78ee267c09be83eee64050e21ecc2ffe8296ae38` |
| Chroma | `0xba4c3797a18958877f895b69ca4a67b914949f5d` |
| ChromaCanvasV2 | `0x684b85535eDFA1C14a16987c6Da20FEf63378c9a` |
| ChromaRenderer | `0xa43f589f399654037fCEB7644707d2566c5b424b` |
| PixelMarketplace | `0x5aa3f3836013fb2c3d7261d885f78a8bdc42123d` |

**Merkle roots (unchanged on-chain):**

- Tier 1: `0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39`
- Tier 2: `0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac` (Brain Rots only — **August snapshot** will regen with Akutars)
- Reveal: `0x3b2d5fa07025cadfea3aea5cd5c1fe160a33ca586f14e2e7de6881b87de1c74d`

---

## Akutar → Tier 2 wiring

- Akutars contract: `0xaaD35C2DadbE77f97301617D82e661776c891Fa9`
- `snapshot-holders.js` merges Brain Rots ∪ Akutars → `tier2-holders.json`
- Dry-run (no merkle regen yet): Akutars **4,787**, overlap **21**, merged Tier 2 **6,946**, Normies∩T2 **371**
- **August snapshot pass:** rerun snapshot + `generate-merkle.js`, deploy new Tier 2 root to Sepolia/mainnet

---

## Site / frontend (this run)

- **Copy scrub:** Landing flow (Mint → Reveal → Burn → Earn AP → Customize → Inscribe), FAQ AP/burn/inscribe framing, no Mutation Tier / Pristine / purification language
- **Mint page:** reads prices + caps from chain; `chroma-contract.js` fallbacks: 0.0025 / 0.0035 / 0.0045 ETH, max **5** all phases
- **Token metadata:** `public/tokens/*.json` — no Mutation/Drift attributes
- **Untouched:** `PixelChroma.jsx`, Normie-mirror art tools, `.sol` mirror files

---

## Parked decisions

1. **Burn-into-locked** — whether burns can target already-inscribed tokens (not implemented)
2. **15% community allocation** — economics TBD; team reserve (200) is the only reserved slice today

---

## Regen → deploy runbook

Execute only after legendary-finals gate passes (9 PNGs + DOPEMIND palette verified + #3792 concept).

```powershell
cd X:\Cursor\Homies\art-pipeline

# 1. Verify legendary gate
node verify-legendary-finals.js --check-missing

# 2. Trait frequency sanity
node trait-frequency-dry-run.js

# 3. Generate collection + bridge mint data
node generate.js --count 5150 --start 1
node bridge-mint-data.js --count 5150 --start 1
node generate-reveal-merkle.js

# 4. August only — refresh allowlists
node snapshot-holders.js
node generate-merkle.js

# 5. Foundry
cd X:\Cursor\Homies
$env:PRIVATE_KEY = (Get-Content .env | Select-String "PRIVATE_KEY").ToString().Split("=",2)[1]
$env:SEPOLIA_RPC_URL = (Get-Content .env | Select-String "SEPOLIA_RPC_URL").ToString().Split("=",2)[1]
C:\Foundry\foundry_nightly_win32_amd64\forge.exe test -vv
C:\Foundry\foundry_nightly_win32_amd64\forge.exe script script/RedeployChroma.s.sol --rpc-url $env:SEPOLIA_RPC_URL --broadcast

# 6. Update src/lib/chroma-contract.js addresses + abis/Chroma.ts from new deploy
# 7. Upload metadata/images; set revealedBaseURI on Chroma
# 8. Smoke: mint → reveal → inscribe on Sepolia
```

---

## Key files

| Path | Role |
|------|------|
| `contracts/Chroma.sol` | Mint phases, rollover caps, reveal/inscribe |
| `contracts/ChromaCanvasV2.sol` | Per-token AP, burn, canvas |
| `contracts/ChromaRenderer.sol` | On-chain SVG + JSON (no Mutation) |
| `art-pipeline/chromies-config.js` | Weights, palettes, legendary map |
| `art-pipeline/snapshot-holders.js` | Tier 2 holder merge |
| `src/lib/chroma-contract.js` | Frontend addresses + mint constants |
| `CHECKLIST.md` | Launch checklist |

## Foundry

`C:\Foundry\foundry_nightly_win32_amd64\forge.exe`
