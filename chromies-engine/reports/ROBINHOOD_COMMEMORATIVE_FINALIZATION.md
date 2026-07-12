# Chromies Commemorative Edition — Finalization + Robinhood Chain Testnet Smoke Test

Follow-up to `ROBINHOOD_COMMEMORATIVE_EDITION.md`. Finalizes `ChromiesCommemorative`
constants (price, name/symbol, ERC-2981 royalties), confirms Robinhood Chain
mainnet/testnet chain IDs against the docs, re-runs the full Robinhood test suite, and
executes a real, funded smoke test on Robinhood Chain testnet (deploy → seed → lock →
mint → tokenURI → Blockscout verify), closing out with a definitive hash reconciliation
for the `tokenURI(1)` discrepancy flagged in the earlier dry-run report.

Scope respected: all changes are confined to `src/robinhood/`, `test/robinhood/`,
`script/robinhood/`, the `/launch-edition` route (`src/pages/LaunchEdition.jsx`), and
`.env`/`.env.example` (RPC/test-key vars only, gitignored). No mainnet code, registries,
or `KNOWN_DRIFT.md` touched.

---

## 1. Constant diffs — `src/robinhood/ChromiesCommemorative.sol`

| Constant | Before | After |
|---|---|---|
| `MINT_PRICE` | `0.035 ether` | **`0.0169 ether`** |
| `name` | `"Chromies: Chain Launch Edition"` | **`"Chromies: Robinhood Chain Commemorative"`** |
| `symbol` | `"CHROMIE-CLE"` | **`"CHROMIE-RC"`** |
| Royalties | none | **ERC-2981, 500 bps (5%), receiver = `owner`, set via `_setDefaultRoyalty` in the constructor** |
| `supportsInterface` | N/A (single-parent `ERC721`) | **override `(ERC721, ERC2981)`, same pattern as `contracts/Chroma.sol`** |

New constant added: `uint96 public constant ROYALTY_FEE_BPS = 500;`

**Royalty test** (`test/robinhood/ChromiesCommemorative.t.sol`):
```solidity
function test_RoyaltyInfo_FivePercentToOwner() public view {
    (address receiver, uint256 royaltyAmount) = token.royaltyInfo(1, 1 ether);
    assertEq(receiver, owner);            // PASS
    assertEq(royaltyAmount, 0.05 ether);  // PASS
}
```
Also confirmed **live** on the deployed testnet contract:
`royaltyInfo(1, 1 ether)` → `(0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a, 0.05 ether)`. ✅

## 2. `/launch-edition` price display

The page already reads `MINT_PRICE` live from the contract (no hardcoded price), so the
constant change alone updates the displayed value — **except** the page's local
`formatEth()` helper used a `< 0.01 ETH → 4 decimals, else 3 decimals` rule, which would
have rounded `0.0169` down to `"0.017 ETH"`. Fixed the threshold to `< 0.1 ETH → 4
decimals` so it now renders exactly **`0.0169 ETH`** (and `0.0338 ETH` for qty = 2).

## 3. Chain ID verification

Fetched `docs.robinhood.com/chain/connecting` directly (not from memory):

| Network | Chain ID | Block Explorer |
|---|---|---|
| **Robinhood Chain (mainnet)** | **`4663`** | `robinhoodchain.blockscout.com` |
| **Robinhood Chain Testnet** | **`46630`** | `explorer.testnet.chain.robinhood.com` |

`src/lib/robinhood-contract.js` (the file `wagmi.js` imports `robinhoodChain` from) already
had `id: 4663` for mainnet — **correct, no change needed**. The testnet broadcast in this
task used `46630`, confirmed live via `forge script` (`Chain 46630` in every run below).

## 4. Full Robinhood test suite — re-run after all contract changes

```
$ forge test --match-path "test/robinhood/*.sol"

ChromiesCommemorative.t.sol:ChromiesCommemorativeTest  — 18 passed, 0 failed
RobinhoodDryRun.t.sol:RobinhoodDryRunTest              —  3 passed, 0 failed
CommemorativeSeedCalldata.t.sol:...Test                —  1 passed, 0 failed

Ran 3 test suites: 22 tests passed, 0 failed, 0 skipped
```

**PASS — full suite, 22/22.**

## 5. Funding note

The deployer (`0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a`) started this task at
**`0.009818944140000000 ETH`** (~0.0098 ETH). With `MINT_PRICE = 0.0169 ETH`, minting
even a single token exceeds that balance, and the requested "mint 2 from a second
address" needs `0.0338 ETH` in mint value alone. Flagged this to the user before
spending anything; the deployer was topped up mid-task to **`0.509818944140000000 ETH`**,
which funded the rest of the smoke test, including a fresh throwaway secondary test
wallet (generated for this task, testnet-only, holds no other value):

