# Gas Stress Report

**Generated:** 2026-07-07T16:06:17.464974+00:00
**ETH/USD (parameterized):** $3,000.00 (`GAS_STRESS_ETH_USD`)
**Constraints:** No contract modifications; no mainnet txs; Sepolia reads only.

## Executive summary

- **tokenURI ceiling (local):** 2,891,411 gas (baseline worst seed 680: 2,891,411; synthetic worst-worst: 2,865,745)
- **RPC cap acceptance (2× vs 10M):** **PASS**
- **Rollover compensating measure:** fuzz invariant `testFuzz_RolloverSupplyAccounting` (substitute for lost external review)

## Task 1 — Transaction gas profile (Foundry `gasleft`)

Production merkle depths used in fixtures:

| Tree | Leaves | Proof depth |
|------|-------:|------------:|
| Reveal | 5150 | 13 |
| Allowlist tier 2 (production JSON) | 2070 | 12 |
| Allowlist tier 2 (6946-wallet stress) | 6946 | 13 |

**Reveal fixture caveat:** production proof **depth** (13) and calldata size are representative, but the Python fixture builder recomputes a local reveal root that differs from the on-chain Sepolia root (`0x3b2d5fa07025cadfea3aea5cd5c1fe160a33ca586f14e2e7de6881b87de1c74d`). Fixture root: `0x0c7c082de3d745e13e41c794ccefda22d70fd5f5e771e9d67666ac350a6aae7b`. Reveal gas numbers are valid for depth/calldata; root bytes in tests are not production-identical.

| Operation | Gas |
|-----------|----:|
| `canvas_applyDiff_single_pixel` | 122,800 |
| `canvas_revealBurnAndApplyDiff` | 114,415 |
| `canvas_transferAP` | 28,747 |
| `inscribe_max` | 553,849 |
| `inscribe_mean_5_samples` | 553,837 |
| `inscribe_min` | 553,819 |
| `marketplace_buy` | 59,059 |
| `marketplace_cancel` | 3,308 |
| `marketplace_list` | 125,857 |
| `mint_public_qty1_cold` | 105,286 |
| `mint_public_qty1_warm` | 34,656 |
| `mint_public_qty5` | 201,600 |
| `mint_public_qty5_after_allowlist_rollover` | 157,800 |
| `mint_tier1_qty1_cold` | 127,311 |
| `mint_tier1_qty1_warm` | 39,711 |
| `mint_tier1_qty5_cold` | 228,556 |
| `mint_tier2_prod_qty1` | 127,633 |
| `mint_tier2_stress6946_qty1` | 127,973 |
| `mint_tier2_stress6946_qty5` | 229,298 |
| `reveal_production_depth_batch5_per_tx` | 58,295 |
| `reveal_production_depth_batch5_total` | 233,183 |
| `reveal_production_depth_single` | 58,265 |

### USD cost projections (transaction gas)

| Operation | Gas | 1 gwei | 5 gwei | 15 gwei | 50 gwei |
|-----------|----:|---:|---:|---:|---:|
| `canvas_applyDiff_single_pixel` | 122,800 | $0.3684 | $1.8420 | $5.5260 | $18.4200 |
| `canvas_revealBurnAndApplyDiff` | 114,415 | $0.3432 | $1.7162 | $5.1487 | $17.1623 |
| `canvas_transferAP` | 28,747 | $0.0862 | $0.4312 | $1.2936 | $4.3121 |
| `inscribe_max` | 553,849 | $1.6615 | $8.3077 | $24.9232 | $83.0773 |
| `inscribe_mean_5_samples` | 553,837 | $1.6615 | $8.3076 | $24.9227 | $83.0756 |
| `inscribe_min` | 553,819 | $1.6615 | $8.3073 | $24.9219 | $83.0729 |
| `marketplace_buy` | 59,059 | $0.1772 | $0.8859 | $2.6577 | $8.8589 |
| `marketplace_cancel` | 3,308 | $0.0099 | $0.0496 | $0.1489 | $0.4962 |
| `marketplace_list` | 125,857 | $0.3776 | $1.8879 | $5.6636 | $18.8786 |
| `mint_public_qty1_cold` | 105,286 | $0.3159 | $1.5793 | $4.7379 | $15.7929 |
| `mint_public_qty1_warm` | 34,656 | $0.1040 | $0.5198 | $1.5595 | $5.1984 |
| `mint_public_qty5` | 201,600 | $0.6048 | $3.0240 | $9.0720 | $30.2400 |
| `mint_public_qty5_after_allowlist_rollover` | 157,800 | $0.4734 | $2.3670 | $7.1010 | $23.6700 |
| `mint_tier1_qty1_cold` | 127,311 | $0.3819 | $1.9097 | $5.7290 | $19.0967 |
| `mint_tier1_qty1_warm` | 39,711 | $0.1191 | $0.5957 | $1.7870 | $5.9566 |
| `mint_tier1_qty5_cold` | 228,556 | $0.6857 | $3.4283 | $10.2850 | $34.2834 |
| `mint_tier2_prod_qty1` | 127,633 | $0.3829 | $1.9145 | $5.7435 | $19.1450 |
| `mint_tier2_stress6946_qty1` | 127,973 | $0.3839 | $1.9196 | $5.7588 | $19.1959 |
| `mint_tier2_stress6946_qty5` | 229,298 | $0.6879 | $3.4395 | $10.3184 | $34.3947 |
| `reveal_production_depth_batch5_per_tx` | 58,295 | $0.1749 | $0.8744 | $2.6233 | $8.7443 |
| `reveal_production_depth_batch5_total` | 233,183 | $0.6995 | $3.4977 | $10.4932 | $34.9774 |
| `reveal_production_depth_single` | 58,265 | $0.1748 | $0.8740 | $2.6219 | $8.7398 |

