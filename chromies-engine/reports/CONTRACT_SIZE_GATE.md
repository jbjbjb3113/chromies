# Contract Size Gate — Task 0

Measured with Foundry `forge build --sizes` (Solc 0.8.24, `optimizer_runs = 200`, `via_ir = true`).

| Metric | Bytes | EIP-170 limit (24,576) | Headroom |
|--------|------:|------------------------:|---------:|
| **ChromaRenderer (pre-refactor, inline palettes + `% 26`)** | 22,038 | 24,576 | 2,538 |
| **InlinePaletteProbe (80-palette if-chain, projected inline)** | 30,164 | 24,576 | **−5,588 (over limit)** |
| **ChromaRenderer (split: delegates to palette data)** | 10,865 | 24,576 | 13,711 |
| **ChromaPaletteData (packed RGB table, 80 palettes)** | 8,773 | 24,576 | 15,803 |
| **Combined renderer + palette data (deployed pair)** | 19,638 | 24,576 | 4,938 |

## Gate decision

- **~22 KB inline threshold:** 22,528 bytes. Pre-refactor renderer already consumed 22,038 bytes — only **490 bytes** remained before hitting the threshold.
- **Projected inline 80-palette table:** **30,164 bytes** — exceeds EIP-170 by **5,588 bytes** and exceeds the ~22 KB gate by **7,636 bytes**.

**Result: STOP inline expansion. Approved path is the split-data contract:**

- `ChromaPaletteData` — immutable packed palette table (auto-generated from `art-pipeline/palette-registry.json`).
- `ChromaRenderer` — slim renderer; `paletteData.paletteColors(id)` with explicit bounds check (no `% 26`).

`InlinePaletteProbe.sol` lives under `contracts/test/size/` and is excluded from default builds (`foundry.toml` `ignored_paths`) but can be measured under a size-probe profile when needed.

## Notes

- Palette data contract size is stable as palettes are added via registry compile (table is hex-packed constants, not per-palette if-chains).
- Renderer headroom (~13.7 KB) restores room for SVG/metadata fixes without redeploying palette bytes.
