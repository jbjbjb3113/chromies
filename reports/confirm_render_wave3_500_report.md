# Wave-3 confirm render — 500 tokens, real committed config

**Date:** 2026-07-09
**Range:** #6001-#6500 (500 tokens), runtime 2.9s
No sandboxing this run — Bandana is committed live at 1.2%; Baseball/Bucket/Cowboy/Beanie committed at 0.

## Legendary IDs in range

In range: **none**

## Validation

- Rejects: **0** (expect 0)
- Duplicate payload vectors: **0** (expect 0)
- assertHatArtDelivered: **PASS**

## Hat roll rate vs ruled ladder (1.2% Bandana)

| Character pool | Total | Bandana hits | Actual % | Ruled % |
|---|---:|---:|---:|---:|
| HeroA_Male | 206 | 3 | 1.46% | 1.2% |
| HeroA_Female | 205 | 2 | 0.98% | 1.2% |
| Chubby_Male | 61 | 3 | 4.92% | 1.2% |

Female_Baseball hits: **10** (weight 0 this pass — Baseball rung not flipped; expect 0)
Other/unexpected hat values: **11**

## Coverage-rule firing

- hatSuppressesHair checked on 29 hat-wearing tokens, fired on **29** (expect 29)
- hat<->hood mutual exclusion checked on 88 tokens with hood and/or hat non-None, resolved (never both simultaneously) on **88** (expect 88)

**No coverage-rule violations.**

## Character distribution

| Character | Count | % |
|---|---:|---:|
| HeroA_Male | 206 | 41.20% |
| HeroA_Female | 205 | 41.00% |
| Chubby_Male | 61 | 12.20% |
| SideProfile_Male | 10 | 2.00% |
| Zombie | 8 | 1.60% |
| SideProfile_Female | 6 | 1.20% |
| Alien | 4 | 0.80% |

## Guard stats

- Anti-none-stack fires: 105
- Dedupe-reroll fires: 0
- Combo-cap-reroll fires: 0
