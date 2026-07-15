# Palette Registry Design

**Date:** 2026-07-06  
**Status:** Design proposal — **no contract changes**, **no mint-data batch**  
**Companion data:** [`PALETTE_REGISTRY_CANDIDATES.json`](PALETTE_REGISTRY_CANDIDATES.json)  
**Simulation:** [`palette_registry_simulation_1000.json`](palette_registry_simulation_1000.json)

---

## Executive Summary

Mechanical slot-diff analysis of all **42 `_*_SHIRT_*` palettes** shows they differ from their parent base family at **exactly one role slot: index 9 (`hood`)**. No outliers require a mixed encoding scheme.

**Recommended canonical representation: Option A — role-slot remap** (`base_palette_id` + `slot_overrides`), with a **compiler that expands derived entries to full 16-color tables** for all build artifacts (Solidity, JS, Python). Holders still pay a simple indexed lookup at `tokenURI` time; the compact form is the **authoritative registry source**, not the on-chain execution model.

**1000-seed simulation** (registry-expanded colors, seeds 1–1000 matching dry-run baseline): **1000/1000 preview match**, zero pixel diff.

**Current production gap:** 564/1000 dry-run tokens use shirt palettes that encode as byte `0` (SIGNAL) today — largest frequency-weighted render bug.

---

## 1. Inventory: 42 Unencodable Shirt Palettes

All are `{BASE}_SHIRT_{COLOR}` where:

| Dimension | Values |
|-----------|--------|
| Base families (`BASE`) | SIGNAL, ACID, CYAN, GHOST, BLOOD, MOSS (6) |
| Shirt colors (`COLOR`) | RED, PURPLE, ORANGE, OLIVE, GREEN, GOLD, BLUE (7) |
| **Total** | 6 × 7 = **42** |

None appear in `ON_CHAIN_PALETTE_BYTES` today. Encoder warns and writes **`traits[1] = 0` (SIGNAL)**.

### Proposed palette IDs (append-only)

| Range | Content |
|-------|---------|
| 0–37 | Unchanged (existing on-chain bytes) |
| **38–79** | 42 shirt palettes (deterministic: family order × color order) |
| **80+** | Reserved for future clothing colors |

Full per-palette slot diffs: [`PALETTE_REGISTRY_CANDIDATES.json`](PALETTE_REGISTRY_CANDIDATES.json) → `shirt_palettes[]`.

---

## 2. Slot-Diff Measurement (Mechanical)

### Shirt palettes — uniform pattern

```
pattern_summary:
  shirt_palettes_count: 42
  all_shirt_only_hood_diff: true
  unique_diff_slots_across_shirts: [9]
  hood_diff_count: 42
```

For every shirt palette, **only role index 9 (`hood`)** differs from `{BASE}`:

| Field | Example (`SIGNAL_SHIRT_RED`) |
|-------|------------------------------|
| `parent_base` | SIGNAL |
| `parent_rgb` @ slot 9 | `#1c1c26` |
| `child_rgb` @ slot 9 | `#79241e` |
| All other slots 0–8, 10–15 | **identical** to parent |

The `hood` role slot carries shirt/torso garment color in the indexed-color model (crew/hood geometry maps to role 9 during extraction).

### Hair variant palettes (already encoded, separate pattern)

18 palettes `{BASE}_{BLONDE|GREY|RED}` (bytes 6–23) differ **only at slots 13–15** (`hair_dark`, `hair_mid`, `hair_bright`). Documented in candidates JSON → `hair_variant_palettes[]`. These already encode correctly; registry unifies them under the same derived-palette schema.

### Normie legendary palettes (bytes 28–36) — wraparound bug

| Byte | Name | `id % 26` resolves to | Pipeline vs wrapped diff |
|------|------|----------------------|--------------------------|
| 28 | NORMIE_SNOWFRO | CYAN (2) | 16/16 slots differ (placeholder GPL today) |
| 29–36 | … | various wrong families | 16/16 slots differ |

**Root cause:** `ChromaRenderer._paletteColors()` uses `uint8 id = paletteId % 26` for IDs not in `{26, 27, 37}`, so bytes 28–36 render **wrong families**.

**Fix:** Explicit registry entries for IDs 28–36 (full 16-color or derived once hand-colorized palettes ship). **Remove `% 26` wraparound**; replace with explicit bounds table.

---

## 3. Canonical Representation Decision

### Option A: Role-slot remap (RECOMMENDED)

Registry entry (source of truth):

```json
{
  "id": 38,
  "name": "SIGNAL_SHIRT_RED",
  "kind": "derived",
  "base_id": 0,
  "slot_overrides": {
    "9": "#79241e"
  }
}
```

Compiler **expands** to full 16-color array for:

