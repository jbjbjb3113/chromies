# Phase 2C — Python Compositor Port Plan

**Status:** Plan only — do not implement until approved.  
**Sources:** `art-pipeline/generate.js`, `chromies-config.js`, `traits.json`, `phase3-variance.js`  
**Outputs:** `chromies-engine/engine_data/*.json` (schema), future compositor under `chromies-engine/engine/`

---

## Executive summary

Port the JavaScript Chromie compositor to Python as a **read-only consumer** of `art-pipeline/components`. The engine must:

1. Match `generate.js` deterministic rolls (token ID → character → palette → slot variants → coverage rules → composite).
2. Preserve **Identity DNA** as a separate PRNG stream (already implemented in `engine/roll_traits.py`).
3. Use **role-index buffers** + palette lookup (not direct RGB paste).
4. Treat **SideProfile** as an independent render pipeline.
5. Gate **forehead_mark** and visible **mask** until real art exists.
6. Write any normalization/recolor/dedup outputs only to `derived_assets/`.

---

## 1. Python module structure

```
chromies-engine/
  engine/
    art_safety.py              # READ_ONLY_ART_ROOT guard (exists)
    chromies_config_loader.py  # Node-backed config load (exists)
    compositor/
      __init__.py
      rng.py                   # mulberry32 + seedFromStr (JS-compatible)
      config_data.py           # load engine_data/*.json + traits.json paths
      palette.py               # ROLES, paletteColorsToDrawColors, resolveExtractionDrawColors
      extract.py               # extractToBuffer (hex → role index)
      characters.py            # pickCharacter, resolveCharacter, getEligibleVariants
      coverage.py              # applyCoverageRules, hood helpers
      rolls.py                 # rollSlotVariant, weightedPick, syncGroupForPick
      anti_stack.py            # applyAntiNoneStacking
      dedupe.py                # dedupe reroll + combo cap (optional phase)
      composite.py             # compositeChromie, renderPNG, renderSVG
      legendary.py             # legendary token bypass (read legendary-finals/)
      side_profile.py          # SideProfile-specific finalize hooks
      pipeline.py              # generateToken(tokenId) orchestrator
  engine_data/                 # art-derived schema (Phase 2A)
  derived_assets/              # any future normalized sprites
  generated/                   # compositor PNG/SVG output
  reference_only/              # normie reference copies (never composited)
```

**CLI entry:** `python -m engine.compositor.pipeline --token-id 12345`

---

## 2. Required classes

| Class | Responsibility |
|-------|----------------|
| `Mulberry32RNG` | Bit-identical float stream from JS `mulberry32` / `seedFromStr` |
| `ArtSchema` | Loaded `art_schema.json` + `slot_schema.json` |
| `PaletteFamily` | 16 role hex colors + name + drawColors map |
| `CharacterArchetype` | name, gender, weight, forcedSlots, slotVariantPool |
| `VariantPick` | slot, variant dict, file path, optional role buffer |
| `TokenTraits` | raw picks vs render picks (metadata vs composite) |
| `RoleLayerBuffer` | `Uint8Array` 64×64 of role indices (0=background) |
| `Compositor` | sort by zOrder, alpha-over role indices |
| `CoverageEngine` | hood/body/shirt suppression rules |
| `IdentityDNAStream` | **unchanged** — separate from compositor; only enriches metadata |

---

## 3. Required functions

### RNG (must match JS)

```python
def seed_from_str(s: str) -> int: ...
def mulberry32(seed: int) -> Callable[[], float]: ...
def weighted_pick(variants: list, rng) -> dict: ...
```

Roll seeds mirror JS:

- Character: `f"{tokenId}:character"`
- Slot: `f"{tokenId}:{slot}"` (+ `:restack:{n}` for anti-none)
- Palette: existing traits.json palette roll
- Dedupe/combo cap: `f"{tokenId}:dedupe:{attempt}"`, `f"{tokenId}:comboCap:{attempt}"`

### Extraction

```python
def hex_to_rgb(hex: str) -> tuple[int, int, int]: ...
def color_distance(a, b) -> int: ...
def palette_colors_to_draw_colors(colors: list[str]) -> dict[str, str]: ...
def resolve_extraction_draw_colors(slot, pick, character, slot_def) -> dict: ...
def extract_to_buffer(path: Path, draw_colors: dict, *, skip_rgb_knockout: bool) -> memoryview: ...
```

