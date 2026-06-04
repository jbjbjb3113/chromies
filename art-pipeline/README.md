# Chromies Hand-Art Pipeline

Three files that turn your Aseprite component PNGs into composited Chromies.

## Setup (once)

From this folder:

```
npm install
mkdir components output
```

## Files

- **chromies-config.js** — palette, role slots, component definitions. Edit this when you change drawing colors or add components.
- **extract-components.js** — reads PNGs from `./components/`, maps drawing colors to role slots, writes `./output/components-data.json`.
- **render-chromie.js** — composites layers, applies a palette family, writes PNG + SVG to `./output/`.

## Daily workflow

1. **Draw** each component in Aseprite as a separate 64×64 RGBA PNG with transparent background.
2. **Save** them to `./components/` with the filenames in `chromies-config.js` (e.g., `Hero_A_Head.png`, `Hero_A_Hair.png`, etc.).
3. **Use only the exact hex codes** declared in `chromies-config.js` under each component's `drawColors`. These are the "labels" the extractor reads.
4. **Extract:** `npm run extract` — produces `./output/components-data.json`.
5. **Render:** `npm run render` — produces `./output/chromie_signal.png` (64×64), `chromie_signal_1024.png` (upscaled for viewing), and `chromie_signal.svg` (on-chain format).
6. **Try another palette:** `node render-chromie.js ACID` (once you've filled in the ACID palette colors in the config).

## Drawing colors → role slots

When drawing in Aseprite, the **specific colors you use are labels**, not final output. They get translated to role slots by the extractor, then a palette family fills the slots with real colors at render time.

For the SIGNAL palette, the recommended Aseprite drawing colors are the same as the final SIGNAL palette colors for each role — see `chromies-config.js`. This lets you preview while drawing.

If you want to use *different* colors while drawing (e.g., grays for the head so it's easier to see contrast), update the `drawColors` map in `chromies-config.js` to match.

## When a pixel doesn't match a declared color

The extractor snaps unknown pixels to the closest declared role color using RGB distance. If the closest match is too far away, it logs a warning showing the unmatched color and how many pixels it appeared in. This catches:
- Anti-aliasing artifacts (Aseprite's pencil tool shouldn't produce these, but text tool will)
- Forgotten color updates in the config
- Stray pixels from another tool

## Notes

- Components missing from `./components/` are silently skipped, so you can add components incrementally.
- Z-order in the config controls compositing back-to-front. Lower zOrder = drawn first (further back).
- Hood is z-order 5 (behind head), hair is 40 (in front of head), eyes 30, etc. Tweak in the config if needed.
- All output is local. Nothing transits anywhere.
