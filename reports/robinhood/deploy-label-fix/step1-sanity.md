# Step 1 — Pre-deploy sanity

**Date:** 2026-07-14  
**Scope:** ChromaRendererRobinhood label-fix redeploy (Robinhood Chain 4663)

## 1. Working tree cleanliness

**STATUS: NOT CLEAN**

HEAD at time of parity PASS build artifacts:

```
f289ec0 JB ruling: fast is default reverse_mode for expression transitions
```

The label-fix source and verification artifacts are **uncommitted** on top of that commit. Relevant dirty/untracked paths include:

- `contracts/generated/ChromaTraitLabels.sol` (generated)
- `contracts/ChromaRenderer.sol` (label ladder removal)
- `script/robinhood/DeployLabelFixRendererMainnet.s.sol`
- `test/robinhood/CommemorativeLabelParity100.t.sol`
- `reports/robinhood/label-parity-100/` (parity-report.json PASS)
- `scripts/robinhood/verify-commemorative-100-parity.py`

Deploy proceeds from the **current working tree** that produced `parity-report.json` PASS (0 divergences). Recommend committing before `setRenderer()` go-live.

## 2. Fresh compile

```
forge build — SUCCESS (via_ir build, session 2026-07-14)
```

## 3. Local bytecode baseline

Recorded to `local-bytecode-hash.txt` (linked library build):

| Artifact | Runtime bytes | Runtime keccak256 |
|----------|---------------|-------------------|
| ChromaTraitLabels | 11,613 | `0xe95c4854d612662492dc8e7d8f85b5c3a42d02e731b31a5d60be9f66169d9f8a` |
| ChromaRendererRobinhood (linked to deployed lib) | 18,340 | see `local-bytecode-hash.txt` |

**Size note:** `internal` label functions inlined to 29,623 bytes (over 24KB limit). Deploy uses `external` library + separate `ChromaTraitLabels` deploy (11,613 + 18,340 bytes).

## 4. Live renderer wiring (constructor reference)

Current production renderer `0x9C34Bd0c872983e33611f0cF1cF3C1C968516736`:

| Immutable | Value |
|-----------|-------|
| chromaStorage | `0x3C8C9615889762bDcF9647a3C86C74aFA498a158` (ChromiesCommemorative) |
| paletteData | `0xb3ad67d60C44E6db461f8957AF7a2f664c01275a` |
| owner | `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` |

New deploy uses identical constructor args: `(commemorative, palette, deployer)`.

## 5. Parity prereq

`reports/robinhood/label-parity-100/parity-report.json` — **PASS** (100 tokens, 0 label divergences).