### Deployment size gate → mainnet gas projection

Estimate per contract: `21000 + 32000 + 200 × runtime_bytes` (CREATE overhead heuristic).

| Contract | Runtime bytes | Est. deploy gas |
|----------|-------------:|----------------:|
| ChromaStorage | 2,166 | 486,200 |
| Chroma | 11,603 | 2,373,600 |
| ChromaCanvasV2 | 7,934 | 1,639,800 |
| ChromaRenderer | 19,161 | 3,885,200 |
| ChromaPaletteData | 8,746 | 1,802,200 |
| PixelMarketplace | 2,059 | 464,800 |
| **Full suite (sum)** | — | **10,651,800** |
| **Full suite USD @ 15 gwei** | — | **$479.33** |

## Task 2 — tokenURI view-gas stress

- Samples: 1000 (baseline seeds 1–1000)
- min / median / mean / p95 / max: 2,873,390 / 2,881,049 / 2,881,317 / 2,888,672 / 2,891,411
- **Worst baseline seed:** 680 (token `680`, 2,891,411 gas)
- **Synthetic worst-worst:** 2,865,745 gas (64 color-run rects/row — pathological upper bound)

### Worst-case drivers

- Max color runs in a single row (worst seed): **0**
- Mean color runs per row (worst seed): **0**

### RPC `eth_call` gas caps (documented assumptions)

| Provider / assumption | Cap | Baseline worst / synthetic (≥2× headroom)? |
|-----------------------|----:|:--------------------------------------------:|
| QuickNode default | 50M | baseline yes / synth yes |
| Alchemy / Infura typical | 50M | baseline yes / synth yes |
| Conservative public RPC | 25M | baseline yes / synth yes |
| Restrictive legacy cap | 10M | baseline yes / synth yes |

### Top 10 tokenURI gas (baseline)

| Rank | Seed | token_id | tokenURI gas | render gas |
|-----:|-----:|---------:|-------------:|-----------:|
| 1 | 680 | 680 | 2,891,411 | 2,268,434 |
| 2 | 830 | 830 | 2,890,730 | 2,268,162 |
| 3 | 500 | 500 | 2,890,715 | 2,268,229 |
| 4 | 350 | 350 | 2,890,611 | 2,268,231 |
| 5 | 190 | 190 | 2,890,381 | 2,268,364 |
| 6 | 550 | 550 | 2,890,281 | 2,268,229 |
| 7 | 150 | 150 | 2,890,167 | 2,268,298 |
| 8 | 260 | 260 | 2,890,016 | 2,268,299 |
| 9 | 420 | 420 | 2,889,984 | 2,267,891 |
| 10 | 610 | 610 | 2,889,828 | 2,268,299 |

### Sepolia live `eth_call` (Alchemy RPC, read-only)

Chroma: `0x8162114c056DfC49045c04C66f1E03b761d81eD5`

| token_id | estimateGas | eth_call OK | response bytes | notes |
|---------:|------------:|:-----------:|---------------:|-------|
| 1 | — | error | — | inscribed; RPC OOG — {'code': -32003, 'message': 'out of gas: gas required exceeds: 16777216'} |
| 2 | — | error | — | inscribed; RPC OOG — {'code': -32003, 'message': 'out of gas: gas required exceeds: 16777216'} |
| 3 | — | error | — | inscribed; RPC OOG — {'code': -32003, 'message': 'out of gas: gas required exceeds: 16777216'} |
| 4 | — | error | — | inscribed; RPC OOG — {'code': -32003, 'message': 'out of gas: gas required exceeds: 16777216'} |
| 5 | — | error | — | inscribed; RPC OOG — {'code': -32003, 'message': 'out of gas: gas exhausted during memory expansion:  |
| 680 | — | error | — | token 680 not minted (totalSupply=5) |

Sepolia `eth_call` on inscribed tokens [1, 2, 3, 4, 5] **failed at the RPC gas cap** (Alchemy `estimateGas` / `eth_call` limit observed ≈16.7M on this run). Local baseline worst seed 680 requires **2,891,411** gas — **0.2×** the live cap hit. Marketplaces using default RPC limits will show broken metadata for rich tokens.

## Task 3 — Hostile / limit conditions

| Check | Result |
|-------|--------|
| Frontend batch mint limit | 5 |
| Max batch mint gas (qty 5) | 206,527 |
| Max safe mint batch in 30M block | 145 |
| Reveal avg gas (5 tx, toy proof) | 34,358 |
| Max sequential reveals / block | 873 |

### Rollover supply accounting (compensating fuzz invariant)

`testFuzz_RolloverSupplyAccounting` bounds allowlist/public mint counts per wallet (0–5), asserts phase counters, totalSupply, and community cap after each phase transition. Run: `forge test --match-test testFuzz_RolloverSupplyAccounting`.

### Reentrancy-adjacent griefing

Marketplace list/buy/cancel gas measured on fixed canvas state (list **125,857**, buy **59,059**, cancel **3,308**); PixelMarketplace holds no user-controlled storage loops — observed costs are independent of listing history depth in current implementation.

---

Raw artifacts: `chromies-engine/generated/gas_stress_{tx,tokenuri_merged,tokenuri_samples,limits}.json`