- `ON_CHAIN_PALETTE_BYTES` (JS/Python)
- Solidity `_paletteColors` lookup table (or SSTORE2 blob index)
- Pipeline validation / preview parity tests

**Why not mixed:** All 42 shirt palettes conform to this single rule. Hair variants use the same `derived` kind with overrides at 13–15. Standalone palettes (`ZOMBIE`, `AGENT`, `GOLD`, future Normie finals) use `kind: "full"`.

### Option B: Full 16-color families (rejected as source format)

```json
{
  "id": 38,
  "name": "SIGNAL_SHIRT_RED",
  "kind": "full",
  "colors": ["#e3e5e4", "#1a0d0e", ...]
}
```

Valid as **compiler output**, but redundant for shirts (15/16 slots duplicated across 7 colors × 6 bases). Expansion belongs in the build step, not author maintenance.

### Outliers / source-data fixes

**None** among the 42 shirt palettes. If a future palette differs at slots other than `{9}` for shirts or `{13,14,15}` for hair variants, CI slot-diff tests must fail until the art is corrected or reclassified as `kind: "full"`.

---

## 4. Registry Format (Single JSON Source of Truth)

**Proposed path (with artwork):** `art-pipeline/palette-registry.json`

```json
{
  "version": "1.0.0",
  "roles": ["background", "mask_dark", "..."],
  "max_palette_id": 255,
  "out_of_range_policy": {
    "mint_encode": "reject",
    "tokenuri_render": "fallback_id_0"
  },
  "palettes": [
    {
      "id": 0,
      "name": "SIGNAL",
      "kind": "full",
      "colors": ["#e3e5e4", "..."]
    },
    {
      "id": 38,
      "name": "SIGNAL_SHIRT_RED",
      "kind": "derived",
      "base_id": 0,
      "slot_overrides": { "9": "#79241e" }
    }
  ],
  "shirt_color_index": {
    "RED": 1,
    "PURPLE": 2,
    "ORANGE": 3,
    "OLIVE": 4,
    "GREEN": 5,
    "GOLD": 6,
    "BLUE": 7
  }
}
```

### Rules

1. **`id` is immutable** once mint data exists (same rule as `on-chain-character-bytes.js`).
2. **`kind: "derived"`** — `base_id` + `slot_overrides` only; compiler produces `colors[16]`.
3. **`kind: "full"`** — explicit 16 hex values; used for character-locked and legendary palettes.
4. **No hand-edited** `chromies-config.js` PALETTES, `ChromaRenderer.sol` hex blocks, or Python `ON_CHAIN_PALETTE_BYTES` after registry lands — all generated.

### Compiler outputs (one script)

| Output | Path |
|--------|------|
| Solidity palette lib snippet or SSTORE2 manifest | `contracts/generated/PaletteTable.sol` (TBD) |
| JS byte map | `art-pipeline/generated/on-chain-palette-bytes.js` |
| Python byte map | `chromies-engine/engine_data/on_chain_palette_bytes.json` |
| Expanded colors (debug/CI) | `chromies-engine/engine_data/palette_colors_expanded.json` |

**CI check:** `node scripts/compile-palette-registry.js` (or Python equivalent) → `git diff --exit-code` on all generated paths.

---

## 5. Fixing Palette ID 28–36 Wraparound

### Current (broken)

```solidity
uint8 id = paletteId % 26;
if (id == 0) { return [...SIGNAL...]; }
// ...
```

Bytes 28–36 incorrectly alias to base families 2–10 mod 26.

### Proposed

```solidity
function _paletteColors(uint8 paletteId) internal pure returns (string[16] memory) {
    if (paletteId <= MAX_KNOWN_PALETTE_ID) {
        return _loadExplicit(paletteId);  // table lookup, no modulo
    }
    return _loadExplicit(0);  // fallback SIGNAL — see policy below
}
```

### Out-of-range policy (recommended)

| Context | Behavior |
|---------|----------|
| **Mint encode (off-chain CI)** | **Reject** — unknown palette name → build failure |
| **Inscribe (on-chain)** | Already constrained by merkle leaf from approved encoder |
| **`tokenURI` view** | **Fallback to palette 0 (SIGNAL)** — avoids bricked metadata on legacy/test IDs; emit off-chain monitoring alert |

Do **not** revert `tokenURI` for unknown IDs — marketplaces and wallets call view freely.

---

## 6. Contract Impact Estimates

Estimates are relative; exact bytecode requires implementation PR.

### Option A — Registry source, **expanded table at deploy** (recommended deploy shape)

Compiler emits full 16-color row per palette ID (80 rows after adding 42 shirts).

| Metric | Estimate |
|--------|----------|
| **Deployment gas** | +800K–1.2M gas vs today (42 × 16 × ~32 bytes hex literals + lookup struct) |
| **Contract size** | +6–10 KB bytecode (may require splitter if near 24KB limit) |
| **`tokenURI` read gas** | ~Same as today — single indexed lookup, no runtime merge |
| **SSTORE2 alternative** | Deploy: +200K gas write once; per `tokenURI`: +~2.1K cold read + decode (~5–10K gas total overhead) |

