# Known drift — Sepolia ChromaPaletteData vs HEAD registry

**Status:** Active waivers (5 palette IDs)  
**Machine-readable list:** [`known_drift.json`](./known_drift.json) (consumed by `scripts/verify_deployed_artifacts.py`)

## Waived palette IDs

| ID | Registry name | On-chain state |
|----|---------------|----------------|
| 28 | NORMIE_SNOWFRO | Greyscale placeholder (artist palette in HEAD registry) |
| 29 | NORMIE_ACK | Greyscale placeholder (artist palette in HEAD registry) |
| 32 | NORMIE_TIMPERS | Greyscale placeholder (artist palette in HEAD registry) |
| 33 | NORMIE_DEEKAY | Greyscale placeholder (artist palette in HEAD registry) |
| 34 | NORMIE_PIV | Greyscale placeholder (artist palette in HEAD registry) |

## Reason

HEAD `palette_colors_expanded.json` (compiled from `palette-registry.json`, commit `f3eae41` era) carries repopulated **artist legendary palettes** for the five IDs above. Deployed Sepolia `ChromaPaletteData` (`0x4Ff9Ef71A403579DdfCaC5294792306ebD38F0a7`) still holds the original **greyscale placeholders** baked in at the 2026-07-06 dress-rehearsal deploy.

`ChromaPaletteData` redeploy is **deliberately deferred** until all **9 legendary palettes** are final. Renderer-only redeploys (Pass B.1, universal background ruling) intentionally reuse the existing palette data contract.

## Clearing condition

Redeploy `ChromaPaletteData` once all **9 legendary palettes** are final, then:

1. Remove every ID from `known_drift.json` (`waived_palette_ids` must be `[]`).
2. Delete or empty this file (see mainnet gate below).
3. Re-run `verify_deployed_artifacts.py` — expect Proof B **PASS** (1280/1280) with no waivers.

**Outstanding legendary work (not blocking waiver list edits, blocking redeploy):**

- Token **4698** ruling (conform vs replace)
- **DOPEMIND** final hexes (palette ID 35)
- **Serc** source file

## Verification behavior

`verify_deployed_artifacts.py` Proof B:

- **PASS-WITH-WAIVER** — waived ID differs from deployed (expected until redeploy)
- **stale-waiver** — waived ID matches deployed (drift resolved; remove from waiver list)
- **FAIL** — any divergence outside the waiver list

When this file lists active waivers, `ChromaPaletteData` Proof A bytecode comparison is **skipped** (local artifact embeds HEAD registry; on-chain contract is stale).

## Mainnet deploy gate (per-target, ruled 2026-07-11)

**Waivers are scoped to the deployment they describe.** The gate for any mainnet
deploy is: a **live palette read-back against the deploy target** (all 80 IDs) must
show **ZERO drift** vs `palette-registry.json` at HEAD. No waiver may apply to the
deploy target — i.e. deploying fresh `ChromaPaletteData` bytecode compiled from
current HEAD naturally clears this gate for that new contract instance, regardless
of waivers recorded against a *different*, older deployment (e.g. the Sepolia
contract below).

Ruling: JB, 2026-07-11 (agent chat), option A — per-target scoping. The 5 waivers
below are retagged `target: sepolia`; their values are unchanged.
