# Chromies Identity Forge

Deterministic, rule-based engine for original 64×64 pixel identities. Same seed always produces the same character image and metadata.

This is **not** LoRA training or AI image generation. Traits are PNG layers, rules live in JSON, and validation enforces the visual constitution programmatically.

## Principles

- Chromies have their own visual constitution — do not copy Normies.
- Normies exist only as a **negative similarity reference** (fingerprints, never art).
- Every Chromie has **two independent layers** forged from the same seed:
  - **Appearance** — visual traits rendered as PNG layers
  - **Identity DNA** — non-visual traits (temperament, alignment, etc.) stored in metadata only
- Generation is fully deterministic: pin dependencies and never rely on filesystem iteration order.

## Project layout

```
chromies-engine/
├── constitution.md          # Visual constitution (hard rules)
├── traits/                  # Layer PNGs, rarity, conflicts, identity DNA tables
├── palettes/                # Palette families + rules
├── reference/               # Normies fingerprints (hashes only)
├── engine/                  # Python source
├── candidates/              # Generated output (gitignored)
├── finals/                  # Human-approved identities
├── similarity/              # Fingerprint DB + rejection log
└── reports/                 # Run statistics
```

## Setup

```bash
cd chromies-engine
python -m venv .venv

# Windows (use `py` if `python` is not on PATH)
py -m venv .venv
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

## First test generation

Build or refresh placeholder trait PNG layers (required once):

```bash
python -m engine.build_placeholder_layers
```

Generate a single identity:

```bash
python -m engine.generate_character --seed 12345 --token-id 1
```

Output is routed into a review bucket:

```
candidates/{passed|review|rejected}/
  images/chromie_0001.png
  metadata/chromie_0001.json
  review_cards/chromie_0001.json
