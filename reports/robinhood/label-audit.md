# On-chain trait label audit — `ChromaRenderer` vs registry

**Date:** 2026-07-14  
**Scope:** Read-only audit (pre-fix). Labels were subsequently moved to generated `ChromaTraitLabels.sol`.

## Regenerating `ChromaTraitLabels.sol`

| What | Detail |
|------|--------|
| **Authoritative script (run this)** | `scripts/compile_palette_registry.py` |
| **Command** | `py -3 scripts/compile_palette_registry.py` |
| **CI diff gate** | `py -3 scripts/check_mint_encoder.py` |
| **Implementation module** | `scripts/trait_byte_registry.py` (`write_trait_labels_sol`) — library only, not a CLI |
| **Trait-byte source** | `art-pipeline/trait-byte-registry.json` |
| **Character-byte source** | `ON_CHAIN_CHARACTER_BYTES` in `scripts/trait_byte_registry.py` (slot `traits[0]`) |
| **Palette labels** | `ChromaPaletteData.paletteName()` — same compile script, from `palette-registry.json` |
| **Co-generated with** | `art-pipeline/generated/on-chain-trait-bytes.js` (must stay in sync) |
| **Post-regen deploy** | New `ChromaRenderer` / `ChromaRendererRobinhood` deploy + `setRenderer()` (labels are in contract bytecode) |

**Workflow after a registry edit:**

1. Edit `art-pipeline/trait-byte-registry.json` (and/or character bytes in `trait_byte_registry.py` if slot 0 changes).
2. Run `py -3 scripts/compile_palette_registry.py`.
3. Run `py -3 scripts/check_mint_encoder.py` — commit if clean.
4. Run `py -3 scripts/robinhood/verify-commemorative-100-parity.py` before redeploy (label + PNG regression).
5. Redeploy renderer; do **not** re-seed commemorative payloads.

Do **not** hand-edit `contracts/generated/ChromaTraitLabels.sol` or reintroduce `_xxxLabel()` ladders in `ChromaRenderer.sol`.

---

## Source files (audit snapshot — pre-fix)

| Role | Path |
|------|------|
| Label functions (all 13) | `contracts/ChromaRenderer.sol` lines 256–360 |
| Robinhood subclass | `contracts/robinhood/ChromaRendererRobinhood.sol` — **inherits label logic unchanged**; overrides only `_tokenName` / `_tokenDescription` |
| `traitsHex` slot indices | `art-pipeline/bridge-mint-data.js` (`TRAIT_SLOTS`), `chromies-engine/engine/mint_payload.py` (`TRAIT_SLOT_SPECS`), `art-pipeline/generated/on-chain-trait-bytes.js` (`TRAIT_SLOT_INDEX`) |
| Trait-byte registry | `art-pipeline/generated/on-chain-trait-bytes.js` (`TRAIT_BYTE_TABLES`) |
| Character-byte registry | `art-pipeline/generated/on-chain-character-bytes.js` (`ON_CHAIN_CHARACTER_BYTES`) |

## Methodology

- **Grep pattern:** `function _*Label(uint8` — 13 matches, all in `ChromaRenderer.sol`; zero in `ChromaRendererRobinhood.sol`.
- **Trait slot:** `traits[n]` index used in `_encodeTokenJson` (`ChromaRenderer.sol` lines 125–153).
- **Ceiling:** highest `uint8` byte value with an explicit `if (value == …)` branch (not the fall-through `return`).
- **Label function count:** number of distinct byte values reached by explicit `if` branches (combined conditions like `value == 0 \|\| value == 1` count as **2**).
- **Registry count:** `Object.keys(table).length` in the authoritative generated registry (one row per named variant).
- **Gap:** `registry_count − label_function_count`.
- **Fall-through:** final `return` when no branch matches. Confirmed: **none of these functions revert**; all are `pure` and always return a string.

## Palette slot (no `_xxxLabel`)

`traits[1]` is decoded via **`paletteData.paletteName(uint8(traits[1]))`** (line 127), not a hardcoded switch. Omitted from the table below; palette registry has **80** entries in `ON_CHAIN_PALETTE_BYTES`.

---

## Label function audit table

