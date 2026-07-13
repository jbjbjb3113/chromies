# Test run 1k — HAT slot + HEAD_SHAPE (Angular) sandboxed weight preview

**STATUS: PREVIEW ONLY — NOT MINT DATA — pending JB's frequency ruling from these sheets.**
All weight changes below were applied in-memory for this render only. Nothing was written to
`art-pipeline/chromies-config.js` or `art-pipeline/traits.json`. Repo committed state is unchanged.

**Date:** 2026-07-09
**Main batch:** #5001-#6000 (1000 tokens), runtime 26.2s

## Legendary IDs in range

Full Normie Legendary set: #45, #264, #603, #1173, #1294, #2222, #3792, #4354, #4698
In range [5001-6000]: **none**

## Validation

- Rejects: **0** (expect 0)
- Full payload duplicate vectors: **0** (expect 0)
- Trait-only duplicates: **1** (expected; pixel buffer carries seed uniqueness)
- Warnings: **0**
- hat<->hood collisions resolved (hood wins, hat forced to None): **0**
- assertHatArtDelivered: **PASS**

## HEAD_SHAPE roll stats vs proposed weight (Angular 27.5% / Classic 72.5%)

| Archetype | Classic | Angular | Total | Angular % (actual) | Proposed |
|-----------|--------:|--------:|------:|--------------------:|---------:|
| HeroA/Male | 268 | 103 | 371 | 27.76% | 27.5% |
| HeroA/Female | 321 | 119 | 440 | 27.05% | 27.5% |

**QA note (visual, from Phase 0/1 forced-preview):** `HEAD_Male_Angular.png` differs from the committed
Classic `HEAD_HeroA.png` by only **9 of 554 opaque pixels (1.6%)** — well inside even the collection's
lenient similarity-flag threshold (pixel IoU ~98.4%, vs `pixel_iou_reject: 0.80` in
`chromies-engine/similarity/thresholds.json`). The Female pair is more differentiated (47/614 union
pixels, ~92% IoU, concentrated in the jaw/cheek region). **The delivered Male_Angular art may not read
as a distinct head shape at the roll rate proposed — recommend JB re-check the male asset specifically
before ruling on frequency.** This is a recommendation, not a decision made on JB's behalf.

## HAT roll stats vs proposed rarity ladder

**Only `Male_Bucket` has delivered art. The hard-fail guard (`assertHatArtDelivered`) forbids giving
weight to Baseball/Cowboy/Bandana/Beanie or any Female/Chubby hat until art lands — so only the Bucket
rung could be evidenced this run. Reported explicitly, not worked around.**

| Variant | Character pool | Proposed % | Actual hits / HeroA-Male | Actual % |
|---------|-----------------|-----------:|---------------------------:|---------:|
| Male_Bucket | HeroA/Male hat | 1.2% | 6 / 371 | 1.62% |
| Male_Baseball | HeroA/Male hat | 4.5% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |
| Male_Cowboy | HeroA/Male hat | 2.5% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |
| Male_Bandana | HeroA/Male hat | 1.2% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |
| Male_Beanie | HeroA/Male hat | 0.6% (proposed) | — | **NOT EVIDENCED — no art delivered, weight 0** |
| Female_* / Chubby_* (all 5 each) | — | ladder proposed | — | **NOT EVIDENCED — no art delivered for any Female/Chubby hat, weight 0** |

## Character / palette frequency (main batch)

| Character | Count | % |
|-----------|------:|--:|
| HeroA_Female | 440 | 44.00% |
| HeroA_Male | 371 | 37.10% |
| Chubby_Male | 129 | 12.90% |
| SideProfile_Male | 19 | 1.90% |
| SideProfile_Female | 14 | 1.40% |
| Zombie | 11 | 1.10% |
| Agent | 10 | 1.00% |
| Alien | 6 | 0.60% |

## Guard stats (main batch)

- Anti-none-stack fires: 76
- Dedupe-reroll fires: 5
- Combo-cap-reroll fires: 0

## Contact sheets

10 sheets x 100 tokens -> `contact_sheets/sheet_XX.png`

## Heavyweight gates

Run once, separately, after this render — see Phase 4 gate-check output. Not embedded in this script
per session rules (gates once, fail loudly, report — don't resolve).

**Nothing lands until JB rules on: HEAD_SHAPE Angular frequency (and re-checks the Male_Angular asset
per the QA note above), and the hat rarity ladder (once Baseball/Cowboy/Bandana/Beanie art + any
Female/Chubby hat art is delivered).**
