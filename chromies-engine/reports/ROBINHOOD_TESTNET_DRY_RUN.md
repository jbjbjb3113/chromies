# Robinhood Chain testnet dry-run — Chromies commemorative edition

**Status: LIVE BROADCAST COMPLETE.** Deployer was funded (0.01 ETH); all 4
contracts are deployed, wired, seeded, and verified on the live Robinhood Chain
testnet (chain id 46630). `tokenURI` parity confirmed byte-for-byte against the
pre-broadcast fork rehearsal. See §7 for the live addresses/tx hashes and §8 for
the final summary. Sections 1–6 below describe the pre-funding rehearsal and are
kept for the record; all numbers in this report are real, measured values.

Scope: read-only dry-run + parity check for `ChromaPaletteData` / `ChromaRenderer`
against Robinhood Chain testnet (chain id `46630`). Does **not** touch ETH
mainnet-targeted code, `KNOWN_DRIFT.md`, or any existing registry. All new files
are under `script/robinhood/` and `test/robinhood/`.

---

## 1. Network config (`foundry.toml`, `.env.example`)

Added two new `rpc_endpoints` aliases (no existing aliases modified):

| Alias | Value | Notes |
|---|---|---|
| `robinhood_testnet` | `${ROBINHOOD_TESTNET_RPC_URL}` | Defaults to public RPC `https://rpc.testnet.chain.robinhood.com`; set to an Alchemy app URL (`https://robinhood-testnet.g.alchemy.com/v2/<key>`) for higher rate limits. |
| `robinhood_mainnet` | `https://rpc.mainnet.chain.robinhood.com` | **Placeholder only** — per task instructions, not referenced by any script and not to be deployed to. |

Verified against live docs (docs.robinhood.com/chain/connecting, alchemy.com/rpc/robinhood-testnet):

| Property | Testnet | Mainnet |
|---|---|---|
| Chain ID | `46630` (`0xb626`) | `4663` |
| Public RPC | `https://rpc.testnet.chain.robinhood.com` | `https://rpc.mainnet.chain.robinhood.com` |
| Alchemy RPC | `https://robinhood-testnet.g.alchemy.com/v2/{API_KEY}` | `https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY}` |
| Explorer (Blockscout) | `explorer.testnet.chain.robinhood.com` | `robinhoodchain.blockscout.com` |
| Faucet | `faucet.testnet.chain.robinhood.com` | — |

Confirmed live via `eth_chainId` against the public RPC: returned `0xb626` = `46630` ✓.
Current head block at check time: `89,495,502`.

**Alchemy app:** I do not have access to create an app in your Alchemy dashboard (no
browser/API credential for that). `ROBINHOOD_TESTNET_RPC_URL` is wired to accept
either an Alchemy URL or the public RPC — create the RH Chain Testnet app yourself at
alchemy.com and drop the URL into `.env`; no code changes needed either way.

---

## 2. Deployer funding — ✅ funded 2026-07-11

Reused the same deployer as all Sepolia deploys (same `PRIVATE_KEY` in `.env`; address
taken from `chromies-engine/reports/SEPOLIA_DEPLOY_LOG.md`, not derived/printed from
the key itself):

```
Deployer: 0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a
```

Checked its balance on the **live public RH testnet RPC** (read-only, no key involved):

```
$ cast balance 0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a --rpc-url https://rpc.testnet.chain.robinhood.com --ether
0.000000000000000000
```

**Balance was 0 ETH at initial check.** You funded it (0.01 ETH confirmed live) and the
real broadcast (§7) has since spent ~0.000181 ETH of it on gas.

Sections 3–6 below describe the pre-funding rehearsal against a **local Anvil fork of
the live RH testnet** (`anvil --fork-url https://rpc.testnet.chain.robinhood.com`,
chain id 46630, real forked state at block 89,496,595) using Anvil's well-known local
test key — not the real deployer key, no real testnet ETH spent. That rehearsal is
what gave us the reference hash the live run is checked against in §7.

