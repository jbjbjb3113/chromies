# Test run 1k — sandboxed weight preview (payload-first)

**STATUS: PREVIEW ONLY — NOT MINT DATA — pending JB's weight-pass ruling.**
All weight changes below were applied in-memory for this render only. Nothing was written to
`art-pipeline/chromies-config.js` or `art-pipeline/traits.json`. Repo is unchanged / committed-clean.

**Date:** 2026-07-09
**Main batch:** #3001-#4000 (1000 tokens), runtime 26.0s
**Side batch:** 100 HeroA-Male tokens (scanned #4001+), runtime 0.6s

## Legendary IDs in range

Full Normie Legendary set: #45, #264, #603, #1173, #1294, #2222, #3792, #4354, #4698
In range [3001-4000]: **3792**
- #3792: **skip-with-notice** — no `legendary-finals/3792.png` yet (DOPEMIND/UPCOMING2 have no head asset). Excluded from render + reject count.

## Main batch — validation

- Rejects: **0** (expect 0)
- Legendary skip-with-notice: **1** (#3792)
- Full payload duplicate vectors: **0** (expect 0)
- Trait-only duplicates: **1** (expected; pixel buffer carries seed uniqueness)
- Warnings: **0**

## Roll stats — sandboxed weights vs expected

| Variant | Character pool | Before → After weight | Actual (this run) | Naive expected |
|---------|-----------------|------------------------|-------------------:|----------------:|
| SP_AZVet_Female | SideProfile/Female hair | 7 → 35 | 2 | 4.04 |
| Chubby_AZVet | Chubby/Male hair | 10 → 20 | 24 | 20.86 |

### 14 dead-legacy weights (zeroed) — actual hits (expect 0 for all; unreachable via any active character pool prior to this change too)

| Slot | Variant | Actual hits |
|------|---------|-------------:|
| hair | Mohawk | 0 |
| hair | Pompadour | 0 |
| hair | MrT | 0 |
| hair | Afro | 0 |
| hair | Dreads | 0 |
| hair | Surfer | 0 |
| hair | FadeRight | 0 |
| hair | Buns | 0 |
| hair | AZVet | 0 |
| eyes | Signal | 0 |
| eyes | BlackEye | 0 |
| eyes | MakeUp | 0 |
| eyes | RunningMascara | 0 |
| eyes | Stoned | 0 |

## HOODUP_3PCT_PREVIEW — Male_Hooded frequency-ruling evidence

**This is evidence for JB's frequency ruling, not a proposed weight change.**

- HeroA/Male hood pool (sandboxed): `{"Classic":20,"Male_Hooded":0.6,"None":79.4}` → `{"Classic":20,"Male_Hooded":3,"None":77}`
- Committed/natural rate: **0.6%** of HeroA Male hood pool
- Sandboxed preview rate: **~3%**
- Batch: 100 HeroA-Male tokens, scanned from #4001 onward (legendary IDs excluded from scan)
- Male_Hooded hits: **2 / 100** (2.0%)
- Rejects in side batch: **0**
- Contact sheet: `chromies-engine/generated/testrun_1k_weights/hoodup_3pct_preview/HOODUP_3PCT_PREVIEW.png`

## Character / palette frequency (main batch)

| Character | Count | % |
|-----------|------:|--:|
| HeroA_Male | 421 | 42.10% |
| HeroA_Female | 401 | 40.10% |
| Chubby_Male | 134 | 13.40% |
| SideProfile_Female | 14 | 1.40% |
| SideProfile_Male | 13 | 1.30% |
| Zombie | 7 | 0.70% |
| Alien | 6 | 0.60% |
| Agent | 3 | 0.30% |

## Guard stats (main batch)

- Anti-none-stack fires: 44
- Dedupe-reroll fires: 3
- Combo-cap-reroll fires: 0

## Contact sheets

10 sheets × 100 tokens → `contact_sheets/sheet_XX.png` (main batch)
1 sheet × 100 tokens → `hoodup_3pct_preview/HOODUP_3PCT_PREVIEW.png` (side batch)

## Heavyweight gates

Run once, separately, after this render — see follow-up gate-check output. Not embedded in this script
per session rules (gates once, fail loudly, report — don't resolve).

**Nothing lands until JB rules on: SP_AZVet_Female routing/weight, Chubby_AZVet 2x, dead-legacy zeroing, Male_Hooded frequency.**
