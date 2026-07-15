# Step 4 — setRenderer() [BLOCKED — AWAIT JB GO]

**Do not execute this step without explicit JB confirmation.**

## Target call

| Field | Value |
|-------|-------|
| Contract | `ChromiesCommemorative` @ `0x3C8C9615889762bDcF9647a3C86C74aFA498a158` |
| Function | `setRenderer(address)` |
| New renderer | `0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364` |
| Current live renderer | `0x9C34Bd0c872983e33611f0cF1cF3C1C968516736` |

## Pre-conditions satisfied (Steps 1–3)

- [x] Fresh `forge build` succeeded
- [x] Label-fix renderer + `ChromaTraitLabels` library deployed (deploy-only)
- [x] On-chain bytecode verification **PASS** (`bytecode-verify.txt`)
- [x] Constructor wiring read-back matches production (`chromaStorage`, `paletteData`, `owner`)
- [ ] `setRenderer()` — **NOT CALLED**

## Suggested command (after JB go)

```bash
cast send 0x3C8C9615889762bDcF9647a3C86C74aFA498a158 \
  "setRenderer(address)" 0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364 \
  --rpc-url robinhood_mainnet --private-key $PRIVATE_KEY
```

Or add a gated `SetLabelFixRendererMainnet.s.sol` script mirroring existing Robinhood script patterns.

## After setRenderer go — run Step 5

Post-deploy readback (~10–15 tokens) → `post-deploy-readback.md`
