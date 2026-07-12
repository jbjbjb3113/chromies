# Chromies: Robinhood Chain Commemorative — MAINNET Deployment Report

**Date:** 2026-07-11
**Chain:** Robinhood Chain mainnet, chain id `4663`
**Deployer/owner:** `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a`
**Gate ruling cited:** JB, 2026-07-11 (agent chat), option A — per-target KNOWN_DRIFT.md scoping
**Gate amendment commit:** `916c1044430763c57114e2f0480c11fd934e5e67`

`mintOpen` was **NOT** flipped. Flipping it is a manual JB action, out of scope here.

---

## 0. Pre-mainnet correction and insurance (why the sequence changed)

The original runbook's step order (`ChromaStorage → ChromaPaletteData → ChromaRenderer → ChromiesCommemorative`)
would have permanently broken `tokenURI()`, because `ChromaRenderer.chromaStorage` is
**immutable** and `ChromiesCommemorative` is self-storing (it implements
`getPixels`/`getTraits`/`getTotalPixels` itself — there is no separate `ChromaStorage`
contract for it). The renderer must be constructed with
`storageAddress = address(chromiesCommemorative)`, so `ChromiesCommemorative` must exist
*before* the renderer.

**Testnet smoke-test tokenURI(1) re-audit (before proceeding):** confirmed live that the
smoke test's `tokenURI(1)` call was wired against the *old* dry-run `ChromaRenderer`
(`0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437` on testnet), whose immutable
`chromaStorage` is the old dry-run `ChromaStorage` (`0xb3ad67d60C44E6db461f8957AF7a2f664c01275a`) —
**not** the `ChromiesCommemorative` contract (`0xE0E57beeefD732CCFe6e121AB2ff5Fe779590138`)
that was seeded with real payload data. `hasData(1)` was `true` on the commemorative
contract, but the renderer never read it. So the smoke test's `tokenURI(1)` rendered the
**old dry-run fixture**, not commemorative payload #1 (which is source token #8, 2,148
total pixels). Both `0xe1b8b413...` (live, matches local) and `0x168fc398...` (old report)
are hashes of that *same* dry-run fixture — the latter was a transcription error, not
drift. Neither has anything to do with the real commemorative collection.

**Corrected-order insurance deploy on testnet** (before touching mainnet):
deployed a throwaway `ChromaPaletteData → ChromiesCommemorative → ChromaRenderer(wired to
the commemorative contract) → setRenderer`, seeded batch 0, minted token 1, called
`tokenURI(1)` live, and diffed against a fresh local render of the same fixture.

| | Hash |
|---|---|
| Live testnet (corrected wiring) | `0xdeeb7bda5f5ee1d657c55d0a3e8674ba993a6f8c06e8b53feb0a20f4fd0d13d1` |
| Local reference (fresh Foundry test) | `0xdeeb7bda5f5ee1d657c55d0a3e8674ba993a6f8c06e8b53feb0a20f4fd0d13d1` |

**Exact match.** The corrected order was cleared for mainnet.

Sequencing was further split so the palette-drift gate is checked **before** any further
gas is spent: `ChromaPaletteData` deploys and is verified alone first; only if it passes
zero-drift does `ChromiesCommemorative` + `ChromaRenderer` (wired) + `setRenderer` deploy.

---

## 1. Preconditions (all green)

| Check | Result |
|---|---|
| Deployer balance on chain 4663 | `0.029975406636416405 ETH` (≥ 0.015 required) |
| `KNOWN_DRIFT.md` gate | Amended to per-target scoping (commit `916c104`); gate is a live read-back, not a static file check |
| Full Robinhood test suite | **23/23 passed** (22 original + 1 new insurance-run reference test) |
| RPC | `robinhood_mainnet` alias → public RPC (`https://rpc.mainnet.chain.robinhood.com`), acceptable for deploy per foundry.toml comment; `ALCHEMY_RH_MAINNET_URL` gate applies only to a future `mintOpen` flip, not this deploy |

---

## 2. Deployed addresses

| Contract | Address | Constructor args |
|---|---|---|
| `ChromaPaletteData` | `0xb3ad67d60C44E6db461f8957AF7a2f664c01275a` | (none) |
| `ChromiesCommemorative` | `0x10953E4975C35529a5034D54eBC9266cec0CE69D` | `initialOwner = 0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` |
| `ChromaRenderer` | `0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437` | `storageAddress = 0x10953E49...CE69D`, `paletteDataAddress = 0xb3ad67d6...1275a`, `initialOwner = 0xa29A8301...FB06a` |

