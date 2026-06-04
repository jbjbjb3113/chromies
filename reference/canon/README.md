# CHROMIES canon

## Authoritative species doctrine

**`D LOCK Doctrine.png`** in this folder is the permanent visual target for **CHROMIE** mode (`pureChromieMode`).

When tuning skull geometry, eye placement, mask integration, hoodie framing, side mass, chain silhouette, or palette expression:

1. Compare generator output at 64×64 (and thumbnail scale) against this PNG.
2. Refine readability and compression only — do not redesign away from D-Lock.
3. Structure stays constant; palette families are phenotype-only.

### Layer law (from doctrine)

| Layer | Role |
|-------|------|
| Skull | Base geometry — must read without hoodie or hair |
| Mask | Face — integrated lower plane, not an overlay |
| Eyes | Low eye band, slanted, half-lidded |
| Side mass | Hair/spikes — never centered on crown |
| Hoodie | Silhouette — frames the skull |
| Chains | Status — grouped, readable links |

Implementation:

- `src/art/dLockDoctrine.ts` — render pipeline, facial planes, shoulders, `PURE_SKULL_TEST`
- `src/art/dLockMaterialProfiles.ts` — mask / hoodie / chain / eye material variants
- `src/art/dLockMaterials.ts` — phenotype material index roles per palette family
- `src/art/dLockHeroes.ts` — five canonical hero exemplars
- `src/art/chromieGenerate.ts` — canonical token factory
- `src/art/collectionWall.ts` — `WALL_PREVIEW_MODE`, 20/50/100 grids
- `src/art/speciesCompressionQa.ts` — thumbnail-scale validation (64/32px)

If the PNG is missing here, copy from `reference/D LOCK Doctrine.png` into this folder.