```

Optional custom root (bucket subfolders still apply):

```bash
python -m engine.generate_character --seed 12345 --token-id 1 --out candidates/test
```

Generate three sequential identities:

```bash
python -m engine.generate_character --seed 1000 --count 3 --token-id 10
```

Each identity lands in `candidates/passed`, `candidates/review`, or `candidates/rejected` based on validation and Identity Strength.

Inspect rolled appearance and identity DNA (no render):

```bash
python -m engine.roll_traits --seed 42
python -m engine.roll_traits --seed 42 --appearance-only
python -m engine.roll_traits --seed 42 --identity-only
```

## Identity DNA

Each Chromie is a **dual-layer being**: what you see (appearance) and who they are (identity DNA). Both are rolled deterministically from the same forge seed via **independent PRNG streams** (`SeedSequence.spawn`).

| Stream | Rolled from | Affects PNG? |
|--------|-------------|--------------|
| `appearance` | `traits/rarity.json` | Yes |
| `identity_dna` | `traits/identity_dna.json` | No — metadata only |

Identity DNA fields:

- `temperament`
- `origin_signal`
- `alignment`
- `memory_affinity`
- `voice_profile`
- `embodiment_bias`
- `continuity_class`

Metadata schema (`1.3.0`) stores both under `identity`:

```json
{
  "identity": {
    "layer_model": "appearance + identity_dna",
    "note": "Appearance is rendered visually. Identity DNA is metadata-only. ...",
    "appearance": { "head_shape": "Taper", "...": "..." },
    "identity_dna": { "temperament": "Wary", "...": "..." }
  }
}
```

Re-run the same seed and confirm the PNG SHA256 in metadata matches:

```bash
python -m engine.generate_character --seed 42 --token-id 1
```

## Identity Strength (Phase 2)

**Identity Strength** is a constitutional quality score (0–100). It measures how strongly a forged output reads as a Chromie — **not** rarity, market value, or AI aesthetic judgment.

Eight heuristic sub-scores feed a weighted total:

| Score | What it measures |
|-------|------------------|
| `silhouette_strength` | Bbox proportions, convexity defects, silhouette breaks |
| `readability` | Pixel discipline, density, thumbnail-downscale retention |
| `palette_harmony` | Palette compliance, hue separation, saturation |
| `mask_clarity` | Mask-zone fill, row contrast, seam breaks |
| `mark_visibility` | Forehead-mark pixel presence |
| `asymmetry_intentionality` | Asymmetry sweet spot + hair centroid offset |
| `uniqueness_proxy` | Structural trait diversity (not rarity weights) |
| `chromie_presence` | Constitutional checklist pass rate |

Metadata block (schema `1.2.0`):

```json
"identity_strength": {
  "silhouette_strength": 78,
  "readability": 82,
  "palette_harmony": 71,
  "mask_clarity": 75,
  "mark_visibility": 85,
  "asymmetry_intentionality": 80,
  "uniqueness_proxy": 62,
  "chromie_presence": 88,
  "total": 77,
  "note": "Identity Strength measures constitutional fit, not rarity or market value."
}
```

Scores are computed deterministically from validation metrics — no ML, no randomness.

## Review Buckets (Phase 3)

Every forged Chromie is **automatically routed** into one of three buckets under `candidates/`:

| Bucket | Path | Criteria |
|--------|------|----------|
| **passed** | `candidates/passed/` | Hard validation pass **and** Identity Strength total ≥ 85 |
| **review** | `candidates/review/` | Hard validation pass **and** total 70–84 |
| **rejected** | `candidates/rejected/` | Hard validation failure **or** total < 70 |

**Hard validation** uses strict constitution thresholds (not Phase 1 lenient mode). Failures are checked in order: pixel → palette → silhouette.

### Per-bucket output

Each routed identity writes three files:

```
candidates/{bucket}/
├── images/chromie_0001.png          # 64×64 RGBA sprite
├── metadata/chromie_0001.json       # full internal record (schema 1.3.0)
└── review_cards/chromie_0001.json   # short human-review summary
```

### Review card (short JSON)

```json
{
  "token_id": 1,
  "bucket": "review",
  "reason": "IDENTITY_STRENGTH_REVIEW",
  "reasons": ["Identity Strength total 79 (review band 70–84)"],
  "hard_validation_pass": true,
  "identity_strength_total": 79,
  "validation": { "pixel": true, "palette": true, "silhouette": true },
  "headline_traits": { "head_shape": "Broad", "mask_type": "Halfplate", "..." : "..." },
  "weakest_scores": [{ "metric": "asymmetry_intentionality", "score": 64 }]
}
```

### Reason codes

| Code | Meaning |
|------|---------|
| `PASSED` | Auto-clean — ready for human spot-check |
| `IDENTITY_STRENGTH_REVIEW` | Constitutional pass, strength 70–84 |
| `IDENTITY_STRENGTH_LOW` | Strength below 70 |
| `VALIDATION_PIXEL_FAILED` | Orphans, edge-touch, or non-binary alpha |
| `VALIDATION_PALETTE_FAILED` | Out-of-palette colors or insufficient hues |
| `VALIDATION_SILHOUETTE_FAILED` | Proportions, asymmetry, or silhouette breaks |

Full metadata includes a matching `review` block with bucket, reason, and `hard_validation` breakdown.

### Review workflow

1. **Generate** — `python -m engine.generate_character --seed N --token-id ID`
2. **Scan passed** — quick human eyes on `candidates/passed/review_cards/`
3. **Review queue** — inspect `candidates/review/`; fix art or thresholds if patterns emerge
4. **Reject audit** — `candidates/rejected/` is the originality/constitution audit trail
5. **Promote** — human-approved passed tokens move to `finals/` (Phase 8)

> Placeholder trait art often fails **hard validation** until final PNG layers ship. Lenient validation in metadata (`validation.*.pass`) may still be true while routing rejects on strict rules.

## Phase roadmap

| Phase | Focus |
|-------|--------|
| 1 | Constitution, scaffold, placeholder generation |
| 2 | Identity Strength scoring |
| 3 | Review bucket routing |
| 4 | Trait PNGs + anchors |
| 5 | Full layer assembly + determinism canary |
| 6 | Hard validators tuning + similarity checker |
| 7 | Review dashboard |
| 8 | Collection run + finals promotion |

See `constitution.md` and the system design spec for rule details.

## Engine version

Current: `0.4.0` (Phase 3 — Review Buckets)
