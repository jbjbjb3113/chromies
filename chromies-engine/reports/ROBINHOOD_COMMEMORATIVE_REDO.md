# Robinhood commemorative RE-DO — selection through deploy (2026-07-12)

Full re-do of the Robinhood Chain commemorative collection against the frozen
non-legendary 5,141 dataset (see `ROBINHOOD_DATASET_FREEZE_RULING.md`). The
original 2026-07-11 deploy (`0x10953E4975C35529a5034D54eBC9266cec0CE69D`) is
retired: funds were withdrawn (tx `0x098cb8baa8b7028577e723e040807d766aedf2e2bec3ba56f4cd59eafe8fc902`)
and its address is not reused. `mintOpen` on the NEW contract stays `false` —
flipping it is a manual JB action, out of scope here.

## 1. Selection

- New selection seed: **`chromies-commemorative-redo-v2-2026-07-12`** (retires
  `chromies-commemorative-launch-v1`, which selected against pre-redo trait
  bytes — stale hat encoding, no accessory slot).
- Source dataset: `public/data/mint-data.json` (5,150 tokens, current frozen
  state), pool after excluding the 9 legendary IDs: 5,141.
- Selection manifest sha256 (tokens array):
  `c8b38a72415b06e6f5683ebad8058f1ad7640af800aef96e1e5711c6a2fed07c`
- Checks: 100 entries ✓, 0 legendary leakage ✓, 0 duplicate `pixelsHex` among
  the 100 ✓, deterministic double-run self-check (built into the selection
  script) ✓, semantic parity round-trip via
  `chromies-engine/engine/mint_payload.decode_traits` — 0 `UNKNOWN_` decodes,
  0 errors across all 100 payloads ✓.
- `reports/robinhood/commemorative-100.json` and `reports/robinhood/seed-calldata.json`
  overwritten and committed (commit `64dbd08`).

## 2. Deploy (RH mainnet, chain 4663)

All broadcasts used `--gas-estimate-multiplier 400` (gas *limit* padding only;
actual cost is `gasUsed × gasPrice`, not inflated).

| Contract | Address | Deploy tx | Gas used |
|---|---|---|---|
| `ChromiesCommemorative` (NEW) | `0x3C8C9615889762bDcF9647a3C86C74aFA498a158` | `0xb643ffc4eda3b446f1805fe6c475a6a20843bbc457e36771b039af7c8e26033c` | 1,598,787 |
| `ChromaRendererRobinhood` (NEW) | `0x9C34Bd0c872983e33611f0cF1cF3C1C968516736` | `0xbe0944a96860542fc82fb7b6a5fac5800ec4416bdf0c4c05838e37d6a4cdc1b6` | 4,322,711 |
| `token.setRenderer(...)` | — | `0x724f0f1710c2786ce7fa6a471f7093ebe6caaa95c8706cfe1bfc2be77a00097d` | 46,334 |

`ChromaRendererRobinhood` is wired to the already-verified, reused
`ChromaPaletteData` (`0xb3ad67d60C44E6db461f8957AF7a2f664c01275a`) — no new
palette deployed. `renderer.chromaStorage()` == the new commemorative address;
`token.renderer()` == the new renderer address. Constants confirmed unchanged:
`MINT_PRICE` = 16,900,000,000,000,000 wei (0.0169 ETH), `MAX_SUPPLY` = 100,
`MAX_PER_WALLET` = 2, royalty 500 bps, name/symbol
"Chromies: Robinhood Chain Commemorative" / `CHROMIE-RC`.

Deploy script: `script/robinhood/DeployCommemorativeRedoMainnet.s.sol`.

## 3. Seeding — all 10 batches, per-batch read-back verified

Each batch was seeded via `script/robinhood/SeedCommemorativeTestnet.s.sol`
(chain-agnostic despite the name — driven entirely by `--rpc-url`), then
immediately read back with `scripts/robinhood/verify-seeded-batch.mjs`, which
calls `getPixels()`/`getTraits()` on-chain for every token in the batch and
diffs against `seed-calldata.json`. All 10 batches verified with **0
mismatches** across all 100 tokens before proceeding to the next.