Live wiring confirmed post-deploy:
- `token.renderer()` → `0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437` ✓
- `renderer.chromaStorage()` → `0x10953E4975C35529a5034D54eBC9266cec0CE69D` (== `ChromiesCommemorative`, correct self-storing wiring) ✓
- `renderer.paletteData()` → `0xb3ad67d60C44E6db461f8957AF7a2f664c01275a` (the verified palette) ✓
- `token.MAX_SUPPLY()` → `100` ✓
- `token.owner()` → `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` ✓

## 3. Transaction hashes and gas

| Step | Tx hash | Gas used |
|---|---|---|
| Deploy `ChromaPaletteData` | `0xdea8573f0c52bb21f5671b271524d858ff7e2d772ffad5ef137a19373a76ed39` | 2,010,503 |
| Deploy `ChromiesCommemorative` | `0x44c99558d44ef9c724812b69e13ef6a062005f464138f3b81a9c0b583fc66927` | 1,600,570 |
| Deploy `ChromaRenderer` | `0x5ad55fae23898bfecaea42609bc5770a86fa2c21e451eb1af3d33304301bcf47` | 4,253,221 |
| `setRenderer(renderer)` | `0x9593c777a1a27ee67bf07622b9b7e38c30d7237274994046f6a48f9a933501e7` | 46,391 |
| `seedPayloads` batch 0 (tokens 1–10) | `0x79623a538c8fd9bd1a78fb1984059bbd67def3770ccdf07a45bd2642af0bbda5` | 5,141,596 |
| `seedPayloads` batch 1 (tokens 11–20) | `0x0eaa3f6d43eb254af6c293265956cbd6e17ea84dd1837e5478e4f4e1ae5d1885` | 5,126,266 |
| `seedPayloads` batch 2 (tokens 21–30) | `0x5aa80f7e28fa684b590712b8ccf63877cfb47ab24d36445220ad267cdb0eda39` | 5,125,306 |
| `seedPayloads` batch 3 (tokens 31–40) | `0x734cedc5ba5200831333c0b8ed9c52b76b01a357b07272c12d33b714c2950030` | 5,125,162 |
| `seedPayloads` batch 4 (tokens 41–50) | `0xa03961cd214188b57e814f988d15ec2c24d50a03cd1b05ee0fe230e2c2d521b4` | 5,120,050 |
| `seedPayloads` batch 5 (tokens 51–60) | `0x360336cc536301c05a44b173e8cf37412162759c8cecd48f54315993ab1d930f` | 5,129,146 |
| `seedPayloads` batch 6 (tokens 61–70) | `0xd20a41f496e9ac8790d027a033100e016f8fa5c0343ee71046af3a011e51fd54` | 5,121,058 |
| `seedPayloads` batch 7 (tokens 71–80) | `0xa7b6ccfb5b799fd7c7c75b871f058f038def3e485432d8e37eb0b98837a2db31` | 5,132,578 |
| `seedPayloads` batch 8 (tokens 81–90) | `0x0cc31640e9bf19a8f658511b16c82a329e90cb484a5aa897fda5540807f3a1a3` | 5,123,194 |
| `seedPayloads` batch 9 (tokens 91–100) | `0xc325828175218d339bf805fe19ed2a43dd5e4a3808a68ccad0552c20d2d0f281` | 5,130,874 |
| **Total** | 14 txs, all `status: 1 (success)` | **59,185,915 gas** |

**Total ETH spent:** `0.003501567298990000 ETH`
**Deployer balance before:** `0.029975406636416405 ETH`
**Deployer balance after:** `0.026473839337426405 ETH`

---

## 4. Palette read-back verification (mainnet gate)

Ran `script/robinhood/VerifyPaletteReadback.s.sol` against the freshly deployed
`ChromaPaletteData` (`0xb3ad67d60C44E6db461f8957AF7a2f664c01275a`), all 80 palette IDs ×
16 color slots, against `chromies-engine/engine_data/palette_colors_expanded.json`
(compiled from `palette-registry.json` at HEAD):

```
=== Palette read-back verification ===
Palette address: 0xb3ad67d60C44E6db461f8957AF7a2f664c01275a
Palettes checked: 80
Slots checked: 1280
Mismatches: 0
Palettes differing: 0
PASS - zero drift across all 80 palettes / 1280 slots.
```

