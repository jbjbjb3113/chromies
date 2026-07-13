# Test run 2000 — payload-first preview

**Date:** 2026-07-09
**Status:** COMPLETE
**Output:** `chromies-engine/generated/testrun_2000/`

## Summary

- Tokens rendered: **2000** (#1–#2000)
- Runtime: **51.0s** (25.5 ms/token)
- Validation rejects: **0**
- Full payload duplicates (pixelsHex+traitsHex): **0**
- Trait-only duplicates (traitsHex): **3**
- Warnings: **0**

## Legendary injection (in-range)

| Token | Path | 8× export |
|------:|------|-----------|
| 45 | `legendary-finals/0045.png` | `legendary_8x/chromie_0045_8x.png` |
| 264 | `legendary-finals/0264.png` | `legendary_8x/chromie_0264_8x.png` |
| 603 | `legendary-finals/0603.png` | `legendary_8x/chromie_0603_8x.png` |
| 1173 | `legendary-finals/1173.png` | `legendary_8x/chromie_1173_8x.png` |
| 1294 | `legendary-finals/1294.png` | `legendary_8x/chromie_1294_8x.png` |

## Validation

**PASS** — zero rejects.

## Duplicate payload check

**PASS** — all 2000 full mint payloads (pixelsHex+traitsHex) unique.

Trait-only duplicates (same traitsHex, different pixels): **3** — expected; pixel buffer carries seed uniqueness.

## Palette frequency (top 20)

| Palette | Count | % |
|---------|------:|--:|
| SIGNAL_SHIRT_RED | 130 | 6.50% |
| SIGNAL_SHIRT_ORANGE | 101 | 5.05% |
| SIGNAL_SHIRT_BLUE | 100 | 5.00% |
| SIGNAL | 96 | 4.80% |
| SIGNAL_BLONDE | 89 | 4.45% |
| SIGNAL_SHIRT_PURPLE | 81 | 4.05% |
| SIGNAL_SHIRT_GREEN | 77 | 3.85% |
| SIGNAL_SHIRT_OLIVE | 76 | 3.80% |
| GHOST | 61 | 3.05% |
| SIGNAL_GREY | 60 | 3.00% |
| BLOOD | 58 | 2.90% |
| SIGNAL_SHIRT_GOLD | 52 | 2.60% |
| CYAN | 50 | 2.50% |
| ACID | 46 | 2.30% |
| SIGNAL_RED | 42 | 2.10% |
| MOSS | 39 | 1.95% |
| BLOOD_BLONDE | 32 | 1.60% |
| GHOST_SHIRT_RED | 32 | 1.60% |
| CYAN_BLONDE | 28 | 1.40% |
| ACID_BLONDE | 27 | 1.35% |

## Character / archetype frequency

| Character | Count | % |
|-----------|------:|--:|
| HeroA_Female | 837 | 41.85% |
| HeroA_Male | 824 | 41.20% |
| Chubby_Male | 230 | 11.50% |
| SideProfile_Male | 42 | 2.10% |
| Zombie | 27 | 1.35% |
| SideProfile_Female | 25 | 1.25% |
| Alien | 9 | 0.45% |
| Agent | 6 | 0.30% |

## Guard stats

- Anti-none-stack fires: 119
- Dedupe-reroll fires: 10
- Combo-cap-reroll fires: 0

## Contact sheets

20 sheets × 100 tokens → `contact_sheets/sheet_XX.png`

**Constraints honored:** preview only, no mint-data batch, no merkle/contract changes.
