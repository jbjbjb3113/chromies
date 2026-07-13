# Legendary finals — source manifest

Intake: 2026-07-07  
Delivery folder: `derived_assets/legendary-recovery/heads/` (JB handoff; user path placeholder `<PATH>` resolved to workspace staging)

| Canonical | Chromie token | Artist | Normie ref | Delivered filename |
|-----------|--------------:|--------|------------|------------------|
| `0045.png` | 45 | Snowfro | Normie #45 | `0045_NORMIE_0045_Snowfro.png` |
| `0264.png` | 264 | Timpers | Normie #5974 | `0264_NORMIE_5974_Timpers.png` |
| `0603.png` | 603 | a.c.k. | Normie #603 | `0603_NORMIE_0603_ACK.png` |
| `1173.png` | 1173 | Deekay | Normie #6576 | `1173_NORMIE_6576_Deekay.png` |
| `1294.png` | 1294 | PIV | Normie #7409 | `1294_NORMIE_7409_PIV.png` |
| `4698.png` | 4698 | Jack Butcher | Normie #4698 | `4698_NORMIE_4698_JackButcher.png` |

## Outstanding (not delivered)

| Canonical | Chromie token | Artist | Notes |
|-----------|--------------:|--------|-------|
| `2222.png` | 2222 | DOPEMIND | Palette hexes unconfirmed |
| `4354.png` | 4354 | Serc | Awaiting delivery |
| `3792.png` | 3792 | Coming Soon | Open slot |

**Status:** 6/9 delivered — 5/6 preflight PASS (2026-07-08); #4698 pending palette ID 31 (greyscale placeholder until near-miss merge validated).

## #4698 conforming pass (2026-07-08)

**Not an art edit** — automated conforming pass against export artifacts only.

Near-miss opaque colors at RGB Euclidean distance ≤6 were union-merged to cluster representatives (highest pixel count). Original `legendary-finals/4698.png` is **unchanged**; conform output lives in `derived_assets/legendary-recovery/4698_conform/`:

| Artifact | Purpose |
|----------|---------|
| `4698_before_after_diff_8x.png` | JB visual check — before / after / diff panel at 8× |
| `4698_merge_report.json` | Merge groups, remapped pixel count, proposed ID 31 palette |
| `4698_after_conform.png` | Conformed copy (not promoted to finals) |

Registry entry **NORMIE_JACKBUTCHER (ID 31)** remains greyscale placeholder until JB approves diff + proposed palette.

## Intake QA (2026-07-07)

| Canonical | Format | Preflight | Triage |
|-----------|--------|-----------|--------|
| `0045.png` | 64×64, binary α, full opaque bg | **FAIL** | **SYSTEMATIC** — 7 art colors vs greyscale `NORMIE_SNOWFRO` |
| `0264.png` | 64×64, binary α, full opaque bg | **FAIL** | **SYSTEMATIC** — 11 art colors vs greyscale `NORMIE_TIMPERS` |
| `0603.png` | 64×64, binary α, full opaque bg | **FAIL** | **SYSTEMATIC** — 5 art colors vs greyscale `NORMIE_ACK` |
| `1173.png` | 64×64, binary α, full opaque bg | **FAIL** | **SYSTEMATIC** — 12 art colors vs greyscale `NORMIE_DEEKAY` |
| `1294.png` | 64×64, binary α, full opaque bg | **FAIL** | **SYSTEMATIC** — 6 art colors vs greyscale `NORMIE_PIV` |
| `4698.png` | 64×64, binary α, full opaque bg | **FAIL** | **SYSTEMATIC** — 16 art colors (teal family + near-miss variants) vs greyscale `NORMIE_JACKBUTCHER` |

**Round-trip:** none run (0/6 preflight pass).  
**Root cause:** registry palettes are still greyscale placeholders; artwork uses artist true colors. **JB decision:** update `chromies-config.js` per-artist palettes → `compile_palette_registry` → CI — not auto-fix pixels.