---

## 3. Deploy (existing contracts, unchanged) + harness

New files (nothing under `contracts/`, `script/` outside `script/robinhood/`, or
`test/` outside `test/robinhood/` was modified):

- `script/robinhood/DeployRobinhoodDryRun.s.sol` — deploys `ChromaStorage`,
  `ChromaPaletteData`, `ChromaRenderer` (byte-identical source to what's on Sepolia;
  see `script/RedeployPaletteStack.s.sol`) plus `RobinhoodTestHarness`.
- `test/robinhood/RobinhoodTestHarness.sol` — minimal harness. Holds the exact
  `art-pipeline/output/test-reveal.json` `"reveal"` fixture (tokenId 1, 2048-byte
  `pixelsHex`, 32-byte `traitsHex`) as constants, writes it into a fresh
  `ChromaStorage` via `writeTokenData`, and exposes `tokenURI(uint256)` as a
  passthrough to the wired (unmodified) `ChromaRenderer`.
- `test/robinhood/RobinhoodDryRun.t.sol` — local Foundry test rehearsing the same
  deploy + asserting fixture integrity, passthrough equivalence, and a gas ceiling.

### Rehearsal deploy (Anvil fork of RH testnet, chain id 46630)

```
forge script script/robinhood/DeployRobinhoodDryRun.s.sol --rpc-url http://127.0.0.1:8547 --broadcast
```

```
Deployer:              0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   (Anvil test key #0, NOT the real deployer)
ChromaStorage:         0x8ac87219a0F5639BC01b470F87BA2b26356CB2B9
ChromaPaletteData:     0x94fFA1C7330845646CE9128450F8e6c3B5e44F86
ChromaRenderer:        0xCa1D199b6F53Af7387ac543Af8e8a34455BBe5E0
RobinhoodTestHarness:  0xdF46e54aAadC1d55198A4a8b4674D7a4c927097A
Sample tokenId:        1
```

`ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.` Estimated full-deploy gas: `10,514,290`
@ `0.02 gwei` ≈ `0.00021 ETH` — this is the entire 4-contract deploy + wiring + seed,
not the `tokenURI` call itself (see §5 for that).

**When funded, the real run is identical** — just swap `--rpc-url http://127.0.0.1:8547`
for `--rpc-url robinhood_testnet` (uses `.env` `ROBINHOOD_TESTNET_RPC_URL`) and the
real `PRIVATE_KEY`. Addresses above are from the rehearsal fork only — **not final**;
real addresses will be reported once broadcast against the live network.

---

## 4. Palette read-back vs. `palette-registry.json` (pre-funding rehearsal)

Ran against the rehearsal deploy on the RH fork: `ChromaPaletteData` there is the
exact same `contracts/generated/ChromaPaletteData.sol` bytecode already gated by
`scripts/check_palette_registry.py` in CI (fails if generated files are stale vs
`art-pipeline/palette-registry.json`). Since no `contracts/` file was touched, this
task introduces **zero drift** — the registry-vs-contract relationship is unchanged
from whatever it is on `main` today (see `chromies-engine/reports/KNOWN_DRIFT.md`
for the 5 pre-existing, unrelated legendary-palette waivers, which this task does not
touch).

**The full 80-palette read-back against the LIVE deployment is in §7 — 0 drift.**

---

## 5. `tokenURI` parity: RH-chain execution vs. reference — **PASS, byte-for-byte**

`ChromaRenderer.tokenURI` has no chain-specific inputs (no `block.timestamp` /
`blockhash` / `chainid` dependence) — with identical bytecode and identical fixture
data, output must be deterministic across any EVM. I verified this concretely:

1. Deployed the identical stack to a **plain, unforked local chain** (reference —
   equivalent to Sepolia, which runs the same unmodified `ChromaRenderer` bytecode).