### Option A — **Runtime merge** (base + override at read time)

| Metric | Estimate |
|--------|----------|
| **Deployment gas** | Lower — store 6 bases + 42×7-byte shirt table |
| **Contract size** | +2–3 KB logic |
| **`tokenURI` read gas** | +300–800 gas per call (copy base array + patch slot 9) |
| **Complexity** | Encoder must split `SIGNAL_SHIRT_RED` → base + shirt index OR use expanded ID 38 |

### Option B — Full inline table (source = 80 full rows)

Same deploy/read profile as **expanded Option A**. Rejected as **authoring format** only.

### Recommendation

**Expanded table at deploy** (compiler output of Option A registry). Simplest read path for holders, clearest merkle parity, matches payload-first preview model. Use SSTORE2 only if bytecode size blocks deployment.

---

## 7. Forward Expansion: Adding Clothing Colors

Example: add `SHIRT_TEAL` across all 6 bases (+6 palettes).

1. **Art** — Add `{BASE}_SHIRT_TEAL` to `chromies-config.js` source art colors (or derive hood hex in registry directly after art approval).
2. **Registry** — Append 6 entries to `palette-registry.json`:
   ```json
   { "id": 80, "name": "SIGNAL_SHIRT_TEAL", "kind": "derived", "base_id": 0, "slot_overrides": { "9": "#..." } }
   ```
3. **Extend** `shirt_color_index.TEAL = 8` (metadata only; optional).
4. **Run compiler** — regenerates Solidity + JS + Python artifacts.
5. **CI** — slot-diff test (`only_hood_diff`), expanded-color parity, `git diff` clean.
6. **Deploy** — new renderer or palette table pointer (upgrade path TBD; IDs 80–85 never reuse).
7. **Pipeline** — `traits.json` palette weights reference new names; encoder picks up generated byte map automatically.

No manual edits to `ChromaRenderer.sol` palette/label tables. Trait display labels live in generated `contracts/generated/ChromaTraitLabels.sol` (regen: `py -3 scripts/compile_palette_registry.py`).

---

## 8. 1000-Seed Simulation Results

**Method:** Seeds 1–1000 (dry-run baseline). For each token:

1. Compositor → role buffer (same as dry-run).
2. Build mint payload (encode as today — **broken for shirts**).
3. **Simulated registry render:** expand `palette_key` via canonical 16-color table from `chromies-config` (equivalent to post-registry compiler output).
4. Compare compositor preview vs simulated payload preview pixel-for-pixel.

| Metric | Result |
|--------|--------|
| **Match** | **1000 / 1000** |
| **Mismatch** | **0** |
| **Acceptance criterion** | ✅ Met |

### Frequency context (current broken encoder)

| Category | Tokens (of 1000) | Render impact today |
|----------|------------------|---------------------|
| `_*_SHIRT_*` palettes | **564** | Wrong hood/shirt color (byte 0) |
| Base + hair variant + other | 436 | Mostly correct bytes |

Top shirt offenders today: `SIGNAL_SHIRT_RED` (62), `SIGNAL_SHIRT_PURPLE` (47), `SIGNAL_SHIRT_BLUE/GREEN` (44 each).

Full distribution: [`palette_registry_simulation_1000.json`](palette_registry_simulation_1000.json) → `palette_frequency`.

---

## 9. Implementation Checklist (Post-Approval)

- [ ] Add `art-pipeline/palette-registry.json` (migrate from `PALETTE_REGISTRY_CANDIDATES.json`)
- [ ] Implement `scripts/compile-palette-registry.js`
- [ ] CI: regenerate + diff check
- [ ] Update `bridge-mint-data.js` to import generated bytes (no hand map)
- [ ] Update Python `mint_payload.py` to import generated JSON
- [ ] Contract PR: remove `% 26`, add IDs 38–79 (+ explicit 28–36)
- [ ] Re-run payload parity audit (**live**, not simulation) — target 1000/1000

---

## 10. Related Documents

| Document | Purpose |
|----------|---------|
| [`PAYLOAD_FIRST_PIPELINE.md`](PAYLOAD_FIRST_PIPELINE.md) | Payload-first preview architecture |
| [`renderer_parity_report.md`](renderer_parity_report.md) | Pre-registry parity audit |
| [`payload_first_parity_report.md`](payload_first_parity_report.md) | Updated with 1000-seed simulation |
| [`PALETTE_REGISTRY_CANDIDATES.json`](PALETTE_REGISTRY_CANDIDATES.json) | Mechanical slot-diff data |

---

*No contracts modified. No mint-data batch run.*
