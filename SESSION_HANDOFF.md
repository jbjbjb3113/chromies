# Chromies Session Handoff

Last updated: 2026-07-08

## Status board

### Legendaries (9 slots)

| Token | Normie | Status |
|------:|--------|--------|
| 45 | Snowfro | **Verified** — palette + final PNG |
| 264 | Timpers | **Verified** — palette + final PNG |
| 603 | a.c.k. | **Verified** — palette + final PNG |
| 1173 | Deekay | **Verified** — palette + final PNG |
| 1294 | PIV | **Verified** — palette + final PNG |
| 4698 | Jack Butcher | **Delivered** — conforming pass done; **palette ruling pending** (registry ID 31 not written) |
| 2222 | DOPEMIND | **Awaiting DOPEMIND hexes** — palette wired, PNG pending |
| 4354 | Serc | **Awaiting Serc file** |
| 3792 | UPCOMING2 | **Open** — concept pending |

**Score: 5/9 fully verified.**

### Encoder fix

**Closed, CI-gated.**

- Split-authority defect fixed: compiled palette + trait byte tables from registry
- `PayloadDedupeGuard` ratified (full + pixel keys)
- CI: `check_mint_encoder.py`, `traits_parity_check.py` (1011 baseline)
- Reports: `reports/ENCODER_AUDIT.md`, `reports/testrun_2000_post_encoder_fix_report.md`

### Model B

**Design gate open** — 4 rulings pending (holder inscribe, vocabulary, two passes, isSealed break). See Model B §12 items 1/6/7/8. **Do not act without JB.**

### Mint data

**Non-legendary 5,141 FROZEN for the Robinhood Chain commemorative re-do only**
(JB ruling, 2026-07-12) — see `chromies-engine/reports/ROBINHOOD_DATASET_FREEZE_RULING.md`.
`art-pipeline/output/mint-data.json` + `public/data/mint-data.json` were promoted
to this state (5,150 records: the newly-frozen 5,141 non-legendary + the 9
pre-existing, still-gated legendary rows, untouched). Reveal merkle root:
`0xb17659ae0e19720a50a2c90d16c6445029140596486ea6d808d363212ac73e7e`.

**Main ETH 5,150 launch dataset is still blocked on legendaries** — this
promotion does not lift that gate (see "Pipeline — FROZEN" below); it only
supplies fresh input to `scripts/robinhood/select-commemorative-100.js`.

---

## Still open (awaiting JB — do not act)

1. **#4698 merge ruling:** (a) as-applied per `merge_report.json` (includes 6.71 and transitive 11.18 merges, visually verified) vs (b) strict ≤6 only (13 colors, also fits). Registry ID 31 waits.
2. **Model B §12** items 1, 6, 7, 8.

---

## Pipeline — FROZEN (main ETH 5,150 launch)

Do **not** treat the main-collection dataset as final, or change trait
generation further, until legendary-finals gate clears. (The 2026-07-12
Robinhood-scoped freeze above did require a reveal-merkle regen to keep
`output/`/`public/data/` in sync — see the ruling doc — but that is not a
main-collection launch decision.)

**Locked systems (do not change without explicit unlock):**

- `art-pipeline/generate.js` — dedupe guard, combo cap (60), anti-None-stacking, Female hood/hair weights, `PayloadDedupeGuard` reroll stream
- `art-pipeline/chromies-config.js` — trait weights, palette tables, legendary token map
- `art-pipeline/legendary-finals.js` + `legendary-token-ids.js` — injection path only
- `art-pipeline/snapshot-holders.js` + `generate-merkle.js` — Tier 2 = Brain Rots ∪ Akutars
- Trait bytes **15/16 retired**; bytes **17/18** = Total Pixels
- Mint encoder artifacts compiled from `palette-registry.json` + `trait-byte-registry.json` — no hand-maintained byte tables

**Legendary-finals gate (blocking regen):**

| Slot | Token | Status |
|------|-------|--------|
| DOPEMIND | #2222 | Palette wired; **PNG + hexes pending** |
| UPCOMING2 | #3792 | Concept pending |
| Serc | #4354 | **File pending** |
| Jack Butcher | #4698 | Conforming pass delivered; **palette merge ruling pending** |
| Other verified | 45, 264, 603, 1173, 1294 | **5/9 complete** |

---

## Contract batch (local, not yet redeployed Sepolia)

### Economics (locked)

| Phase | Price | Per-wallet cap | Phase supply cap |
|-------|-------|----------------|------------------|
| Tier 1 allowlist | 0.0025 ETH | 5 | 2,500 |
| Tier 2 allowlist | 0.0035 ETH | 5 | 1,000 |
| Public | 0.0045 ETH | 5 | — |

- **Total supply:** 5,150
- **Team reserve:** 200 (owner `mint()` only, tokens 4,951–5,150)
- **Community mint cap:** 4,950

---

## Sepolia (live — pre-batch deploy)

| Contract | Address |
|----------|---------|
| ChromaStorage | `0x557933b09005C6254d3884A1F93a03e740920A42` |
| Chroma | `0x8162114c056DfC49045c04C66f1E03b761d81eD5` |
| ChromaCanvasV2 | `0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB` |
| ChromaPaletteData | `0x4Ff9Ef71A403579DdfCaC5294792306ebD38F0a7` |
| ChromaRenderer | `0x7680D210ed242330877b31D9749a92307484Aae1` |
| PixelMarketplace | `0x8D0b8327bcC96eF62b3de94687490298a52D3079` |

---

## Regen → deploy runbook

Execute only after legendary-finals gate passes.

```powershell
cd X:\Cursor\Homies\art-pipeline
node verify-legendary-finals.js --check-missing
node trait-frequency-dry-run.js
node generate.js --count 5150 --start 1
node bridge-mint-data.js --count 5150 --start 1
node generate-reveal-merkle.js
```

**Runtime reference (post encoder fix, local):** ~21s payload-only / 2000 tokens; ~60s full preview render + contact sheets / 2000; ~2.5 min projected for 5150 full preview. Must run from `art-pipeline/` cwd (or scripts that chdir there).

---

## Key files

| Path | Role |
|------|------|
| `art-pipeline/bridge-mint-data.js` | Mint payload + `PayloadDedupeGuard` |
| `art-pipeline/trait-byte-registry.json` | Trait variant byte source of truth |
| `scripts/compile_palette_registry.py` | Compiles palette + trait encoder artifacts |
| `scripts/check_mint_encoder.py` | CI diff gate |
| `chromies-engine/scripts/traits_parity_check.py` | TraitsHex semantic round-trip (1011 seeds) |
| `reports/ENCODER_AUDIT.md` | Split-authority audit |
