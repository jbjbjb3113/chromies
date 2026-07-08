# Testrun 2000 — post encoder fix + dedupe pass

**Date:** 2026-07-08  
**Scope:** Registry-discipline encoder fix + deterministic payload dedupe (no mint-data, no contract changes, no weight adjustments)

---

## Summary

| Metric | Pre-fix (n=2000) | Post-fix (n=2000) |
|--------|------------------:|------------------:|
| Full-payload duplicate groups | 11 | **0** |
| Full-payload redundant instances | 12 | **0** |
| Encoding-collapse groups | 6 | **0** |
| Roll-space groups | 5 | **0** |
| Visual-only groups (same pixels, different traitsHex) | 19 | **0** |
| Payload dedupe rerolls | — | **35** |

**Linear projection @ 5,150:** 0 redundant full-payload instances, 0 visual-only instances (was ~31 + ~77).

---

## Structural fix (encoder)

Hand-maintained `on-chain-character-bytes.js` is now a **compiled shim** pointing at `generated/on-chain-character-bytes.js`, built from `palette-registry.json` + `trait-byte-registry.json` by `scripts/compile_palette_registry.py`.

- **80 palette bytes** (including all `*_SHIRT_*` archetype variants)
- **308 trait variant bytes** across slots 2–14 (archetype names: `Female_LookLeft`, `Crew_Female`, `Zombie_Shades`, etc.)
- Python `mint_payload.py` loads the same tables from `engine_data/on_chain_trait_bytes.json`
- CI: `scripts/check_mint_encoder.py` + `chromies-engine/scripts/traits_parity_check.py` (1011 baseline)

The 6 encoding-collapse groups **vanished structurally** — distinct palette keys now encode to distinct `traits[1]` bytes instead of collapsing to 0.

---

## Dedupe pass

`PayloadDedupeGuard` in `bridge-mint-data.js`:

- **Full key:** `pixelsHex‖traitsHex` (catches roll-space collisions)
- **Pixel key:** `pixelsHex` alone (catches visual-only metadata divergence — **recommended stance per JB rules**)
- Reroll stream: `${tokenId}:payloadDedupe:${attempt}` via `resolveUniqueTokenTraits({ rollTokenId })`
- Logged in `payloadDedupeLog` / batch summary (same provenance pattern as compatibility repairs)

The 5 roll-space groups and all 19 visual-only groups were resolved by reroll (35 total rerolls in batch; all succeeded within `PAYLOAD_DEDUPE_MAX=8`).

### Visual-only stance (JB rules)

**Include `pixelsHex` in dedupe key — do not accept.**

At 5,150 scale, accepting visual-only collisions would mint ~77 tokens that look identical but carry different on-chain trait metadata — a marketplace/metadata integrity defect. Pixel uniqueness is the user-visible contract; trait bytes must not diverge on identical raster output.

---

## Payload dedupe log (high-signal)

Notable rerolls mapping to pre-fix duplicate groups:

| Token | Partner | Reason | Pre-fix class |
|------:|--------:|--------|---------------|
| 873 | 2 | pixel_visual | encoding-collapse (group 1) |
| 1207 | 771 | pixel_visual (attempt 2) | encoding-collapse (group 2) |
| 1319 | 61 | pixel_visual | encoding-collapse (group 3) |
| 1394 | 62 | pixel_visual | roll-space |
| 1546 | 62 | pixel_visual | roll-space |

Full log: `reports/testrun_2000_post_fix_duplicate_analysis.json`

---

## CI extensions

1. `scripts/check_mint_encoder.py` — diff gate on compiled palette + trait encoder artifacts
2. `chromies-engine/scripts/traits_parity_check.py` — **1011/1011 PASS** (traitsHex semantic round-trip to rolled vector)

This closes the parity blind spot documented in `reports/ENCODER_AUDIT.md`: pixel diff alone cannot detect traitsHex semantic collapse when the Python path had compiled palettes but the JS mint path did not.

---

## Constraints honored

- No mint-data batch write
- No contract changes
- No weight / distribution adjustments

---

## Contact sheets (regenerated 2026-07-08)

`chromies-engine/generated/testrun_2000/contact_sheets/` — 20 sheets, 60.3s full render. **Sheets with rerolled tokens** (JB review targets):

| Sheet | Rerolled IDs |
|------:|--------------|
| 02 | 151 |
| 05 | 429, 431 |
| 07 | 661 |
| 08 | 745, 749, 788 |
| 09 | 841, 867, 873 |
| 10 | 955 |
| 11 | 1022, 1037, 1039, 1093 |
| 12 | 1161, 1167 |
| 13 | 1207, 1271, 1277, 1288 |
| 14 | 1319, 1394 |
| 16 | 1505, 1529, 1546, 1578, 1585, 1599 |
| 18 | 1712, 1760 |
| 19 | 1853 |
| 20 | 1956, 1970, 1983 |

---

## Runtime forensics

| Mode | 2000 tokens | 5150 projected |
|------|-------------|----------------|
| Payload census (`post-fix-dup-count.mjs`) | 20.6s | ~53s |
| `bridge-mint-data.js --count 2000` | 10.9s | ~28s |
| Full preview + sheets (`testrun-2000.mjs`) | 60.3s | ~2.5 min |

**3-hour anomaly:** Not post-fix pipeline slowness. Caused by **wrong cwd** (repo root vs `art-pipeline/` → `./components` miss → empty compositor buffers → dedupe exhaustion retries) plus repeated agent re-runs during audit/debug. Traits parity (1011 seeds ≈ 103s) is not multi-hour. Current path is sane for 5,150 mint-data.