| Batch | Token IDs | Seed tx | Gas used | Verify result |
|---|---|---|---|---|
| 0 | 1–10 | `0xfed6ed8ad1d526d85541fba279261157918a119f382c9d1433b88174192d8d5a` | 5,134,402 | 10/10 OK |
| 1 | 11–20 | `0xac0d2d359104767c2e1cd2c47089b2d70a0a8c363c5c9c40c7b279fa9674caa3` | 5,130,018 | 10/10 OK |
| 2 | 21–30 | `0xe26e2864b3b626f34a17ef7fb65e0adee069a2f2f0716e585746b81c669057cd` | 5,130,271 | 10/10 OK |
| 3 | 31–40 | `0x653ca69233ca3e304bbcced3600791ab74497e448dd9e5b933b328bef45f12b9` | 5,127,050 | 10/10 OK |
| 4 | 41–50 | `0x4edcb9a3bf91d398e434252e0325c340962b2da190e5d564b2222289a8eb100f` | 5,130,774 | 10/10 OK |
| 5 | 51–60 | `0xac5ff659ba0df093cea75b3bcfdd50da2a91d0f992493d724009d45d12d9345a` | 5,141,904 | 10/10 OK |
| 6 | 61–70 | `0x17cfdceac11e43e979a51f5e7653c9cb0b6f38c2156aa71c43ba4520f14a4b83` | 5,128,371 | 10/10 OK |
| 7 | 71–80 | `0xb4824c4ba007993afc6764c35eb914b5286614133e67aa226652549ceaf789ca` | 5,133,748 | 10/10 OK |
| 8 | 81–90 | `0xf726f16e5b6f49fb217f49985dd27da80308f24e6eee7d88c9a40739d0c1c29a` | 5,132,614 | 10/10 OK |
| 9 | 91–100 | `0x9ac5511fe8129e01dd29cd2fc857824d0f785b9d9fad6e3411ce9598651df155` | 5,125,078 | 10/10 OK |

Seeding gas total: 51,314,230. Combined with deploy (5,967,832), total gas for
this redo: **57,282,062**. Deployer balance before: 0.060018144108124405 ETH;
after: 0.056902913457568405 ETH → total ETH spent: **0.003115230666556 ETH**
(actual `gasUsed × gasPrice`, ~0.108 gwei average — the 400% multiplier only
padded the gas *limit* estimate, not what was actually charged).

## 4. Blockscout verification

| Contract | Address | Status |
|---|---|---|
| `ChromiesCommemorative` | `0x3C8C9615889762bDcF9647a3C86C74aFA498a158` | Pass – Verified (bytecode-identical to the prior deploy, Blockscout matched it automatically) |
| `ChromaRendererRobinhood` | `0x9C34Bd0c872983e33611f0cF1cF3C1C968516736` | Pass – Verified (`forge verify-contract --skip-is-verified-check`, GUID `9c34bd0c872983e33611f0cf1cf3c1c9685167366a534f0d`) |

Explorer: `https://robinhoodchain.blockscout.com/address/0x3c8c9615889762bdcf9647a3c86c74afa498a158`
and `https://robinhoodchain.blockscout.com/address/0x9c34bd0c872983e33611f0cf1cf3c1c968516736`.

## 5. Verification gauntlet

Since `mintOpen` stays `false` and nothing is minted, `ChromiesCommemorative.tokenURI()`
reverts (`_requireOwned`) — all live reads below call `ChromaRendererRobinhood.tokenURI(id)`
directly (same renderer, same seeded storage, no ownership gate), which is the
correct way to dry-check a pre-mint-open collection.