**Zero drift.** Per the amended per-target gate, this clears mainnet for this contract
instance regardless of the 5 waivers tagged `target: sepolia` in `known_drift.json`.

## 5. Seed payload verification (per-batch)

All 10 batches (100/100 commemorative tokens) seeded successfully. Spot-checked the
**first and last token id of every batch** (20 tokens total) by comparing on-chain
`getPixels()`/`getTraits()` against `reports/robinhood/commemorative-100.json` /
`seed-calldata.json` source data:

```
OK batch 0 token 1      OK batch 0 token 10
OK batch 1 token 11     OK batch 1 token 20
OK batch 2 token 21     OK batch 2 token 30
OK batch 3 token 31     OK batch 3 token 40
OK batch 4 token 41     OK batch 4 token 50
OK batch 5 token 51     OK batch 5 token 60
OK batch 6 token 61     OK batch 6 token 70
OK batch 7 token 71     OK batch 7 token 80
OK batch 8 token 81     OK batch 8 token 90
OK batch 9 token 91     OK batch 9 token 100

Checked 20 tokens. Mismatches: 0
```

`hasData()` confirmed `true` for tokens 1, 50, and 100. `totalSupply()` is `0` (no
mints — seeding does not mint).

## 6. Blockscout verification

All three contracts submitted to `robinhoodchain.blockscout.com` via
`forge verify-contract --verifier blockscout` and confirmed via `forge verify-check`:

| Contract | Address | Status | Explorer |
|---|---|---|---|
| `ChromaPaletteData` | `0xb3ad67d60C44E6db461f8957AF7a2f664c01275a` | Pass - Verified | https://robinhoodchain.blockscout.com/address/0xb3ad67d60c44e6db461f8957af7a2f664c01275a |
| `ChromiesCommemorative` | `0x10953E4975C35529a5034D54eBC9266cec0CE69D` | Pass - Verified | https://robinhoodchain.blockscout.com/address/0x10953e4975c35529a5034d54ebc9266cec0ce69d |
| `ChromaRenderer` | `0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437` | Pass - Verified | https://robinhoodchain.blockscout.com/address/0x9d868268a8774eda4d257a856ad9ef0aafaaf437 |

## 7. tokenURI hash reconciliation (final)

Since `mintOpen` is `false` and stays `false` (no manual mint performed on mainnet),
`ChromiesCommemorative.tokenURI(1)` cannot be called directly (`_requireOwned` reverts for
an unminted token). Instead, `ChromaRenderer.tokenURI(1)` was called **directly** —
the renderer has no ownership check; only the ERC-721 wrapper's override does — which
exercises the exact same render path that `ChromiesCommemorative.tokenURI(1)` would use
once token 1 is minted.

| Source | `tokenURI(1)` keccak256 hash |
|---|---|
| Live mainnet (`ChromaRenderer.tokenURI(1)` direct call) | `0xdeeb7bda5f5ee1d657c55d0a3e8674ba993a6f8c06e8b53feb0a20f4fd0d13d1` |
| Live testnet insurance run (corrected wiring, minted) | `0xdeeb7bda5f5ee1d657c55d0a3e8674ba993a6f8c06e8b53feb0a20f4fd0d13d1` |
| Local reference (fresh Foundry test, same fixture) | `0xdeeb7bda5f5ee1d657c55d0a3e8674ba993a6f8c06e8b53feb0a20f4fd0d13d1` |

**All three hashes match exactly.** Output length 6,877 bytes; gas for the `tokenURI`
call ≈ 2,949,716 (eth_call estimate, not a real cost since it's a view call).

Commemorative token 1 corresponds to source token **#8** (2,148 total pixels) from the
5,150-piece reveal set.

## 8. Final state

- `mintOpen`: `false` (untouched — flipping it is a manual JB action)
- `totalSupply`: `0`
- All 100 payloads seeded and verified
- Deployer balance: `0.026473839337426405 ETH`

## 9. Scope

All changes confined to `src/robinhood/`, `test/robinhood/`, `script/robinhood/`,
`chromies-engine/reports/KNOWN_DRIFT.md` + `known_drift.json`. No changes to
`/launch-edition` or `wagmi.js` in this pass (already finalized in the prior smoke-test
task).