Knockout: skip pixels where `a==0` OR `(r,g,b <= bgKnockoutThreshold)` unless `skip_rgb_knockout` (Zombie/Agent).

### Character / eligibility

```python
def pick_character(token_id: int, characters: list) -> CharacterArchetype: ...
def get_eligible_variants(slot, slot_def, character, *, exclude_none, exclude_names) -> list: ...
def roll_slot_variant(token_id, slot, traits, character, seed_suffix="", opts) -> dict | None: ...
def sync_group_for_pick(picks, slot, variant, traits, character): ...
```

### Coverage (port verbatim logic from `applyCoverageRules`)

Key helpers:

- `is_hood_none`, `hood_covers_torso`, `hood_suppresses_hair`, `is_female_hood`
- `suppress_to(slot, None variant)`
- `promote_to_default`, `promote_to_named`
- Character branches: **Chubby**, **SideProfile**, **Alien**, **Zombie**, **Legendary head**

### Composite

```python
def composite_chromie(render_picks, traits, token_id=0, drift_map=None) -> bytes: ...
def render_png(buf, palette, *, transparent_index0=False) -> bytes: ...
def render_svg(buf, palette) -> str: ...
```

Layer order: sort by `variant.zOrder ?? slot.zOrder`, back-to-front overwrite non-zero role indices.

---

## 4. Layer ordering

From `traits.json` zOrder (back → front):

| zOrder | Slot | Notes |
|--------|------|-------|
| 5 | hood | Classic hood-down |
| 6 | shirt | |
| 7 | body | |
| 8 | bodytattoo | |
| 9 | necklace | |
| 10 | neck | baked into some heads |
| 12 | head | forced per archetype |
| 15 | tattoo | face tattoo |
| 20 | mask | **gated** — None only |
| 25 | beard | |
| 26 | mustache | |
| 30 | eyes | |
| 31 | expression | |
| 32 | earrings | |
| 35 | glasses | |
| 40 | hair | suppressed by hood rules |
| 41 | hood (override) | Female_Hooded, Zombie hood-up variants |
| 45 | accessory | front-most |

**Side-profile:** same zOrder table but only SP_* variant files from `slot_schema.json → side_profile_pipeline`.

---

## 5. Palette recolor architecture

Pipeline is **two-stage**:

1. **Extract:** PNG RGB → nearest palette hex in `drawColors` → single-byte role index (0–15).
2. **Render:** role index → selected palette family 16-color array → output RGB PNG/SVG.

Resolution order (`resolveExtractionDrawColors`):

1. Zombie component → `PALETTES.ZOMBIE` role map
2. Agent component → `PALETTES.AGENT` role map
3. Variant-level `drawColors`
4. Variant `extractionPalette` → palette family colors
5. Slot default `drawColors`

Slot `drawColors` maps **authoring hexes** in PNG to **semantic roles** (skin_mid, hair_bright, hood, etc.). Changing palette family swaps all role colors without re-exporting art.

**Python storage:** load full `PALETTES` from chromies-config via Node loader; cache `ROLE_INDEX` dict.

**Shirt variants:** many shirt colors use `extractionPalette: SIGNAL_SHIRT_RED` etc. — must preserve variant-level palette override.

---

## 6. Archetype handling

| Archetype | Key behavior |
|-----------|--------------|
| HeroA (M/F) | forced head+neck; full slotVariantPool; anti-none stacking |
| Chubby | forced head+body Chubby; shirt always None; neck deleted; bodytattoo suppressed |
| HeroA Female | forced Female body; tank_female group sync |
| Alien | forced Alien body; anti-none stacking |
| Zombie | forced Zombie body; neck deleted; rgb knockout skipped on zombie/ assets |
| Agent | rgb knockout skipped on Agent/ assets |
| SideProfile (M/F) | forced SP head; body None; eyes None (male); SP shirt defaults; independent SP pools |
| Legendary | bypass compositor — load pre-rendered `legendary-finals/` |

Character roll weights come from `rarity_from_art.json → character_weights`.

**Do not import** abstract forge taxonomy (`Taper`, `Halfplate`, `Ember`, `forehead_mark`) unless matching PNGs exist.

---

## 7. Deterministic seed compatibility