**6. Strict PNG validation** (`chromies-engine/engine/png_strict.validate_png_strict`,
64×64, 4-bit indexed, full CRC32 + PIL verify/load) on live `tokenURI(1)` and
`tokenURI(100)`: **PASS** for both.

**7. Attribute-name check:**
- `name` emits `"Chromie #N"` for every sampled token (1, 2, 50, 100) — PASS.
- `Palette` attribute (real on-chain lookup via `paletteData.paletteName`)
  matches the registry decode exactly — PASS.
- **Finding (pre-existing, out of scope):** the other on-chain display labels
  (`Character`, `Hood`, `Shirt`, `Body`, `Bodytattoo`, `Necklace`, `Tattoo`,
  `Beard`, `Mustache`, `Eyes`, `Earrings`, `Glasses`, `Hair`) come from
  `contracts/ChromaRenderer.sol`'s hardcoded per-slot `_xxxLabel()` switch
  functions, which predate the current richer trait-byte registry and
  silently fall back to a generic default (e.g. `"Human"`, `"Signal"`,
  `"None"`) for any byte value they don't recognize. This is **shared,
  unchanged ETH-path code** — the same behavior was already live on the
  original 2026-07-11 commemorative deploy, and editing it is explicitly out
  of scope per the corrected-renderer task ruling ("do not change shared
  ETH-path strings/logic"). 24 such display-label mismatches were observed
  across the 4 sampled tokens; all are this same known limitation, not a
  redo-introduced bug.
- `hat` byte 0 → `"None"`: `Hat` is not emitted as an on-chain attribute at
  all today (same shared-renderer scope boundary), so this was checked at the
  registry level directly — **94 of the 100 selected tokens have hat byte 0,
  and all 94 decode as `"None"` via `decode_traits`** — PASS.

**8. 4x renders** — saved to `chromies-engine/reports/robinhood-redo-verification/`:
- `chromie-1-redo-4x.png`, `chromie-2-redo-4x.png`, `chromie-50-redo-4x.png`,
  `chromie-100-redo-4x.png` (256×256, nearest-neighbor upscale of the live
  decoded PNGs). Untouched 64×64 decodes (`chromie-{1,2,50,100}-redo.png`)
  saved alongside for reference.

**9. Cross-check vs. frozen dataset** — 3 randomly sampled commemorative
tokens (seeded sample: `[50, 76, 80]`, source ETH tokens `#2050`, `#3710`,
`#3902`): raw palette-index pixel buffers decoded straight off the live
on-chain PNG were compared byte-for-byte against the unpacked `pixelsHex`
nibbles for the corresponding source token in `public/data/mint-data.json`
(the frozen dataset) — **all 3 are pixel-identical (0 pixels differ, 4,096
pixels compared each)**.

## 6. Frontend

- `src/lib/robinhood-contract.js`: `CHROMIES_COMMEMORATIVE_ADDRESS[4663]`
  repointed to `0x3C8C9615889762bDcF9647a3C86C74aFA498a158`; collision
  comment updated to note the retired prior address and that the RE-DO's new
  addresses weren't re-checked against testnet nonces (commit `6112582`).
- `npm run build` passes locally (prebuild reveal-data sync/verify + `vite build`
  both green).
- Pushed to `main` (`6112582`) → Cloudflare Pages auto-deployed
  (`https://chromies.art`, bundle `index-DB-AUdyP.js`). Confirmed the deployed
  bundle contains the new address exactly once and zero occurrences of the
  retired address.
- Live contract reads confirmed via `cast call` against the same address the
  page uses: `totalSupply()` = 0, `MAX_SUPPLY()` = 100, `MINT_PRICE()` =
  16,900,000,000,000,000 wei (0.0169 ETH), `mintOpen()` = `false` — the page
  renders 0/100 minted, 0.0169 ETH price, and the disabled "opening soon"
  mint button, not an error state.

## 7. Status

`mintOpen` was **not** flipped — it remains `false` on the new contract.
Flipping it is a manual JB action for after this report is reviewed.