| Function | `traits` index | Registry table | Registry count | Label count | Gap | Ceiling (label) | Registry max byte | Fall-through returns | Emitted in JSON? |
|----------|---------------:|----------------|---------------:|------------:|----:|----------------:|------------------:|----------------------|------------------|
| `_characterLabel` | **0** | `ON_CHAIN_CHARACTER_BYTES` | 9 | 6 | **3** | 8 | 8 | **`"Human"`** (not `"None"`) | Yes — `Character` |
| `_hoodLabel` | **2** | `TRAIT_BYTE_TABLES.hood` | 13 | 2 | **11** | 1 | 12 | `"None"` | Yes — `Hood` |
| `_shirtLabel` | **3** | `TRAIT_BYTE_TABLES.shirt` | 13 | 4 | **9** | 3 | 12 | `"None"` | Yes — `Shirt` |
| `_bodyLabel` | **4** | `TRAIT_BYTE_TABLES.body` | 9 | 5 | **4** | 4 | 8 | `"None"` | Yes — `Body` |
| `_bodytattooLabel` | **5** | `TRAIT_BYTE_TABLES.bodytattoo` | 7 | 5 | **2** | 4 | 6 | `"None"` | Yes — `Bodytattoo` |
| `_necklaceLabel` | **6** | `TRAIT_BYTE_TABLES.necklace` | 24 | 7 | **17** | 6 | 23 | `"None"` | Yes — `Necklace` |
| `_tattooLabel` | **7** | `TRAIT_BYTE_TABLES.tattoo` | 25 | 5 | **20** | 4 | 24 | `"None"` | Yes — `Tattoo` |
| `_beardLabel` | **9** | `TRAIT_BYTE_TABLES.beard` | 17 | 3 | **14** | 2 | 16 | `"None"` | Yes — `Beard` |
| `_mustacheLabel` | **10** | `TRAIT_BYTE_TABLES.mustache` | 10 | 2 | **8** | 1 | 9 | `"None"` | Yes — `Mustache` |
| `_eyesLabel` | **11** | `TRAIT_BYTE_TABLES.eyes` | 28 | 2 | **26** | 1 | 27 | **`"Signal"`** (not `"None"`) | Yes — `Eyes` |
| `_earringsLabel` | **12** | `TRAIT_BYTE_TABLES.earrings` | 8 | 2 | **6** | 1 | 7 | `"None"` | Yes — `Earrings` |
| `_glassesLabel` | **13** | `TRAIT_BYTE_TABLES.glasses` | 37 | 4 | **33** | 3 | 36 | `"None"` | Yes — `Glasses` |
| `_hairLabel` | **14** | `TRAIT_BYTE_TABLES.hair` | 63 | 8 | **55** | 7 | 62 | `"None"` | Yes — `Hair` |

### Per-function detail

#### `_characterLabel` — `traits[0]`

| Byte | Label return |
|-----:|--------------|
| 0, 1 | `"Human"` |
| 2 | `"Alien"` |
| 3 | `"Cat"` |
| 4 | `"Agent"` |
| 8 | `"Zombie"` |
| *all other* | **`"Human"`** |

Registry bytes **not** explicitly named: **5** (`SideProfile_Male`), **6** (`SideProfile_Female`), **7** (`Chubby_Male`) → all fall through to **`"Human"`** (mislabel, not `"None"`).

#### `_hoodLabel` — `traits[2]`

| Byte | Label return |
|-----:|--------------|
| 0 | `"None"` |
| 1 | `"Classic"` |
| *all other* | `"None"` |

#### `_shirtLabel` — `traits[3]`

| Byte | Label return |
|-----:|--------------|
| 0 | `"None"` |
| 1 | `"Crew"` |
| 2 | `"Tank"` |
| 3 | `"Tank_Female"` |
| *all other* | `"None"` |

#### `_bodyLabel` — `traits[4]`

| Byte | Label return |
|-----:|--------------|
| 0 | `"None"` |
| 1 | `"Default"` |
| 2 | `"Female"` |
| 3 | `"Female_Tank"` |
| 4 | `"Alien"` |
| *all other* | `"None"` |

Registry bytes **not** explicitly named include **5** (`Tank`), **6** (`Zombie`), **7** (`Agent`), **8** (`Chubby`).

#### `_bodytattooLabel` — `traits[5]`

| Byte | Label return |
|-----:|--------------|
| 0–4 | `None`, `UnderArmour`, `AkuHeart`, `Pyramid`, `Normies` |
| *all other* | `"None"` |

Registry bytes **not** explicitly named: **5** (`Male_AkuHeart`), **6** (`Male_Normies`).

#### `_necklaceLabel` — `traits[6]`

| Byte | Label return |
|-----:|--------------|
| 0–6 | `None`, `Male_Chain`, `Female_Chain`, `Female_Ornate`, `Female_Flower`, `Female_UpsideDownCross`, `Female_Opal` |
| *all other* | `"None"` |

Registry spans bytes **0–23**; label ceiling **6**.

#### `_tattooLabel` — `traits[7]`

| Byte | Label return |
|-----:|--------------|
| 0–4 | `None`, `Signal`, `Thug`, `Marks`, `Scar` |
| *all other* | `"None"` |

Registry spans bytes **0–24**; label ceiling **4**.

#### `_beardLabel` — `traits[9]`

| Byte | Label return |
|-----:|--------------|
| 0–2 | `None`, `Full`, `Goat` |
| *all other* | `"None"` |