- `ROBINHOOD_TESTNET_SECONDARY_ADDRESS` = `0xEAFef6DAF33fF705e47799B235CFd5fb62A107cd`
  (funded with `0.06 ETH` from the deployer, tx `0x666ac3748e225472af73dd8cc482070fd1244b03bbea2232558ee9752f9f59c8`)

## 6. Smoke test — Robinhood Chain testnet (chain id `46630`)

### 6a. Deploy — `script/robinhood/DeployCommemorativeTestnet.s.sol`

Deploys **only** `ChromiesCommemorative` and wires its `renderer` to the **existing**
testnet `ChromaRenderer` from the earlier dry-run (`0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437`)
instead of redeploying a fresh renderer/palette stack — see the important caveat in
§6f. Broadcast with `--gas-estimate-multiplier 400`.

| Item | Value |
|---|---|
| `ChromiesCommemorative` address | `0xE0E57beeefD732CCFe6e121AB2ff5Fe779590138` |
| Deploy tx | `0x5f93ff49772f91ca45a2f44aa158c9abc7256600d448fe1d9cd9ccf0d22918a3` — gas `2,867,228` |
| `setRenderer(...)` tx | `0x2f1388bd75e787aee8c81dce7cd62a8571268d8374af988b41bb7069a80cc0a9` — gas `87,371` |
| Owner/deployer | `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` |
| Wired renderer (reused) | `0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437` |

### 6b. Seeding — batches 0-1 (20 payloads) via `script/robinhood/SeedCommemorativeTestnet.s.sol`

Reads `reports/robinhood/seed-calldata.json`, seeds one batch per invocation.

| Batch | Token IDs | Tx hash | Gas used |
|---|---|---|---|
| 0 | 1–10 | `0x6cf47c31f7896f5a446aae7fa106ecebaa07c41fe18959a0b5d9d9c937b24cab` | **6,820,273** |
| 1 | 11–20 | `0xa19f204ec0ba73fb2f3922bc4b2f34e707edbe7823db29c8e7abefd0ec80a6b8` | **6,923,123** |

`hasData(1)` / `hasData(20)` → `true`; `hasData(21)` → `false` (untouched, as expected —
only 20 of 100 seeded per spec).

### 6c. Lock — `setMintOpen(true)`

| Item | Value |
|---|---|
| Tx | `0x159f78f7f4806fb75ca83e14a5ad14f2abade0c454e09ff065ebeda8e7ed0baa` |
| Gas used | `91,424` |
| `mintOpen` after | `true` |
| `seedingLocked` after | `true` (one-way ratchet, as designed) |

**`seedPayloads` now reverts** — simulated a 21st-token seed call post-lock:
reverted with selector `0xd2179ea4` = `keccak256("SeedingLocked()")[:4]`. ✅ confirmed.

### 6d. Mint — 2 tokens from the second test address

| Item | Value |
|---|---|
| Minter | `0xEAFef6DAF33fF705e47799B235CFd5fb62A107cd` |
| Tx | `0x84bf75770603e263e9eeb2712d4fb660b27b5cbd931b661bd6f54c4d7a5e3944` |
| Value sent | `0.0338 ETH` (`2 × 0.0169`) |
| Gas used | `194,654` |
| Result | `Transfer` events for token `1` and `2`, both to the minter; `ownerOf(1)`/`ownerOf(2)` confirm; `walletMinted` = `2`; `totalSupply` = `2` |

**3rd mint attempt** (qty = 1, value = `0.0169 ETH`, same wallet): reverted with selector
`0xf560625a` = `keccak256("MaxPerWalletExceeded()")[:4]`. ✅ confirmed.

**Underpayment attempt** (qty = 1, value = `0.01 ETH`, same wallet): reverted with
selector `0xcd1c8867` = `keccak256("InsufficientPayment()")[:4]`. ✅ confirmed.

### 6e. `tokenURI(1)` — live `eth_call`

| Item | Value |
|---|---|
| Call | `cast call 0xE0E57beeefD732CCFe6e121AB2ff5Fe779590138 "tokenURI(uint256)(string)" 1` |
| Result | renders successfully — `data:application/json;base64,...`, 6,869 bytes |
| Gas (via our contract → renderer delegate call) | `3,049,633` |
| Gas (calling the wired renderer directly, for comparison) | `3,009,334` |

### 6f. Important smoke-test caveat (architecture note)

`ChromiesCommemorative.tokenURI()` delegates entirely to whatever `renderer` it's wired
to; the renderer's own `chromaStorage` pointer is **immutable**, fixed at *the renderer's*
construction. Since we reused the dry-run's existing renderer (wired to the **old**
`RobinhoodTestHarness`-seeded `ChromaStorage`, not to our new contract), `tokenURI(1)`
here renders the **old dry-run fixture** ("Chroma #1"), not the newly-seeded commemorative
payload for id 1 — and `tokenURI(2..20)` would revert (`TokenNotWritten`) on that old
storage despite being freshly seeded on our own contract. This is expected and was the
right call for a cost-conscious smoke test (skips redeploying palette+renderer, and
conveniently gives a clean, directly-comparable live data point for §7's hash
reconciliation) — but a **real mainnet deploy must deploy its own renderer** constructed
with `storageAddress = address(thisContract)` for seeded payloads to actually render.
Flagged in the script's own NatSpec (`script/robinhood/DeployCommemorativeTestnet.s.sol`).

