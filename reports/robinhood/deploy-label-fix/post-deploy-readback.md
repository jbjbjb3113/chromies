# Post-deploy readback (Step 5)

## Step 4 — setRenderer()

| Field | Value |
|-------|-------|
| Tx hash | `0x532ac3f5d2fffc226e37d9e641eb1ecd3033e333a49056b9026c122cc33e8cfb` |
| Block number | `10436702` (`0x9f395e`) |
| `renderer()` read-back | `0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364` |
| Expected renderer | `0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364` |
| **Step 4 result** | **PASS** |

**Note:** Only `4` commemorative tokens minted on mainnet at readback time; checks limited to token IDs `1..4`.

## Token sample

Checked **4** tokens: `[1, 2, 3, 4]`

Selection covers pre-fix fallback buckets:
- Hair → `None` fallback (hair byte > 7): token `1`
- Eyes → `Signal` fallback (eyes byte > 1): token `1`
- Character → `Human` mislabel (bytes 5/6/7): token `1`
- Known-good anchor: token `#1`

## Attribute parity vs `label-parity-100/uri-{n}.txt`

| Token | Label diffs | PNG vs local | Diff slots |
|------:|------------:|:-------------|:-----------|
| 1 | 0 | PASS | — |
| 2 | 0 | PASS | — |
| 3 | 0 | PASS | — |
| 4 | 0 | PASS | — |

## Token #1 PNG SHA-256 (pre-deploy mainnet baseline)

| Field | Value |
|-------|-------|
| Baseline file | `reports/robinhood/investigate-token1/chromie-001-live.png` |
| Baseline SHA-256 | `bd99dca815c24e98ef77304809605f4b13d298600073ec6dd594829580de1764` |
| Live post-setRenderer SHA-256 | `bd99dca815c24e98ef77304809605f4b13d298600073ec6dd594829580de1764` |
| **Result** | **PASS** |

## Summary

**OVERALL: PASS**

- Label divergences: **0**
- Token #1 PNG byte-identical to pre-deploy baseline: **yes**

