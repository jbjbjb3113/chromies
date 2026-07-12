# JS Golden-File Parity Test Plan

Compare Python `chromies-engine` compositor output against the existing Node `art-pipeline/generate.js` pipeline for the same seed / token id.

## Goal

Prove byte-for-byte (or explain intentional) parity on:

1. Character + palette selection
2. Trait picks and render picks (post-finalize, post-dedupe)
3. Composited PNG (64×64 role-index buffer → palette render)
4. Trait vector keys used by batch dedupe

## Reference Implementation (JS)

| File | Role |
|------|------|
| `art-pipeline/generate.js` | `pickCharacter`, `pickPalette`, `pickTokenVariants`, `finalizeTokenTraits`, `resolveUniqueTokenTraits`, compositing |
| `art-pipeline/js-rng.js` (or inline) | `mulberry32`, `seedFromStr` |
| `art-pipeline/on-chain-character-bytes.js` | `characterKey()` gender suffix rules |
| `art-pipeline/bridge-mint-data.js` | End-to-end mint path with `TraitDedupeGuard` |

## Python Counterparts

| File | Role |
|------|------|
| `chromies-engine/engine/js_rng.py` | RNG parity |
| `chromies-engine/engine/compositor.py` | Roll + composite |
| `chromies-engine/engine/batch_guards.py` | Dedupe / combo-cap keys |
| `chromies-engine/engine_data/*.json` | Schema exported from art (v2.0.0) |

## Comparison Strategy

### Phase A — Metadata golden files (recommended first)

For each seed in a fixed fixture list (e.g. `[1, 5, 42, 12345, 9999]`):

1. **JS:** Run a small Node script calling `resolveUniqueTokenTraits(tokenId, traits, dedupeGuard, { character, paletteKey })` with `metadataOnly: true` or full compose without writing to `components/`.
2. **Python:** `generate_chromie(seed, token_id)` with `BatchGuardContext` (or none for single-token fixtures).
3. **Assert JSON equality** on normalized blocks:

```json
{
  "character": { "name", "gender", "archetype_key" },
  "palette": "...",
  "traits": { "slot": "variantName", ... },
  "render_traits": { ... },
  "trait_vector_key": "...",
  "near_dup_combo_key": "...",
  "visual_combo_key": "..."
}
```

Normalization rules:

- Sort slot keys alphabetically
- Map `None` / missing to `"None"`
- Use same `characterKey` rules (`HeroA_Male`, `SideProfile_Female`, etc.)

### Phase B — PNG hash parity

1. JS writes PNG to `chromies-engine/reference_only/js_golden/{seed}.png` (read-only reference dir).
2. Python writes to `chromies-engine/generated/parity_test/{seed}.png`.
3. Compare SHA-256 of PNG bytes.

**Expected drift sources to document if hashes differ:**

- Palette table source (`chromies-config` vs inline JS)
- Role-index grid size / anchor offsets
- Missing SP asset gating differences
- Anti-stack reroll ordering

### Phase C — Batch dedupe parity (multi-token)

Run seeds `1..N` with shared `TraitDedupeGuard` / `BatchGuardContext` on both sides.

Compare:

- Per-token reroll logs (`dedupe_rerolls`, `combo_cap_rerolls`)
- Final trait vector key set (must be unique in both)
- Order of registration (token ids)

## Fixture Data Needed

| Path | Purpose |
|------|---------|
| `engine_data/art_schema.json` | Slot defs, weights — must match JS `traits` object |
| `engine_data/slot_schema.json` | Render order, side-profile flags |
| `engine_data/compatibility_from_art.json` | Eligibility rules |
| `art-pipeline/components/` | Source PNGs (read-only; both pipelines read same files) |
| `reference_only/js_golden/manifest.json` | Seed → expected trait JSON + png sha256 |
| `reference_only/js_golden/*.json` | Per-seed expected metadata (generated once from JS) |

## Minimal Node Harness (not implemented)

```javascript
// scripts/export-js-golden.mjs (to add under art-pipeline or chromies-engine/scripts)
import { loadTraits, resolveUniqueTokenTraits, TraitDedupeGuard, composeChromie } from '../art-pipeline/generate.js';

const seeds = [1, 5, 42, 12345];
const dedupe = new TraitDedupeGuard();
for (const seed of seeds) {
  const resolved = resolveUniqueTokenTraits(seed, traits, dedupe, { loadBuffers: true });
  // write manifest entry + optional PNG
}
```

## Minimal Python Test (simple to add)

```python
# tests/test_js_golden_parity.py
import json
from pathlib import Path
from engine.compositor import generate_chromie
from engine.batch_guards import build_trait_vector_key

GOLDEN = Path("reference_only/js_golden")

def test_trait_metadata_parity_seed_12345():
    expected = json.loads((GOLDEN / "12345.json").read_text())
    result = generate_chromie(12345, 1)
    actual = build_compositor_metadata_block(result)
    assert actual["render_traits"] == expected["render_traits"]
```

## CI Recommendation

1. Generate JS goldens only when art schema version bumps (manual step).
2. CI runs Python parity tests read-only against committed goldens.
3. Fail on trait mismatch; PNG mismatch can be `xfail` until compositor pixel parity is closed.

## Current Status

- **Not implemented** — plan only.
- **Blockers for full PNG parity:** confirm JS and Python use identical palette renderer and anchor manifest (`engine_data/anchors.json`).
- **Low-hanging fruit:** RNG unit tests already exist; extend with 5-seed metadata fixtures once JS exporter script is run once.

## Acceptance Criteria for 1K Dry Run

- ≥ 5 seeds pass metadata golden parity
- PNG parity on ≥ 3 seeds OR documented diff table with owner sign-off
- Batch dedupe produces zero duplicate trait vectors on `1..100` in both pipelines