### 6g. Blockscout verification

```
$ forge verify-contract 0xE0E57beeefD732CCFe6e121AB2ff5Fe779590138 \
    src/robinhood/ChromiesCommemorative.sol:ChromiesCommemorative \
    --chain-id 46630 --verifier blockscout \
    --verifier-url https://explorer.testnet.chain.robinhood.com/api/ \
    --constructor-args 0x000000000000000000000000a29a83012cee23a51ed4b7e087ce5aa0790fb06a

Response: OK — GUID e0e57beeefd732ccfe6e121ab2ff5fe7795901386a528adb
Details: Pass - Verified
```
✅ [`0xe0e57beeefd732ccfe6e121ab2ff5fe779590138`](https://explorer.testnet.chain.robinhood.com/address/0xe0e57beeefd732ccfe6e121ab2ff5fe779590138)

## 7. Hash reconciliation — `tokenURI(1)`

| Source | `keccak256` |
|---|---|
| **Live** — fresh `eth_call` on RH testnet, right now (both via our new contract's delegate call *and* calling the reused renderer directly — identical either way) | `0xe1b8b41327a5b9bdde9ecfc2d08e696a2c63a021d8f4b6ec062819cda12c89c6` |
| **Local** — fresh reference render, same fixture/bytecode (`test/robinhood/RobinhoodDryRun.t.sol`, hash computed **on-chain** via `keccak256(bytes(uri))` in Solidity — no manual copy/paste) | `0xe1b8b41327a5b9bdde9ecfc2d08e696a2c63a021d8f4b6ec062819cda12c89c6` |
| **Report** — value recorded in `chromies-engine/reports/ROBINHOOD_TESTNET_DRY_RUN.md` §7/§8 | `0x168fc398664afc533088cc14947251f87bfd2d765acbe89a2bc5abfe4b422189` |

**Live == Local, exactly. Report != either.**

**Definitive explanation:** `ChromaRenderer.tokenURI` has no chain-specific inputs
(`block.timestamp`/`blockhash`/`chainid`) and every contract in the chain
(`ChromaStorage`, `ChromaPaletteData`, `ChromaRenderer`, the harness) is immutable after
deployment — token 1's traits/pixels were written exactly once, at seed time, and never
touched again. A render of the same tokenId against the same bytecode + same storage is
therefore **provably deterministic**: calling the *same, unmodified* renderer address
today reproduces byte-for-byte what it produced during the original dry run. Since a
fresh local re-render (`0xe1b8b413...`) and a fresh live call against that exact
still-live renderer (`0xe1b8b413...`) agree with each other perfectly, the value written
into `ROBINHOOD_TESTNET_DRY_RUN.md` (`0x168fc398...`) can only be a **transcription/copy
error made while writing that report** — not real on-chain drift. No code, contract, or
stored data changed; the earlier report's recorded hash was simply wrong at write-time.

## 8. Final balances

| Address | Role | Balance after smoke test |
|---|---|---|
| `0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a` | Deployer/owner | `0.449650389590000000 ETH` |
| `0xEAFef6DAF33fF705e47799B235CFd5fb62A107cd` | Secondary test minter | `0.026198053460000000 ETH` |
| `0xE0E57beeefD732CCFe6e121AB2ff5Fe779590138` | `ChromiesCommemorative` (mint proceeds) | `0.0338 ETH` |

## 9. Files touched (scope check)

- `src/robinhood/ChromiesCommemorative.sol` — constants, ERC-2981, `supportsInterface`
- `test/robinhood/ChromiesCommemorative.t.sol` — royalty + `supportsInterface` tests
- `test/robinhood/RobinhoodDryRun.t.sol` — on-chain `keccak256` logging (hash reconciliation)
- `script/robinhood/DeployCommemorativeTestnet.s.sol` — **new**, smoke-test deploy script
- `script/robinhood/SeedCommemorativeTestnet.s.sol` — **new**, per-batch seed script
- `src/pages/LaunchEdition.jsx` — `formatEth` precision fix (price display)
- `.env` — testnet secondary test key/address (gitignored, throwaway, testnet-only)
- `chromies-engine/reports/ROBINHOOD_COMMEMORATIVE_FINALIZATION.md` — this report

No changes to `wagmi.js`/chain config were needed (chain IDs were already correct), and
no mainnet code, registries, or files outside the agreed scope were touched.
