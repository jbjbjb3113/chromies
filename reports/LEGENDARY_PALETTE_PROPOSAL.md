# Legendary palette registry proposal

**Status:** 5/6 approved (2026-07-08) — IDs 28, 29, 32, 33, 34 compiled; ID 31 (#4698) pending near-miss merge validation.
**Generated:** 2026-07-08
**Source art:** `art-pipeline/legendary-finals/*.png` (6 delivered)

## Ordering policy

- **Slot 0:** transparent convention (`alpha=0` → index 0). Full-background finals do not use transparent pixels; slot 0 hex is registry/on-chain background role only.
- **Slots 1–15:** art opaque colors ordered by **pixel frequency (descending)**. Role names are labels only — not remapped to skin/hair semantics for 1/1 legendaries.
- **Unused slots:** unique `#00000N` sentinels marked **UNUSED** (distinct from slot 0 and all art colors).

## Sepolia / byte-stability note

These palettes are on-chain IDs **28–36** (`NORMIE_SNOWFRO` … `NORMIE_UPCOMING2`). Updating colors **will change** deployed `ChromaPaletteData` bytes vs current Sepolia (greyscale placeholders). After approval:
- Re-run `scripts/compile_palette_registry.py`
- Update byte-stability / palette ID test fixtures expecting IDs 28–36 (documented in same PR as registry change)
- Production PaletteData redeploy required before mainnet; Sepolia dress-rehearsal stack uses stale legendaries until redeploy

## Remaining blockers (post-approval of these 6)

| Token | Artist | Status |
|------:|--------|--------|
| 2222 | DOPEMIND | Final PNG missing; palette hexes unconfirmed — derive on arrival |
| 4354 | Serc | Final PNG missing — derive on arrival |
| 3792 | Coming Soon | Final PNG missing — TBD |

**Mint-data:** blocked until 9/9 finals pass preflight + round-trip.

---

## #45 Snowfro — `NORMIE_SNOWFRO` (on-chain ID **28**)

- **Final:** `legendary-finals/0045.png`
- **Normie ref:** #45
- **Canvas:** 64×64 | opaque 4096 px | transparent 0 px
- **Distinct opaque colors:** 7
- **Ordering:** frequency (most-used opaque pixels first) — role-agnostic for 1/1 legendaries
- **Fits 16 slots (incl. slot-0 convention):** **YES** — 7 art colors + slot 0

### Distinct-color inventory (opaque, by frequency)

| Rank | Hex | Pixels | Share |
|-----:|-----|-------:|------:|
| 1 | `#140a0a` | 3340 | 81.5% |
| 2 | `#550f0f` | 205 | 5.0% |
| 3 | `#821919` | 190 | 4.6% |
| 4 | `#c8503c` | 120 | 2.9% |
| 5 | `#aa2d23` | 96 | 2.3% |
| 6 | `#2d0808` | 75 | 1.8% |
| 7 | `#dc1e1e` | 70 | 1.7% |

### Proposed 16-slot registry entry

| Slot | Role | Hex | Label | Pixels |
|-----:|------|-----|-------|-------:|
| 0 | background (transparent convention) | `#000001` | TRANSPARENT CONVENTION (alpha=0 → idx 0) | 0 |
| 1 | mask_dark | `#140a0a` | art color rank 1 | 3340 |
| 2 | mask_mid | `#550f0f` | art color rank 2 | 205 |
| 3 | highlight | `#821919` | art color rank 3 | 190 |
| 4 | skin_shadow_deep | `#c8503c` | art color rank 4 | 120 |
| 5 | skin_shadow | `#aa2d23` | art color rank 5 | 96 |
| 6 | skin_mid | `#2d0808` | art color rank 6 | 75 |
| 7 | skin_light | `#dc1e1e` | art color rank 7 | 70 |
| 8 | skin_highlight | `#000002` | UNUSED padding | 0 |
| 9 | shirt_torso / hood garment | `#000003` | UNUSED padding | 0 |
| 10 | eye_socket | `#000004` | UNUSED padding | 0 |
| 11 | eye_glow | `#000005` | UNUSED padding | 0 |
| 12 | eye_signal | `#000006` | UNUSED padding | 0 |
| 13 | hair_dark | `#000007` | UNUSED padding | 0 |
| 14 | hair_mid | `#000008` | UNUSED padding | 0 |
| 15 | hair_bright | `#000009` | UNUSED padding | 0 |

```json
[
  "#000001",
  "#140a0a",
  "#550f0f",
  "#821919",
  "#c8503c",
  "#aa2d23",
  "#2d0808",
  "#dc1e1e",
  "#000002",
  "#000003",
  "#000004",
  "#000005",
  "#000006",
  "#000007",
  "#000008",
  "#000009"
]
```

**JB approval:** ☑ Approve as-is (2026-07-08)

---

## #264 Timpers — `NORMIE_TIMPERS` (on-chain ID **32**)

- **Final:** `legendary-finals/0264.png`
- **Normie ref:** #5974
- **Canvas:** 64×64 | opaque 4096 px | transparent 0 px
- **Distinct opaque colors:** 11
- **Ordering:** frequency (most-used opaque pixels first) — role-agnostic for 1/1 legendaries
- **Fits 16 slots (incl. slot-0 convention):** **YES** — 11 art colors + slot 0

### Distinct-color inventory (opaque, by frequency)

| Rank | Hex | Pixels | Share |
|-----:|-----|-------:|------:|
| 1 | `#c8fafd` | 2545 | 62.1% |
| 2 | `#e9e5e0` | 365 | 8.9% |
| 3 | `#000000` | 344 | 8.4% |
| 4 | `#451b02` | 189 | 4.6% |
| 5 | `#f0ab82` | 145 | 3.5% |
| 6 | `#c4c0ba` | 141 | 3.4% |
| 7 | `#c9c8c2` | 123 | 3.0% |
| 8 | `#484d39` | 109 | 2.7% |
| 9 | `#9d9c96` | 58 | 1.4% |
| 10 | `#293121` | 53 | 1.3% |
| 11 | `#eaf4fa` | 24 | 0.6% |

### Proposed 16-slot registry entry

| Slot | Role | Hex | Label | Pixels |
|-----:|------|-----|-------|-------:|
| 0 | background (transparent convention) | `#000001` | TRANSPARENT CONVENTION (alpha=0 → idx 0) | 0 |
| 1 | mask_dark | `#c8fafd` | art color rank 1 | 2545 |
| 2 | mask_mid | `#e9e5e0` | art color rank 2 | 365 |
| 3 | highlight | `#000000` | art color rank 3 | 344 |
| 4 | skin_shadow_deep | `#451b02` | art color rank 4 | 189 |
| 5 | skin_shadow | `#f0ab82` | art color rank 5 | 145 |
| 6 | skin_mid | `#c4c0ba` | art color rank 6 | 141 |
| 7 | skin_light | `#c9c8c2` | art color rank 7 | 123 |
| 8 | skin_highlight | `#484d39` | art color rank 8 | 109 |
| 9 | shirt_torso / hood garment | `#9d9c96` | art color rank 9 | 58 |
| 10 | eye_socket | `#293121` | art color rank 10 | 53 |
| 11 | eye_glow | `#eaf4fa` | art color rank 11 | 24 |
| 12 | eye_signal | `#000002` | UNUSED padding | 0 |
| 13 | hair_dark | `#000003` | UNUSED padding | 0 |
| 14 | hair_mid | `#000004` | UNUSED padding | 0 |
| 15 | hair_bright | `#000005` | UNUSED padding | 0 |

```json
[
  "#000001",
  "#c8fafd",
  "#e9e5e0",
  "#000000",
  "#451b02",
  "#f0ab82",
  "#c4c0ba",
  "#c9c8c2",
  "#484d39",
  "#9d9c96",
  "#293121",
  "#eaf4fa",
  "#000002",
  "#000003",
  "#000004",
  "#000005"
]
```

**JB approval:** ☑ Approve as-is (2026-07-08)

---

## #603 a.c.k. — `NORMIE_ACK` (on-chain ID **29**)

- **Final:** `legendary-finals/0603.png`
- **Normie ref:** #603
- **Canvas:** 64×64 | opaque 4096 px | transparent 0 px
- **Distinct opaque colors:** 5
- **Ordering:** frequency (most-used opaque pixels first) — role-agnostic for 1/1 legendaries
- **Fits 16 slots (incl. slot-0 convention):** **YES** — 5 art colors + slot 0

### Distinct-color inventory (opaque, by frequency)

| Rank | Hex | Pixels | Share |
|-----:|-----|-------:|------:|
| 1 | `#3a1b45` | 3025 | 73.9% |
| 2 | `#2a1518` | 567 | 13.8% |
| 3 | `#ced520` | 473 | 11.5% |
| 4 | `#f89000` | 25 | 0.6% |
| 5 | `#0b1ba8` | 6 | 0.1% |

### Proposed 16-slot registry entry

| Slot | Role | Hex | Label | Pixels |
|-----:|------|-----|-------|-------:|
| 0 | background (transparent convention) | `#000001` | TRANSPARENT CONVENTION (alpha=0 → idx 0) | 0 |
| 1 | mask_dark | `#3a1b45` | art color rank 1 | 3025 |
| 2 | mask_mid | `#2a1518` | art color rank 2 | 567 |
| 3 | highlight | `#ced520` | art color rank 3 | 473 |
| 4 | skin_shadow_deep | `#f89000` | art color rank 4 | 25 |
| 5 | skin_shadow | `#0b1ba8` | art color rank 5 | 6 |
| 6 | skin_mid | `#000002` | UNUSED padding | 0 |
| 7 | skin_light | `#000003` | UNUSED padding | 0 |
| 8 | skin_highlight | `#000004` | UNUSED padding | 0 |
| 9 | shirt_torso / hood garment | `#000005` | UNUSED padding | 0 |
| 10 | eye_socket | `#000006` | UNUSED padding | 0 |
| 11 | eye_glow | `#000007` | UNUSED padding | 0 |
| 12 | eye_signal | `#000008` | UNUSED padding | 0 |
| 13 | hair_dark | `#000009` | UNUSED padding | 0 |
| 14 | hair_mid | `#000010` | UNUSED padding | 0 |
| 15 | hair_bright | `#000011` | UNUSED padding | 0 |

```json
[
  "#000001",
  "#3a1b45",
  "#2a1518",
  "#ced520",
  "#f89000",
  "#0b1ba8",
  "#000002",
  "#000003",
  "#000004",
  "#000005",
  "#000006",
  "#000007",
  "#000008",
  "#000009",
  "#000010",
  "#000011"
]
```

**JB approval:** ☑ Approve as-is (2026-07-08)

---

## #1173 Deekay — `NORMIE_DEEKAY` (on-chain ID **33**)

- **Final:** `legendary-finals/1173.png`
- **Normie ref:** #6576
- **Canvas:** 64×64 | opaque 4096 px | transparent 0 px
- **Distinct opaque colors:** 12
- **Ordering:** frequency (most-used opaque pixels first) — role-agnostic for 1/1 legendaries
- **Fits 16 slots (incl. slot-0 convention):** **YES** — 12 art colors + slot 0

### Distinct-color inventory (opaque, by frequency)

| Rank | Hex | Pixels | Share |
|-----:|-----|-------:|------:|
| 1 | `#b8f8ff` | 1218 | 29.7% |
| 2 | `#035a7a` | 558 | 13.6% |
| 3 | `#024057` | 517 | 12.6% |
| 4 | `#ffffff` | 453 | 11.1% |
| 5 | `#1a0d0e` | 435 | 10.6% |
| 6 | `#ffbba0` | 424 | 10.4% |
| 7 | `#ebecec` | 300 | 7.3% |
| 8 | `#f6b59d` | 63 | 1.5% |
| 9 | `#f9ff61` | 60 | 1.5% |
| 10 | `#ff9a79` | 52 | 1.3% |
| 11 | `#99e3fa` | 12 | 0.3% |
| 12 | `#fffd94` | 4 | 0.1% |

### Proposed 16-slot registry entry

| Slot | Role | Hex | Label | Pixels |
|-----:|------|-----|-------|-------:|
| 0 | background (transparent convention) | `#000001` | TRANSPARENT CONVENTION (alpha=0 → idx 0) | 0 |
| 1 | mask_dark | `#b8f8ff` | art color rank 1 | 1218 |
| 2 | mask_mid | `#035a7a` | art color rank 2 | 558 |
| 3 | highlight | `#024057` | art color rank 3 | 517 |
| 4 | skin_shadow_deep | `#ffffff` | art color rank 4 | 453 |
| 5 | skin_shadow | `#1a0d0e` | art color rank 5 | 435 |
| 6 | skin_mid | `#ffbba0` | art color rank 6 | 424 |
| 7 | skin_light | `#ebecec` | art color rank 7 | 300 |
| 8 | skin_highlight | `#f6b59d` | art color rank 8 | 63 |
| 9 | shirt_torso / hood garment | `#f9ff61` | art color rank 9 | 60 |
| 10 | eye_socket | `#ff9a79` | art color rank 10 | 52 |
| 11 | eye_glow | `#99e3fa` | art color rank 11 | 12 |
| 12 | eye_signal | `#fffd94` | art color rank 12 | 4 |
| 13 | hair_dark | `#000002` | UNUSED padding | 0 |
| 14 | hair_mid | `#000003` | UNUSED padding | 0 |
| 15 | hair_bright | `#000004` | UNUSED padding | 0 |

```json
[
  "#000001",
  "#b8f8ff",
  "#035a7a",
  "#024057",
  "#ffffff",
  "#1a0d0e",
  "#ffbba0",
  "#ebecec",
  "#f6b59d",
  "#f9ff61",
  "#ff9a79",
  "#99e3fa",
  "#fffd94",
  "#000002",
  "#000003",
  "#000004"
]
```

**JB approval:** ☑ Approve as-is (2026-07-08)

---

## #1294 PIV — `NORMIE_PIV` (on-chain ID **34**)

- **Final:** `legendary-finals/1294.png`
- **Normie ref:** #7409
- **Canvas:** 64×64 | opaque 4096 px | transparent 0 px
- **Distinct opaque colors:** 6
- **Ordering:** frequency (most-used opaque pixels first) — role-agnostic for 1/1 legendaries
- **Fits 16 slots (incl. slot-0 convention):** **YES** — 6 art colors + slot 0

### Distinct-color inventory (opaque, by frequency)

| Rank | Hex | Pixels | Share |
|-----:|-----|-------:|------:|
| 1 | `#e3e5e4` | 2584 | 63.1% |
| 2 | `#48494b` | 1056 | 25.8% |
| 3 | `#bb916e` | 340 | 8.3% |
| 4 | `#000000` | 89 | 2.2% |
| 5 | `#56381a` | 18 | 0.4% |
| 6 | `#713f1d` | 9 | 0.2% |

### Proposed 16-slot registry entry

| Slot | Role | Hex | Label | Pixels |
|-----:|------|-----|-------|-------:|
| 0 | background (transparent convention) | `#000001` | TRANSPARENT CONVENTION (alpha=0 → idx 0) | 0 |
| 1 | mask_dark | `#e3e5e4` | art color rank 1 | 2584 |
| 2 | mask_mid | `#48494b` | art color rank 2 | 1056 |
| 3 | highlight | `#bb916e` | art color rank 3 | 340 |
| 4 | skin_shadow_deep | `#000000` | art color rank 4 | 89 |
| 5 | skin_shadow | `#56381a` | art color rank 5 | 18 |
| 6 | skin_mid | `#713f1d` | art color rank 6 | 9 |
| 7 | skin_light | `#000002` | UNUSED padding | 0 |
| 8 | skin_highlight | `#000003` | UNUSED padding | 0 |
| 9 | shirt_torso / hood garment | `#000004` | UNUSED padding | 0 |
| 10 | eye_socket | `#000005` | UNUSED padding | 0 |
| 11 | eye_glow | `#000006` | UNUSED padding | 0 |
| 12 | eye_signal | `#000007` | UNUSED padding | 0 |
| 13 | hair_dark | `#000008` | UNUSED padding | 0 |
| 14 | hair_mid | `#000009` | UNUSED padding | 0 |
| 15 | hair_bright | `#000010` | UNUSED padding | 0 |

```json
[
  "#000001",
  "#e3e5e4",
  "#48494b",
  "#bb916e",
  "#000000",
  "#56381a",
  "#713f1d",
  "#000002",
  "#000003",
  "#000004",
  "#000005",
  "#000006",
  "#000007",
  "#000008",
  "#000009",
  "#000010"
]
```

**JB approval:** ☑ Approve as-is (2026-07-08)

---

## #4698 Jack Butcher — `NORMIE_JACKBUTCHER` (on-chain ID **31**)

- **Final:** `legendary-finals/4698.png`
- **Normie ref:** #4698
- **Canvas:** 64×64 | opaque 4096 px | transparent 0 px
- **Distinct opaque colors:** 16
- **Ordering:** frequency (most-used opaque pixels first) — role-agnostic for 1/1 legendaries
- **Fits 16 slots (incl. slot-0 convention):** **NO** — see overflow / STOP below

### Distinct-color inventory (opaque, by frequency)

| Rank | Hex | Pixels | Share |
|-----:|-----|-------:|------:|
| 1 | `#698494` | 2941 | 71.8% |
| 2 | `#c9fbfc` | 573 | 14.0% |
| 3 | `#9ce0e0` | 228 | 5.6% |
| 4 | `#000000` | 198 | 4.8% |
| 5 | `#77bebf` | 111 | 2.7% |
| 6 | `#ccf9fd` | 12 | 0.3% |
| 7 | `#000207` | 9 | 0.2% |
| 8 | `#648693` | 6 | 0.1% |
| 9 | `#cffbff` | 5 | 0.1% |
| 10 | `#a0e4e4` | 4 | 0.1% |
| 11 | `#7abec0` | 3 | 0.1% |
| 12 | `#c7f5f7` | 2 | 0.0% |
| 13 | `#5f8994` | 1 | 0.0% |
| 14 | `#0f171b` | 1 | 0.0% |
| 15 | `#7ab7bc` | 1 | 0.0% |
| 16 | `#80bdc1` | 1 | 0.0% |

### #4698 STOP — 16 art colors + slot 0 = 17 slots

One art color must be **dropped or merged** before this palette can compile. **No automatic merge.**

Near-miss threshold: RGB Euclidean distance ≤ **18** (flag only).

#### Closest color pairs (all 16 × 15 / 2, nearest first)

| Color A | px | Color B | px | Distance | Flag |
|---------|---:|---------|---:|---------:|:----:|
| `#77bebf` | 111 | `#7abec0` | 3 | 3.16 | **NEAR-MISS** |
| `#c9fbfc` | 573 | `#ccf9fd` | 12 | 3.74 | **NEAR-MISS** |
| `#ccf9fd` | 12 | `#cffbff` | 5 | 4.12 | **NEAR-MISS** |
| `#698494` | 2941 | `#648693` | 6 | 5.48 | **NEAR-MISS** |
| `#648693` | 6 | `#5f8994` | 1 | 5.92 | **NEAR-MISS** |
| `#7abec0` | 3 | `#80bdc1` | 1 | 6.16 | **NEAR-MISS** |
| `#c9fbfc` | 573 | `#cffbff` | 5 | 6.71 | **NEAR-MISS** |
| `#9ce0e0` | 228 | `#a0e4e4` | 4 | 6.93 | **NEAR-MISS** |
| `#000000` | 198 | `#000207` | 9 | 7.28 | **NEAR-MISS** |
| `#c9fbfc` | 573 | `#c7f5f7` | 2 | 8.06 | **NEAR-MISS** |
| `#7abec0` | 3 | `#7ab7bc` | 1 | 8.06 | **NEAR-MISS** |
| `#77bebf` | 111 | `#7ab7bc` | 1 | 8.19 | **NEAR-MISS** |
| `#ccf9fd` | 12 | `#c7f5f7` | 2 | 8.77 | **NEAR-MISS** |
| `#77bebf` | 111 | `#80bdc1` | 1 | 9.27 | **NEAR-MISS** |
| `#7ab7bc` | 1 | `#80bdc1` | 1 | 9.85 | **NEAR-MISS** |
| `#698494` | 2941 | `#5f8994` | 1 | 11.18 | **NEAR-MISS** |
| `#cffbff` | 5 | `#c7f5f7` | 2 | 12.81 | **NEAR-MISS** |
| `#000207` | 9 | `#0f171b` | 1 | 32.65 |  |
| `#000000` | 198 | `#0f171b` | 1 | 38.51 |  |
| `#a0e4e4` | 4 | `#c7f5f7` | 2 | 46.59 |  |
| … | | | | | (100 more pairs) |

#### Merge candidates for JB (NOT applied)

- **#77bebf** (111 px) ↔ **#7abec0** (3 px) — distance **3.16**
- **#c9fbfc** (573 px) ↔ **#ccf9fd** (12 px) — distance **3.74**
- **#ccf9fd** (12 px) ↔ **#cffbff** (5 px) — distance **4.12**
- **#698494** (2941 px) ↔ **#648693** (6 px) — distance **5.48**
- **#648693** (6 px) ↔ **#5f8994** (1 px) — distance **5.92**
- **#7abec0** (3 px) ↔ **#80bdc1** (1 px) — distance **6.16**
- **#c9fbfc** (573 px) ↔ **#cffbff** (5 px) — distance **6.71**
- **#9ce0e0** (228 px) ↔ **#a0e4e4** (4 px) — distance **6.93**
- **#000000** (198 px) ↔ **#000207** (9 px) — distance **7.28**
- **#c9fbfc** (573 px) ↔ **#c7f5f7** (2 px) — distance **8.06**
- **#7abec0** (3 px) ↔ **#7ab7bc** (1 px) — distance **8.06**
- **#77bebf** (111 px) ↔ **#7ab7bc** (1 px) — distance **8.19**
- **#ccf9fd** (12 px) ↔ **#c7f5f7** (2 px) — distance **8.77**
- **#77bebf** (111 px) ↔ **#80bdc1** (1 px) — distance **9.27**
- **#7ab7bc** (1 px) ↔ **#80bdc1** (1 px) — distance **9.85**
- **#698494** (2941 px) ↔ **#5f8994** (1 px) — distance **11.18**
- **#cffbff** (5 px) ↔ **#c7f5f7** (2 px) — distance **12.81**

If JB approves merging one near-miss pair, re-run derive → 15 art colors → fits. Otherwise JB must drop one color in the art.

### Proposed registry entry

_Withheld — resolve overflow before approval._

---

## Approval workflow (ON APPROVAL ONLY)

1. JB checks ☐ per token above
2. Write approved `colors` arrays into `art-pipeline/chromies-config.js` + `art-pipeline/palette-registry.json`
3. `python scripts/compile_palette_registry.py`
4. `python scripts/check_palette_registry.py` (CI diff clean)
5. Update palette byte-stability fixtures for IDs 28–36
6. `node scripts/preflight-legendary.js` × 6 → expect **6/6 PASS**
7. `node art-pipeline/verify-legendary-finals.js --generate` → expect **zero-diff round-trip**
