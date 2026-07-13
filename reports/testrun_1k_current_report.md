# Quick render — 1000 tokens, everything live, real committed config

**Date:** 2026-07-10
**Range:** #7001-#8000 (1000 tokens), runtime 32.0s
No sandboxing. No gates run this pass (nothing changed since the last green gate run).

## Legendary IDs in range

**none**

## Validation

- Rejects: **0** (expect 0)
- Duplicate payload vectors: **0** (expect 0)

## Hat roll counts vs committed ladder (Baseball 4.5% / Bucket 1.2% / Bandana 1.2%)

| Character pool | Total | Baseball | Bucket | Bandana | Baseball % | Bucket % | Bandana % |
|---|---:|---:|---:|---:|---:|---:|---:|
| HeroA Male | 421 | 14 | 4 | 7 | 3.33% | 0.95% | 1.66% |
| HeroA Female | 395 | 11 | 2 | 6 | 2.78% | 0.51% | 1.52% |
| Chubby | 127 | 3 | 1 | 2 | 2.36% | 0.79% | 1.57% |

## Head-shape (Angular) roll counts — KNOWN NOT LIVE, expect 0

**Confirmed before this render: `forcedSlots.head` still locks HeroA Male/Female to Classic in committed
config. Angular was only ever exercised in sandboxed test scripts — never flipped to a real weight.
0/1000 here is expected, documented state, not a bug.**

| Archetype | Classic | Angular | Total |
|---|---:|---:|---:|
| HeroA_Male | 421 | 0 | 421 |
| HeroA_Female | 395 | 0 | 395 |

## Hood-up (Male_Hooded / Female_Hooded) roll counts vs committed weight (0.6% each)

| Character pool | Total | Hood-up hits | Actual % | Committed % |
|---|---:|---:|---:|---:|
| HeroA Male | 421 | 6 | 1.43% | 0.6% |
| HeroA Female | 395 | 3 | 0.76% | 0.6% |

## Character distribution

| Character | Count | % |
|---|---:|---:|
| HeroA_Male | 421 | 42.10% |
| HeroA_Female | 395 | 39.50% |
| Chubby_Male | 127 | 12.70% |
| SideProfile_Male | 25 | 2.50% |
| Zombie | 14 | 1.40% |
| SideProfile_Female | 10 | 1.00% |
| Alien | 5 | 0.50% |
| Agent | 3 | 0.30% |

## Guard stats

- Anti-none-stack fires: 112
- Dedupe-reroll fires: 1
- Combo-cap-reroll fires: 0

## Contact sheets

10 sheets x 100 tokens -> `contact_sheets/sheet_XX.png`