| Stream | JS | Python engine today | Port target |
|--------|----|--------------------|-------------|
| Appearance slots | mulberry32 + seedFromStr | PCG64(seed) in placeholder forge | **Switch compositor to mulberry32** for tokenId rolls |
| Identity DNA | N/A in JS pipeline | PCG64(SeedSequence([seed, 0x1D171DAA])) | **Keep unchanged** |
| Phase 3 drift | disabled | N/A | Skip until enabled |

**Critical:** Python compositor must use `mulberry32(seed_from_str(...))` for all `generate.js` rolls to reproduce identical picks. Identity DNA remains a second stream keyed off the same user seed but must never feed back into variant selection unless explicitly designed.

**Validation strategy:** golden tests — for token IDs 1…N, compare trait vector keys and PNG hash against Node `generate.js` output.

---

## 8. Metadata mapping

Metadata should mirror JS output structure:

```json
{
  "token_id": 12345,
  "character": { "name": "HeroA", "gender": "Male" },
  "palette": "SIGNAL",
  "traits": {
    "hood": { "name": "None", "file": "HOOD_None.png" },
    "...": "..."
  },
  "render_traits": { "...": "post-coverage picks" },
  "identity": {
    "appearance": { "...": "legacy or art-derived trait vector" },
    "identity_dna": { "...": "7 fields from separate stream" }
  }
}
```

- **traits** = pre-coverage rolls (metadata honesty)
- **render_traits** = post-`applyCoverageRules` (what was composited)
- **identity_dna** = never alters PNG choice

Map slot names directly from art schema (`hood`, `shirt`, `body`, …) — deprecate `head_shape`, `mask_type`, `forehead_mark` in appearance metadata until gated slots ship.

---

## 9. Risks before implementation

| Risk | Severity | Mitigation |
|------|----------|------------|
| RNG mismatch (PCG64 vs mulberry32) | **High** | Implement JS-identical mulberry32; golden-file tests |
| Node config load dependency | Medium | Cache exported JSON in `engine_data/`; CI regenerates on config change |
| Windows path casing (`chubby/` vs `Chubby/`) | Medium | Normalize to on-disk casing via inventory scan |
| 13 duplicate pixel groups | Medium | Document in metadata; dedupe only in `derived_assets/` if needed |
| 8 missing SP PNG refs | Medium | Gate variants in SideProfile pool until art lands |
| BEARD_Full == BEARD_Goat pixels | Low | Keep separate names for rarity; note in compatibility schema |
| Shared None PNG across 14 slots | Low | Expected — extract still works per slot drawColors context |
| Partial alpha in source art | Low | Report flags; extraction treats non-255 as transparent |
| Legendary / gold token bypass | Medium | Port `legendary-token-ids.js` + finals loader separately |
| Dedupe + combo cap rerolls | Medium | Phase 2 — port after core composite matches |
| Identity strength validators | Medium | Validators reference old silhouette/mark zones — retune after art compositor |
| Normie assets in pools | **High** | Exclude from compositor; reference_only list only |
| Accidental write to components | **Critical** | `art_safety.py` guard on all I/O helpers |

---

## 10. Recommended implementation phases (post-approval)

1. **Phase C1:** `rng.py` + golden tests vs Node for character/slot rolls  
2. **Phase C2:** `extract.py` + `palette.py` — single-layer extraction tests  
3. **Phase C3:** `coverage.py` — metadata-only finalize tests  
4. **Phase C4:** `composite.py` + PNG render — full token golden hashes  
5. **Phase C5:** Wire Identity DNA metadata (no change to rolls)  
6. **Phase C6:** Dedupe/combo cap + review routing integration  
7. **Phase C7:** Deprecate placeholder PNG forge in `chromies-engine/traits/`

---

## 11. Engine changes recommended (from Phase 2A export)

1. Replace `traits/rarity.json` abstract categories with `engine_data/rarity_from_art.json`.
2. Replace `traits/conflicts.json` with `compatibility_from_art.json` coverage + groups.
3. Load layer paths from `slot_schema.json` pointing at read-only `art-pipeline/components`.
4. Remove or gate `forehead_mark` and non-None `mask` from roll order until art exists.
5. Add `render_pipeline: front_facing | side_profile` to character model.
6. Point validators at anchor manifest feet_y/head stats instead of forge silhouette guesses.
7. Keep Identity DNA roll order frozen — no coupling to compositor refactors.

---

*Awaiting approval before any compositor implementation.*
