# Testrun 2000 — duplicate-payload analysis

**Date:** 2026-07-08  
**Source batch:** `chromies-engine/generated/testrun_2000/` (tokens #1–#2000, payload-first path)  
**Collision key:** `pixelsHex ‖ traitsHex` (full mint payload)  
**Seed domain:** `tokenId` — all rolls derive from `seedFromStr(\`${tokenId}:<slot>\`)` (deterministic per token ID)

---

## Executive summary

| Metric | Value |
|--------|------:|
| Full-payload duplicate **groups** | **11** |
| Redundant token instances (Σ group size − 1) | **12** |
| Unique payloads | **1,988** / 2,000 |
| Collision rate (extra / batch) | **0.60%** |
| Linear projection @ 5,150 | **~31** redundant instances, **~28** groups |

### Classification breakdown

| Cause | Groups | Redundant tokens | Description |
|-------|-------:|-----------------:|-------------|
| **Roll-space** (identical visible trait vectors) | 5 | 5 | Same rolls → same inscribed traits + same pixels; dedupe guard did not prevent (post-exhaust or bypass) |
| **Encoding collapse** | 6 | 7 | Different visible trait vectors collapse to **identical `traitsHex`** because `bridge-mint-data.js` uses stale `on-chain-character-bytes.js` lookup tables (shirt palettes, Zombie glasses, etc. → byte `0`) |
| **Visual-space only** (pixels match, traits differ) | 19 groups / 30 instances | — | Not counted in the 12 full-payload dups; separate thin-corner signal |

**Root cause (encoding collapse):** `bridge-mint-data.js` imports `ON_CHAIN_PALETTE_BYTES` from `on-chain-character-bytes.js` (27 base palettes only). Shirt-variant palettes (`*_SHIRT_*`) and many per-archetype trait names are absent from encode tables → `lookupByte` falls back to **`0`** with a warning. Different rolls that should inscribe differently produce **bit-identical `traitsHex`**, and compositor output can match when occluded traits differ only in un-encoded slots.

---

## The 11 duplicate groups

### Group 1 — encoding collapse (palette)

| Field | Value |
|-------|-------|
| **Tokens** | **#2**, **#873** |
| **Seeds** | 2, 873 |
| **Cause** | Different shirt palettes (`BLOOD_SHIRT_GREEN` vs `SIGNAL_SHIRT_RED`) both encode `palette` byte **0** |
| **traitsHex** | `0x0100000000000000000000000000000000067700000000000000000000000000` |

**Trait vector (inscribed bytes):**
```
character=HeroA_Female(1)  palette=*(0)  hood=Female_None(0)  shirt=Crew_Female(0)
body=None(0)  bodytattoo=None(0)  necklace=None(0)  tattoo=Female_Thug(0)
mask=None(0)  beard=None(0)  mustache=None(0)  eyes=Female_LookLeft(0)
earrings=None(0)  glasses=None(0)  hair=None(0)
```

**Visible roll (differs):** `pal:BLOOD_SHIRT_GREEN` vs `pal:SIGNAL_SHIRT_RED` — same minimal Female stack (Crew + Thug tattoo, no hair/glasses).

![Group 1](testrun_2000_dup_analysis/group_01.png)

---

### Group 2 — encoding collapse (palette + eyes)

| Field | Value |
|-------|-------|
| **Tokens** | **#48**, **#1207** |
| **Seeds** | 48, 1207 |
| **Cause** | `CYAN_SHIRT_GREEN` vs `SIGNAL_SHIRT_PURPLE` → palette byte 0; `Female_LookRight` vs `Female_CrissCrossed` → eyes byte 0 |
| **traitsHex** | `0x0100000000000000000000000000000000072100000000000000000000000000` |

**Visible roll (differs):** palette family + eye variant; same hood Classic + Female_Shades.

![Group 2](testrun_2000_dup_analysis/group_02.png)

---

### Group 3 — encoding collapse (palette + earrings)

| Field | Value |
|-------|-------|
| **Tokens** | **#61**, **#1319** |
| **Seeds** | 61, 1319 |
| **Cause** | `SIGNAL_SHIRT_OLIVE` vs `SIGNAL_SHIRT_ORANGE` → palette byte 0; `earrings=None` vs `Female_Stud` → earrings byte 0 |
| **traitsHex** | `0x0100000000000000000000000000000000085800000000000000000000000000` |

**Visible roll (differs):** shirt palette + stud earrings; shared Female_Dreads + Crew_Female.

![Group 3](testrun_2000_dup_analysis/group_03.png)

---

### Group 4 — roll-space (Zombie)

| Field | Value |
|-------|-------|
| **Tokens** | **#62**, **#1578** |
| **Seeds** | 62, 1578 |
| **Cause** | **Identical visible trait vector** — same Zombie stack; dedupe reroll on #1578 (`accessory=Zombie_Cigarette`) did not change inscribed payload |
| **traitsHex** | `0x081a00000600000000000000000000000006e600000000000000000000000000` |

**Trait vector:** Zombie + ZOMBIE(26) + Neo glasses + Normies necklace + Zombie body; all accessory slots encode 0.

![Group 4](testrun_2000_dup_analysis/group_04.png)

---

### Group 5 — encoding collapse (Zombie glasses) — **triple**

| Field | Value |
|-------|-------|
| **Tokens** | **#91**, **#431**, **#1505** |
| **Seeds** | 91, 431, 1505 |
| **Cause** | `Zombie_Shades` / `Zombie_VR` / `Zombie_PiratePatch` all encode `glasses` byte **0**; shared AkuHeart bodytattoo |
| **traitsHex** | `0x081a00000602000000000000000000000006e600000000000000000000000000` |

**Visible roll (differs):** three glasses variants → one inscribed byte.

![Group 5](testrun_2000_dup_analysis/group_05.png)

---

### Group 6 — roll-space (Zombie)

| Field | Value |
|-------|-------|
| **Tokens** | **#99**, **#1956** |
| **Seeds** | 99, 1956 |
| **Cause** | Identical visible vector; #1956 dedupe reroll (`accessory=Zombie_Cigarette`) preserved payload |
| **traitsHex** | `0x081a00000600000000000000000000000006e800000000000000000000000000` |

**Trait vector:** Zombie + PiratePatch glasses + Chromies necklace.

![Group 6](testrun_2000_dup_analysis/group_06.png)

---

### Group 7 — encoding collapse (Zombie glasses)

| Field | Value |
|-------|-------|
| **Tokens** | **#429**, **#749** |
| **Seeds** | 429, 749 |
| **Cause** | `Zombie_VR` vs `Zombie_PiratePatch` → glasses byte 0 |
| **traitsHex** | `0x081a00000600000000000000000000000006e600000000000000000000000000` |

![Group 7](testrun_2000_dup_analysis/group_07.png)

---

### Group 8 — roll-space (Zombie)

| Field | Value |
|-------|-------|
| **Tokens** | **#506**, **#1853** |
| **Seeds** | 506, 1853 |
| **Cause** | Identical visible vector; #1853 dedupe reroll on accessory |
| **traitsHex** | `0x081a00000600000000000000000000000006e800000000000000000000000000` |

**Trait vector:** Zombie + DFrameFilled glasses.

![Group 8](testrun_2000_dup_analysis/group_08.png)

---

### Group 9 — encoding collapse (palette)

| Field | Value |
|-------|-------|
| **Tokens** | **#576**, **#788** |
| **Seeds** | 576, 788 |
| **Cause** | `SIGNAL_SHIRT_BLUE` vs `SIGNAL_SHIRT_RED` → palette byte 0 |
| **traitsHex** | `0x0100000000000000000000000000000000086600000000000000000000000000` |

**Visible roll (differs):** shirt palette only; shared Flannel_Female + Female_Afro + Stoned eyes.

![Group 9](testrun_2000_dup_analysis/group_09.png)

---

### Group 10 — roll-space (HeroA_Female)

| Field | Value |
|-------|-------|
| **Tokens** | **#642**, **#955** |
| **Seeds** | 642, 955 |
| **Cause** | Identical visible vector; #955 dedupe reroll (`accessory=Female_Cigarette`) |
| **traitsHex** | `0x0100000000000000000000000000000000072100000000000000000000000000` |

**Trait vector:** HeroA_Female + SIGNAL_SHIRT_RED(0) + Classic hood + Female_Neo + Straight eyes.

![Group 10](testrun_2000_dup_analysis/group_10.png)

---

### Group 11 — roll-space (Zombie)

| Field | Value |
|-------|-------|
| **Tokens** | **#661**, **#1039** |
| **Seeds** | 661, 1039 |
| **Cause** | Identical visible vector; #1039 dedupe reroll on accessory |
| **traitsHex** | `0x081a00000603000000000000000000000006e800000000000000000000000000` |

**Trait vector:** Zombie + Pyramid bodytattoo + HeyKoolAid necklace + Neo glasses.

![Group 11](testrun_2000_dup_analysis/group_11.png)

---

## Thin corners (trait combinations over-represented in collisions)

| Corner | Appears in | Why thin |
|--------|------------|----------|
| **Zombie archetype** | 7 / 11 groups | Small character pool (~2.35% of batch) but **~64%** of payload dups; many Zombie-specific variant names absent from `GLASSES_BYTES` / `NECKLACE_BYTES` encode tables |
| **`*_SHIRT_*` palette families** | 4 groups | 42 shirt palettes exist on-chain (IDs 38–79) but bridge encoder maps unknown names → byte 0 |
| **Minimal Female stacks** | G1, G3, G9, G10 | `body=None`, sparse hair/glasses — fewer pixel degrees of freedom → higher birthday collision |
| **Zombie glasses trifecta** | G5 | Shades / VR / PiratePatch visually distinct, all encode `glasses=0` |
| **Dedupe reroll on `accessory` slot** | G4, G6, G8, G10, G11 | Reroll changes metadata not in inscribed trait bytes → payload unchanged |
| **Trait-only duplicates (620 in batch)** | — | Same `traitsHex`, different `pixelsHex` — seed still unique in pixels; not mint-blocking |

---

## Projection @ 5,150 tokens

| Method | Redundant instances | Groups |
|--------|--------------------:|-------:|
| **Linear** (12 / 2000 × 5150) | **~31** | **~28** |
| **Unique-payload rate** | 1,988 / 2,000 → expect **~5,119** unique @ 5,150 | — |

Linear projection is conservative for roll-space collisions (birthday bound grows ~O(n²)) but encoding-collapse groups are **structural** — fixing the encoder may eliminate 6/11 groups entirely regardless of batch size.

**If encoder fixed only (no dedupe pass):** encoding-collapse groups (7 redundant tokens in this batch) would inscribe distinctly; roll-space groups (5 redundant) would remain.

---

## Remediation options (report only — not implemented)

### 1. Fix encoder tables (prerequisite)

**Action:** Point `bridge-mint-data.js` at `art-pipeline/generated/on-chain-palette-bytes.js` (compiled from 80-palette registry) and expand per-archetype trait byte maps (Zombie/Female/Chubby variant names).

| Effect on determinism | **Preserves** `tokenId → payload` for tokens that already encode correctly; **changes** payloads for tokens currently collapsing to byte 0 |
| Seed→token mapping | Unchanged roll logic; **inscription bytes change** for affected tokens — requires regen + merkle update before mint |

---

### 2. Full-payload dedupe-and-reroll at mint-data generation

**Action:** After `buildMintRecord`, hash `pixelsHex‖traitsHex`; on collision, deterministic re-roll using `seedFromStr(\`${tokenId}:payloadDedupe:${attempt}\`)` (same discipline as `TraitDedupeGuard` / combo-cap resolver). Loop until unique or hard-fail.

| Effect on determinism | **Preserves** `tokenId → payload` for non-colliding tokens; **changes** colliding tokens only (62 → unique sibling) |
| Seed→token mapping | **Stable** for ~99.4% of IDs; colliding IDs get amended rolls — document amended mapping in mint-data manifest |
| Pros | Closes both roll-space and residual visual-space collisions at inscription boundary |
| Cons | Colliding tokenIds no longer match “pure” first-roll semantics; must run at full 5,150 scale before merkle |

---

### 3. Visible-trait dedupe extension (current guard + payload check)

**Action:** Extend `TraitDedupeGuard` to key on full `traitsHex` (post-encode) or `pixelsHex`, not just `buildTraitVectorKey` visible string.

| Effect on determinism | Same as (2) for tokens that hit reroll |
| Seed→token mapping | Identical tradeoff to (2) but catches earlier in pipeline |

---

### 4. Weight adjustments (thin corners)

**Action:** Reduce Zombie / minimal-stack / high-collapse combo weights in `traits.json` or character picker.

| Effect on determinism | **Preserves** mapping for existing non-colliding tokens only if weights change is global and re-run from scratch |
| Seed→token mapping | **Breaks** all downstream assignments if weights change after any preview mint — only safe pre-mint-data |
| Pros | Lowers collision probability at source |
| Cons | Changes collection distribution; does not fix encoding collapse |

---

### 5. Accept-with-count

**Action:** Allow ≤N full-payload collisions in collection; document colliding pairs in provenance manifest.

| Effect on determinism | **Fully preserves** current `tokenId → payload` |
| Seed→token mapping | **Unchanged** |
| Pros | Zero regen; honest for preview testrun |
| Cons | Two Chromies would inscribe identically — **unacceptable for 1/1 NFT collection** unless collision count is proven 0 at 5,150 |

---

## Recommendation

1. **Fix encoder first** — eliminates 6/11 groups structurally (shirt palettes + Zombie trait names).
2. **Add full-payload dedupe pass** at mint-data generation — closes roll-space remainder with deterministic rerolls.
3. Do **not** accept-with-count for production mint.

---

## Artifacts

| Path | Contents |
|------|----------|
| `reports/testrun_2000_dup_analysis/duplicate_analysis.json` | Machine-readable group data |
| `reports/testrun_2000_dup_analysis/group_01.png` … `group_11.png` | Side-by-side 8× thumbnails per group |

**Constraints:** report-only; no mint-data, merkle, or contract changes.
