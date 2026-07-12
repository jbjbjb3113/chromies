# Palette Contract Integration

**Phase status: CLOSED — Sepolia dress rehearsal complete** (2026-07-06)

## Task 0 — Size gate

See [CONTRACT_SIZE_GATE.md](./CONTRACT_SIZE_GATE.md).

| Contract | Runtime bytes | Gate (22,000 B) |
|----------|-------------:|----------------:|
| `ChromaRenderer` (split) | 10,865 | PASS |
| `ChromaPaletteData` | 8,773 | PASS |
| Inline probe (rejected path) | 30,164 | FAIL (expected) |

## Architecture

- **`ChromaPaletteData`** — ownerless, immutable packed RGB table (80 palettes + ERROR magenta)
- **`ChromaRenderer(storage, paletteData, owner)`** — `paletteData` reference is **immutable**
- Deploy order: **ChromaPaletteData → ChromaRenderer**

## Immutability decisions

| Component | Owner | Mutable state | Notes |
|-----------|-------|---------------|-------|
| `ChromaPaletteData` | none | none (constants only) | No admin; table is compile-time hex |
| `ChromaRenderer.paletteData` | — | **immutable** | Set once in constructor |
| `ChromaRenderer` owner | yes | canvas/chroma wiring only | Palette table not upgradeable in-place |

No STOP condition triggered — both immutability requirements satisfied.

## Registry / compiler

- Source: `art-pipeline/palette-registry.json`
- Compiler: `scripts/compile_palette_registry.py`
- CI diff: `scripts/check_palette_registry.py`
- Role index 9: **`shirt_torso`** (legacy alias `hood` documented)
- GOLD (id 27) aligned to **deployed** bytes (not draft config colors)

## Foundry tests (permanent)

| Suite | Tests | Result |
|-------|------:|--------|
| Full `forge test` | 92 | PASS |
| `ChromaPaletteRegistryTest` | 7 | PASS |
| `ChromaPaletteByteStabilityTest` | 2 | PASS |
| `MigratePaletteStackLocalTest` | 1 | PASS |
| `ChromaRendererParityTest` (export) | 1 | PASS |

### Byte-stability

- IDs **0–27, 37**: identical to pre-refactor deployed table (`legacy_deployed_palette_colors.json`)
- IDs **28–36**: registry-compiled normie tables; differ from legacy `% 26` wraparound at shirt slot 9

## Parity harness (real renderer)

`chromies-engine/scripts/parity_harness.py`:

| Run | Result |
|-----|--------|
| Baseline seeds 1–1000 | **1000/1000** zero pixel diff |
| Supplemental (11 missing IDs) | **11/11** zero pixel diff |
| Side-profile tokens (28) | **28/28** pass |
| Agent-grayscale seeds (7) | **7/7** pass |

Report: [payload_first_parity_report.md](./payload_first_parity_report.md)

CI runs harness at **100 seeds** on palette/renderer/packing changes.

## Sepolia deployment — **COMPLETE** (2026-07-06)

Full-stack dress rehearsal on Sepolia (chain 11155111). See [SEPOLIA_DEPLOY_LOG.md](./SEPOLIA_DEPLOY_LOG.md).

| Contract | Address |
|----------|---------|
| ChromaStorage | `0x557933b09005C6254d3884A1F93a03e740920A42` |
| Chroma | `0x8162114c056DfC49045c04C66f1E03b761d81eD5` |
| ChromaCanvasV2 | `0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB` |
| ChromaPaletteData | `0x4Ff9Ef71A403579DdfCaC5294792306ebD38F0a7` |
| ChromaRenderer | `0xE6Ed418e5175cd56b53e1a8af4B8666f66654DE6` |
| PixelMarketplace | `0x8D0b8327bcC96eF62b3de94687490298a52D3079` |

### Dress rehearsal results

| Task | Result |
|------|--------|
| Etherscan verify (6 contracts) | PASS |
| Wiring assertions (`verify_sepolia_wiring.py`) | PASS |
| Artifact verification (`verify_deployed_artifacts.py`) | **PASS** — bytecode + 1280/1280 palette slots |
| Mint dry run (5 tokens, DRY RUN) | **5/5** tokenURI pixel-identical; production reveal root restored |

### Deploy-day verification (Sepolia + mainnet)

After any **palette-stack** deploy, run **before** mint dry run:

```bash
python scripts/verify_sepolia_wiring.py          # wiring (adjust addresses / RPC for target chain)
python scripts/verify_deployed_artifacts.py        # Proof A bytecode + Proof B palette read-back
```

After a **renderer-only** deploy (palette data contract unchanged), run in order:

```bash
python scripts/verify_sepolia_wiring.py          # immutables → paletteData/storage; Chroma.renderer → new renderer
python scripts/verify_deployed_artifacts.py        # renderer bytecode vs HEAD (palette Proof B optional — data unchanged)
python scripts/sepolia_tokenuri_money_test.py    # eth_call tokenURI on inscribed/rich tokens; gas + raster parity
```

**Mainnet renderer deploy day:** same three-step sequence. Set `CHROMA_*_ADDRESS` env vars to live addresses (or extend script defaults), point RPC at mainnet, expect chain ID `1`. Acceptance: masked renderer bytecode match; wiring correct; **no RPC OOG** on production `tokenURI` samples with **0 diff_pixels** vs previews. Palette read-back (**1280/1280**) only required if `ChromaPaletteData` was redeployed. **`KNOWN_DRIFT.md` must be EMPTY and `known_drift.json` must have `"waived_palette_ids": []` — no waivers ship to production.**

Re-test `renderSVG` consumers (`api/server.ts` `/chroma/:id/image.svg`, `/image.png`) — renderer resolved dynamically via `Chroma.renderer()`.

## CI (`.github/workflows/chromies-ci.yml`)

| Stage | Trigger paths |
|-------|---------------|
| `forge test` | contracts, test, script |
| Contract size gate ≤ 22 KB | `ChromaRenderer`, `ChromaPaletteData` |
| Registry compiler diff | `palette-registry.json`, generated artifacts |
| Payload determinism + mint tests | `chromies-engine/engine/**` |
| Parity harness (100 seeds) | palettes, packing, renderer |

## Constraints observed

- Mainnet untouched
- Production mint data blocked (dry-run tokens 1–5 only on Sepolia)
- Source art read-only
