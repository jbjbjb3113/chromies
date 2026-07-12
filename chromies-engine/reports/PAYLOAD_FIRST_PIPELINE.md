# Payload-First Pipeline Design

**Status:** Implemented (Python) — contracts unchanged  
**Date:** 2026-07-06

## Principle

The **inscription payload** `(pixelsHex, traitsHex)` is the single source of truth for what owners see after reveal/inscribe. Previews must be rendered by **decoding that payload**, not by applying the pipeline palette name directly.

## Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Off-chain compositor (traits → layers → role buffer)        │
│   generate_chromie() / composite_chromie()                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ 4096 × uint4 role indices
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Mint payload builder (engine/mint_payload.py)                 │
│   pack_pixels()  → 2048 bytes → pixelsHex                   │
│   encode_traits() → 32 bytes  → traitsHex                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Payload renderer (engine/payload_render.py) — AUTHORITATIVE   │
│   unpack_pixels(pixelsHex)                                  │
│   palette_id = traits[1]                                    │
│   colors = on_chain_palette.palette_colors(palette_id)        │
│   render_role_buffer → preview PNG                            │
└─────────────────────────────────────────────────────────────┘

Compositor direct PNG (render_palette_png + palette_key):
  REFERENCE ONLY — not used for QA sign-off or metadata image URI.
```

## Entry point

```python
from engine.payload_pipeline import generate_chromie_payload

result = generate_chromie_payload(seed=42, token_id=1)
# Authoritative:
result.image_rgba       # decoded preview
result.pixels_hex
result.traits_hex
# Reference only:
result.compositor_preview_rgba
```

## Audit

```powershell
cd chromies-engine
.venv\Scripts\python.exe scripts\payload_parity_audit.py
```

Outputs:

- `reports/payload_first_parity_report.md`
- `reports/payload_first_parity_report.json`

## Out of scope (this phase)

- Running `bridge-mint-data.js` batch
- Contract `_paletteColors` changes
- Wiring `generate_character.py` / smoke_test to payload previews (follow-up)