2. Deployed the identical stack to the **RH testnet fork** (chain id 46630, real
   forked RH state).
3. Called `renderer.tokenURI(1)` on both via `eth_call` and diffed.

```
$ cast estimate <renderer-local>  "tokenURI(uint256)" 1 --rpc-url http://127.0.0.1:8548
2924537
$ cast estimate <renderer-rh-fork> "tokenURI(uint256)" 1 --rpc-url http://127.0.0.1:8547
2924537

$ cast keccak <tokenURI output, local>
0x168fc398664afc533088cc14947251f87bfd2d765acbe89a2bc5abfe4b422189
$ cast keccak <tokenURI output, RH fork>
0x168fc398664afc533088cc14947251f87bfd2d765acbe89a2bc5abfe4b422189
```

**Byte-for-byte identical** (`0` diff lines, matching `keccak256` hash) and
**identical gas** (`2,924,537`). `forge test` (local, isolated `gasleft()` delta
measurement) also agrees: `2,925,025` gas / `6,869` bytes for the same call — the
~500 gas difference vs. the `cast estimate` numbers above is measurement-method
overhead (RPC `eth_estimateGas` vs. in-VM `gasleft()` delta), not a behavioral
difference.

`harness.tokenURI(1)` (the passthrough) was also diffed against calling
`renderer.tokenURI(1)` directly — `0` diff, confirming the harness adds no
distortion.

```bash
forge test --match-path "test/robinhood/*"
# Ran 3 tests for test/robinhood/RobinhoodDryRun.t.sol:RobinhoodDryRunTest
# [PASS] test_HarnessSeedsExactFixture()
# [PASS] test_HarnessTokenURIMatchesRendererDirectly()
# [PASS] test_TokenURIGasAndOutput()
# 3 passed; 0 failed; 0 skipped
```

**gas used:** `2,925,025` (well within RH testnet's forked gas limit of
`1,125,899,906,842,624`, and within Alchemy/public-RPC default `eth_call` gas caps).
**RPC errors:** none encountered against either the public RH testnet RPC or the fork.

---

## 7. LIVE broadcast — Robinhood Chain testnet (chain id 46630)

Deployer funded with 0.01 ETH; ran:
```
forge script script/robinhood/DeployRobinhoodDryRun.s.sol --rpc-url robinhood_testnet --broadcast --gas-estimate-multiplier 400
```

**Note on retries:** the first two attempts failed before any tx was sent — one
`intrinsic gas too low` (RH Chain is an Arbitrum-based L2; its L1-data-gas accounting
needs a larger gas-estimate margin than Foundry's default 130%, hence
`--gas-estimate-multiplier 400`), and one transient `could not instantiate forked
environment` (public-RPC non-archive-node race during simulation, resolved on retry).
Neither attempt sent a transaction (confirmed: empty `receipts` in the broadcast
artifact for both). Third attempt succeeded outright.

### Deployed addresses (chain id 46630)