Registry spans bytes **0–16**; label ceiling **2**.

#### `_mustacheLabel` — `traits[10]`

| Byte | Label return |
|-----:|--------------|
| 0–1 | `None`, `Thick` |
| *all other* | `"None"` |

Registry spans bytes **0–9**; label ceiling **1**.

#### `_eyesLabel` — `traits[11]`

| Byte | Label return |
|-----:|--------------|
| 0 | `"Signal"` |
| 1 | `"Alien"` |
| *all other* | **`"Signal"`** |

Registry spans bytes **0–27** (28 named variants including `Chubby_Squint_Right` @ 9, `None` @ 23). Unmapped bytes silently become **`"Signal"`**, not `"None"`.

#### `_earringsLabel` — `traits[12]`

| Byte | Label return |
|-----:|--------------|
| 0–1 | `None`, `Stud` |
| *all other* | `"None"` |

Registry spans bytes **0–7**; label ceiling **1**.

#### `_glassesLabel` — `traits[13]`

| Byte | Label return |
|-----:|--------------|
| 0–3 | `None`, `Shades`, `Neo`, `VR` |
| *all other* | `"None"` |

Registry spans bytes **0–36**; label ceiling **3**.

#### `_hairLabel` — `traits[14]`

| Byte | Label return |
|-----:|--------------|
| 0–7 | `None`, `Mohawk`, `Pompadour`, `MrT`, `Afro`, `Dreads`, `Surfer`, `FadeRight` |
| *all other* | `"None"` |

Registry spans bytes **0–62** (63 named variants). Commemorative #1 uses byte **14** (`Chubby_FadeRight`) → falls through to **`"None"`** while pixels show hair.

---

## Registry slots with **no** `_xxxLabel` (not in grep results)

These bytes are encoded in `traitsHex` by the pipeline but **not** emitted as JSON attributes today:

| Slot key | `traits` index | Registry count | Registry max byte | Notes |
|----------|---------------:|---------------:|------------------:|-------|
| `mask` | **8** | 1 | 0 | Only `None`; skipped in JSON assembly (index 8 unused in attribute block) |
| `head_shape` | **19** | 3 | 2 | Derived slot; no on-chain attribute |
| `hat` | **20** | 16 | 15 | No on-chain attribute |
| `accessory` | **21** | 2 | 1 | No on-chain attribute |

`traits[15]` / `traits[16]` (mutation, drift) are retired — always 0; no label functions.

---

## Fall-through behavior summary

| Fall-through return | Functions |
|---------------------|-----------|
| `"None"` | `_hoodLabel`, `_shirtLabel`, `_bodyLabel`, `_bodytattooLabel`, `_necklaceLabel`, `_tattooLabel`, `_beardLabel`, `_mustacheLabel`, `_earringsLabel`, `_glassesLabel`, `_hairLabel` |
| **`"Human"`** | `_characterLabel` only |
| **`"Signal"`** | `_eyesLabel` only |

**No function reverts.** Wrong-byte behavior is always a **silent string default**, never an error or a non-zero garbage label.

---

## Gap ranking (largest registry − label mismatches)

| Rank | Slot | Gap | Commemorative #1 impact |
|-----:|------|----:|-------------------------|
| 1 | Hair [14] | 55 | **Yes** — byte 14 `Chubby_FadeRight` → JSON `None` |
| 2 | Glasses [13] | 33 | No on #1 (byte 0) |
| 3 | Eyes [11] | 26 | **Yes** — byte 9 `Chubby_Squint_Right` → JSON `Signal` |
| 4 | Tattoo [7] | 20 | No on #1 (byte 0) |
| 5 | Necklace [6] | 17 | No on #1 (byte 0) |
| 6 | Beard [9] | 14 | No on #1 (byte 0) |
| 7 | Hood [2] | 11 | No on #1 (byte 0) |
| 8 | Shirt [3] | 9 | No on #1 (byte 0) |
| 9 | Mustache [10] | 8 | No on #1 (byte 0) |
| 10 | Earrings [12] | 6 | No on #1 (byte 0) |
| 11 | Body [4] | 4 | **Yes** — byte 8 `Chubby` → JSON `None` |
| 12 | Character [0] | 3 | **Yes** — byte 7 `Chubby_Male` → JSON `Human` |
| 13 | Bodytattoo [5] | 2 | No on #1 (byte 0) |

---

## Robinhood inheritance note

`ChromaRendererRobinhood` adds **zero** label overrides. Every commemorative `tokenURI` attribute string comes from generated `ChromaTraitLabels.sol`, imported by shared `ChromaRenderer.sol`. Fixing labels requires regenerating via `compile_palette_registry.py` and redeploying the renderer (or adding overrides in `ChromaRendererRobinhood.sol` — not done today).