| Contract | Address | Deploy tx | Gas used |
|---|---|---|---|
| `ChromaStorage` | `0xb3ad67d60C44E6db461f8957AF7a2f664c01275a` | [`0xf6ddad5a…084ec`](https://explorer.testnet.chain.robinhood.com/tx/0xf6ddad5ab4d059793db45be322672b3da64a255ec92499944a7969f861a084ec) | 1,427,860 |
| `ChromaPaletteData` | `0x10953E4975C35529a5034D54eBC9266cec0CE69D` | [`0xff35b519…6e22`](https://explorer.testnet.chain.robinhood.com/tx/0xff35b519260b176887006272fc51a39618a7504f5f989f2307112144a5c96e22) | 4,231,906 |
| `ChromaRenderer` | `0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437` | [`0x8b5d6f70…b799f`](https://explorer.testnet.chain.robinhood.com/tx/0x8b5d6f7077f12a1b957fd7b51b6e54ad38c13ce8cc4f2e09f1ad6642ccfb799f) | 10,024,183 |
| `RobinhoodTestHarness` | `0xd4E2acC95Cdb2a1D2E242c2AF8a3295AA76c28B1` | [`0xaf920996…dbd15`](https://explorer.testnet.chain.robinhood.com/tx/0xaf92099bb4fd5ef1685877986345d63b590bb7f7133ce3674a6cfe4738cdbd15) | 1,716,871 |

Wiring:

| Action | Tx | Gas used |
|---|---|---|
| `chromaStorage.setWriter(harness)` | [`0x731b9480…5cc0`](https://explorer.testnet.chain.robinhood.com/tx/0x731b9480ebee5a1cabb5c15a94403749f701cee37fbea9fbf76aab6ff38a5cc0) | 101,981 |
| `harness.seed()` | [`0x96a357d3…4cf231`](https://explorer.testnet.chain.robinhood.com/tx/0x96a357d3e48b675a463e91bf83ba4b21cdb0f0c3707bf15f6c519b513c4cf231) | 602,785 |

**Deployer:** `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a`
**Total gas used (6 txs):** `18,105,586`
**Effective gas price:** `0x989680` = `10,000,000` wei = `0.01` gwei
**Total ETH spent:** `0.00018105586 ETH`
**Deployer balance before:** `0.01 ETH` → **after:** `0.009818944140000000 ETH` (matches spend, ±dust)

All 6 transactions: `status: 0x1` (success), no reverts.

### Palette read-back vs. `palette-registry.json` — LIVE, all 80 IDs — ✅ 0 drift

Read `paletteColors(uint8)` + `paletteName(uint8)` for every palette id `0..79` from
the **live** `ChromaPaletteData` at `0x10953E4975C35529a5034D54eBC9266cec0CE69D` and
diffed against `chromies-engine/engine_data/palette_colors_expanded.json` (the
compiled form of `art-pipeline/palette-registry.json`):

```
Checked 80 palettes (0-79) against live ChromaPaletteData @ 0x10953E4975C35529a5034D54eBC9266cec0CE69D
Hard mismatches (non-waived): 0
Waived mismatches (KNOWN_DRIFT ids): 0
```

**Zero drift across all 80 IDs — including the 5 IDs waived in `KNOWN_DRIFT.md`
(28, 29, 32, 33, 34).** That waiver describes drift on the *existing Sepolia*
deployment (an older palette contract) vs. current registry HEAD; since this task
deployed a **fresh** `ChromaPaletteData` compiled from current HEAD, it naturally
matches HEAD's registry everywhere, those 5 IDs included. `KNOWN_DRIFT.md` itself is
unmodified — this doesn't resolve or affect that waiver, it's just a separate,
unrelated contract instance.

### `tokenURI(1)` — LIVE `eth_call` — ✅ byte-for-byte match vs. fork-rehearsal reference

```
$ cast call 0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437 "tokenURI(uint256)(string)" 1 --rpc-url robinhood_testnet
$ cast estimate 0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437 "tokenURI(uint256)" 1 --rpc-url robinhood_testnet
3047275
$ cast estimate 0xd4E2acC95Cdb2a1D2E242c2AF8a3295AA76c28B1 "tokenURI(uint256)" 1 --rpc-url robinhood_testnet   # harness passthrough
3082666

$ cast keccak <live tokenURI output>
0x168fc398664afc533088cc14947251f87bfd2d765acbe89a2bc5abfe4b422189
# == fork-rehearsal / local reference hash from §5. IDENTICAL.
```

- **Call succeeded** within RPC limits, no errors, on the first attempt.
- **Rendered output:** byte-for-byte identical to the reference (`keccak256` match) —
  same `data:application/json;base64,...` string, same embedded PNG, same attributes.
- **`renderer.tokenURI(1)` vs `harness.tokenURI(1)` (passthrough):** `0` diff.
- **Gas:** `3,047,275` (direct renderer call) / `3,082,666` (via harness passthrough,
  one extra external-call frame) — both **higher** than the `2,924,537` seen on the
  Anvil fork rehearsal (§5). This is expected, not a correctness issue: RH Chain is a
  live Arbitrum-based L2, and `eth_estimateGas` against the real sequencer factors in
  L1 calldata-availability gas (visible as `gasUsedForL1` in the deploy receipts,
  §7 above) that Anvil's local fork simulation doesn't fully replicate. The **output
  bytes are identical**, which is the actual parity requirement.

### Blockscout verification — `explorer.testnet.chain.robinhood.com` — ✅ all 4 verified

```
forge verify-contract <addr> <contract> --chain-id 46630 --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/ [--constructor-args ...]
```

| Contract | Status |
|---|---|
| `ChromaPaletteData` | ✅ `Pass - Verified` — [explorer](https://explorer.testnet.chain.robinhood.com/address/0x10953e4975c35529a5034d54ebc9266cec0ce69d) |
| `ChromaStorage` | ✅ `Pass - Verified` — [explorer](https://explorer.testnet.chain.robinhood.com/address/0xb3ad67d60c44e6db461f8957af7a2f664c01275a) |
| `ChromaRenderer` | ✅ `Pass - Verified` — [explorer](https://explorer.testnet.chain.robinhood.com/address/0x9d868268a8774eda4d257a856ad9ef0aafaaf437) |
| `RobinhoodTestHarness` | ✅ `Pass - Verified` — [explorer](https://explorer.testnet.chain.robinhood.com/address/0xd4e2acc95cdb2a1d2e242c2af8a3295aa76c28b1) |

Blockscout's verification API worked without any Etherscan-style API key
(`--verifier blockscout` needs none) — confirmed via `forge verify-check` for all 4
GUIDs: all returned `Details: Pass - Verified`.

---

## 8. Final report summary

| Item | Result |
|---|---|
| `robinhood_testnet` / `robinhood_mainnet` added to `foundry.toml` | ✅ done, mainnet is placeholder-only |
| Deployer funded | ✅ `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a`, 0.01 ETH → 0.009818944140000000 ETH after deploy |
| `ChromaStorage` / `ChromaPaletteData` / `ChromaRenderer` / `RobinhoodTestHarness` deployed **live** | ✅ all 6 txs `status: 0x1`, see §7 addresses/tx table |
| Total gas spent (live) | `18,105,586` gas @ `0.01 gwei` = **`0.00018105586 ETH`** |
| Palette read-back vs. registry (all 80 IDs, live) | ✅ **0 drift**, including the 5 `KNOWN_DRIFT.md`-waived IDs (fresh deploy = current HEAD everywhere) |
| `tokenURI(1)` live `eth_call` | ✅ succeeds, gas `3,047,275` (direct) / `3,082,666` (via harness) |
| Byte-for-byte parity vs. fork-rehearsal reference | ✅ **identical `keccak256`**: `0x168fc398664afc533088cc14947251f87bfd2d765acbe89a2bc5abfe4b422189` |
| Blockscout verification | ✅ all 4 contracts `Pass - Verified` |
| RPC errors encountered | 2 transient failures pre-broadcast (gas-estimate margin, fork race) — both resolved by retry, **0 transactions lost**, **0 partial state** |
| Mainnet code / `KNOWN_DRIFT.md` / registries touched | ✅ none |
| Files outside `script/robinhood/` + `test/robinhood/` | Only `foundry.toml` (+2 rpc aliases) and `.env`/`.env.example` (+RPC URL var, gitignored for `.env`) — no contract/registry changes |

**Bottom line:** the Chromies commemorative-edition stack (`ChromaPaletteData` +
`ChromaRenderer`, unmodified) runs correctly on Robinhood Chain testnet, produces
byte-for-byte identical `tokenURI` output to its Sepolia-equivalent bytecode, has zero
palette drift, and is publicly verified on Blockscout.
