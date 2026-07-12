# Chromies: Chain Launch Edition — Robinhood Chain Commemorative Build

Companion to `ROBINHOOD_TESTNET_DRY_RUN.md`. Covers the new 100-piece commemorative
contract, its mint page, and the payload-selection pipeline for launching on
Robinhood Chain mainnet (chain id `4663`).

## 1. Contract — `src/robinhood/ChromiesCommemorative.sol`

Minimal, standalone ERC-721 (OpenZeppelin `ERC721` + `Ownable` + `ReentrancyGuard` —
the only ERC-721 base in the repo; no lighter alternative exists, so no new
dependency was introduced). No AP economy, no canvas, no burn, no batch-inscribe.

- `MAX_SUPPLY = 100`, `MINT_PRICE = 0.035 ether`, `MAX_PER_WALLET = 2` — all `constant`.
- **Self-storing**: implements the exact read subset of `IChromaStorage` that
  `ChromaRenderer` (contracts/ChromaRenderer.sol, **unmodified**) calls —
  `getTraits`/`getPixels`/`getTotalPixels` — using the same SSTORE2 + packed
  32-byte-traits encoding as `ChromaStorage`. The token contract itself is wired
  as the renderer's "storage" (`ChromaRenderer(address(chromiesCommemorative), ...)`),
  so the renderer needs zero changes.
- `seedPayloads(ids, pixelsHex, traitsHex)` — owner-only batch pre-inscription.
  Permanently locked by a one-way ratchet: the first `setMintOpen(true)` call sets
  `seedingLocked = true` forever, even if mint is later closed again.
- `mint(uint256 quantity)` — payable, quantity 1–2, exact price required, reverts
  if the token wasn't pre-seeded (shouldn't happen if all 100 are seeded first).
- `tokenURI` — reverts for unminted IDs (`_requireOwned`), then delegates to the
  wired `IChromaRenderer`, identical to `Chroma.sol`'s pattern.
- `withdraw()` — owner-only, low-level call, matches `Chroma.sol`.

**Placeholders needing sign-off** (flagged inline in the contract's NatSpec too):
- Name/symbol: `"Chromies: Chain Launch Edition"` / `"CHROMIE-CLE"`.
- `MINT_PRICE = 0.035 ether` — a placeholder, not a priced decision.
- No `ERC2981` royalty wired (main `Chroma.sol` has one; this contract doesn't,
  since royalties weren't in scope for the commemorative spec — add if desired).

## 2. Tests

All new tests pass; nothing pre-existing was touched.

```
test/robinhood/ChromiesCommemorative.t.sol        16 passed
test/robinhood/CommemorativeSeedCalldata.t.sol      1 passed  (end-to-end, see §4)
test/robinhood/RobinhoodDryRun.t.sol                3 passed  (pre-existing, untouched)
-----------------------------------------------------------------
Total (Robinhood suites)                           20 passed, 0 failed
```

Coverage: supply cap (mints exactly 100 across 50 wallets, 101st reverts),
per-wallet cap (0/3/exceeding-across-two-mints all revert; exactly 2 succeeds),
price enforcement (under/over-pay revert, exact multiples succeed), mint-gating
(`MintNotOpen`), seed-lock ratchet (works pre-open, permanently locked post-open
even after re-closing), `tokenURI` revert-for-unminted + `RendererNotSet` revert,
withdraw (transfers balance / reverts for non-owner).

Full repo suite (`forge test`) run for regression check: **119/123 passing**; the
4 failures are pre-existing and unrelated (fuzzy/legacy tests in
`test/Chroma.t.sol`, `test/ChromaPaletteRegistry.t.sol`,
`test/ChromaRendererParity.t.sol`, `test/GasStressTokenURI.t.sol`) — none touch
files created or modified for this task.

### Finding: stale hash in `ROBINHOOD_TESTNET_DRY_RUN.md`

While building `test_TokenURI_MatchesChromaStorageReferencePath`, I initially
asserted against the keccak hash recorded in `ROBINHOOD_TESTNET_DRY_RUN.md`
(`0x168fc398664afc533088cc14947251f87bfd2d765acbe89a2bc5abfe4b422189`). It failed.
Investigation: the *actual* `tokenURI` bytes produced by a fresh
`ChromaStorage`+`ChromaRenderer` reference path (`RobinhoodDryRunTest`, unchanged)
and by the new self-storing contract are **byte-for-byte identical** to each other
(confirmed via a raw string diff, not just a hash comparison) — but `cast keccak`
on that exact string yields `0xe1b8b41327a5b9bdde9ecfc2d08e696a2c63a021d8f4b6ec062819cda12c89c6`,
not the value recorded in the report. Neither a trailing-newline nor trailing-space
variant of the string produces the recorded hash either. This looks like a
transcription slip from the prior session, not a real rendering discrepancy — the
rendering itself is proven consistent by the direct string comparison. I didn't
edit `ROBINHOOD_TESTNET_DRY_RUN.md` (it documents live, already-broadcast
transactions), but flagging so it can be corrected or re-verified against the live
Robinhood testnet deployment directly. My own test avoids the issue entirely by
comparing rendered strings directly rather than a copied hash constant.

## 3. Frontend — `/launch-edition`

- `src/lib/robinhood-contract.js` — defines Robinhood Chain mainnet
  (`chainId 4663`, RPC `rpc.mainnet.chain.robinhood.com`, Blockscout explorer
  `robinhoodchain.blockscout.com`, native `ETH`) via viem's `defineChain`, plus a
  placeholder contract-address map (zero address — **not yet deployed**).
- `abis/ChromiesCommemorative.ts` — hand-written ABI subset needed by the page
  (mint, mintOpen, totalSupply, MAX_SUPPLY, MINT_PRICE, MAX_PER_WALLET,
  walletMinted, tokenURI, ownerOf, Transfer event) — same style as `abis/Chroma.ts`.
- `src/lib/wagmi.js` — added Robinhood Chain to `chains`/`transports` (Alchemy
  slug `robinhood-mainnet`, same `alchemyRpc()` helper pattern as `eth-mainnet`).
- `src/pages/LaunchEdition.jsx` — new mint page modeled directly on `Mint.jsx`
  (same status card / quantity selector / mint button / info-card layout,
  Symtext + `text-signal`/`text-ink` styling), simplified for the single-phase,
  no-allowlist mint flow.
- `src/App.jsx` — new route `/launch-edition`; `src/components/SiteHeader.jsx` —
  new "Chain Launch" nav link.
- `src/components/WalletButton.jsx` — generalized to accept an optional
  `requiredChain` prop (defaults to `DEFAULT_CHAIN`/Sepolia, so every existing
  call site is unaffected) instead of hardcoding Sepolia, so the new page can
  require Robinhood Chain instead. Minor side effect: the "wrong network"
  paragraph on the existing Sepolia pages now reads "Please switch to Sepolia"
  instead of "Please switch to Sepolia testnet" (derived from `chain.name`
  rather than a hardcoded string) — cosmetic only.
- Verified with a direct `vite build` (bypassing the unrelated `prebuild`
  data-sync check below) — builds clean, no new lint errors.

**Known limitation carried over from reusing `ChromaRenderer` unchanged**:
the on-chain `tokenURI` JSON always has `"name":"Chroma #<id>"`, regardless of
this collection's own ERC-721 name/symbol — that's baked into the renderer's
template. Flag if marketplaces displaying "Chroma #7" instead of "Chain Launch
Edition #7" is undesirable; fixing it would require either a renderer change
(out of scope per spec) or a metadata-only override layer.

## 4. Payload selection — `scripts/robinhood/select-commemorative-100.js`

- Input: `public/data/mint-data.json` (the full, current 5,150-token dataset —
  confirmed fresh; note `art-pipeline/output/mint-data.json` is a **stale,
  2,000-token copy** as of this task and would fail `npm run
  verify:public-reveal-data`'s drift check — unrelated pre-existing repo state,
  surfaced by `npm run build`'s `prebuild` hook when I tried it).
- Excludes all 9 legendary IDs via `art-pipeline/legendary-token-ids.js`'s
  `isLegendaryToken()` (pool: 5,141 tokens).
- Deterministic selection: same `mulberry32`/`seedFromStr`/`shufflePick` PRNG
  convention already used in `art-pipeline/gold-token-ids.js`, seed string
  `"chromies-commemorative-launch-v1"`. Verified reproducible both within a
  single run (double-run comparison) and across separate process invocations
  (identical `sha256` of the output token array both times:
  `2079e16f126016c592d5f6c7259f41b8bbc58bdfe720ba91312009b3305d7971`).
- Sanity checks before writing anything: exact hex byte lengths (2048 pixels /
  32 traits), no duplicate or legendary token IDs, `totalPixels` (traits[17:19])
  within ChromaStorage's enforced 0–4096 range.
- Remaps the 100 selected *source* tokenIds to sequential *commemorative*
  tokenIds 1–100, sorted by source tokenId for auditability (a design choice —
  flag if a shuffled/non-sequential final numbering is preferred instead).
- Outputs:
  - `reports/robinhood/commemorative-100.json` — full manifest with provenance
    (`sourceTokenId` per commemorative ID) and `totalPixels`.
  - `reports/robinhood/seed-calldata.json` — `seedPayloads()` call args, chunked
    into **10 batches of 10 tokens** each.

**Batch sizing**: `forge test --gas-report` measured `seedPayloads` at up to
~51.0M gas for all 100 in one call (~510k gas/token — mostly SSTORE2 deploy
cost). 10/batch keeps each call ≈5.1M gas, comfortably under typical block gas
limits. This is a local-EVM-execution estimate; the prior Robinhood testnet dry
run needed `--gas-estimate-multiplier 400` for deployment due to L1 data-fee
intrinsic-gas quirks on this Arbitrum-based L2 — **re-verify real gas/fees with
a live testnet broadcast of one batch before running all 10 batches on
mainnet.**

**End-to-end proof** (`test/robinhood/CommemorativeSeedCalldata.t.sol`, new):
loads the *actual* `reports/robinhood/seed-calldata.json` this script produced
(not a hand-written fixture) via `vm.parseJsonUintArray`/`parseJsonBytesArray`,
feeds it through all 10 `seedPayloads()` calls on a freshly deployed contract,
opens mint, mints the full 100 across 50 wallets, and renders `tokenURI` for
tokens 1 and 100 — all passing. This catches any JS↔Solidity hex-encoding
mismatch the unit tests (hand-picked fixtures) wouldn't.

Added `{ access = "read", path = "./reports/robinhood" }` to `foundry.toml`'s
`fs_permissions` (read-only) so this integration test can load the script's
output.

## 5. Decisions needed before a real deploy

1. Confirm/replace name, symbol, and `MINT_PRICE` placeholders.
2. Confirm whether royalties (`ERC2981`) should be added.
3. Confirm sequential-by-source-id commemorative numbering vs. a shuffled
   alternative.
4. Re-verify `seedPayloads` batch gas live on Robinhood Chain testnet before
   sizing mainnet batches (10/batch is a local-EVM estimate).
5. Sync `art-pipeline/output/mint-data.json` (stale) — unrelated to this task
   but affects `npm run build`'s `prebuild` check; doesn't block `vite build`
   directly or anything built here.
6. Re-verify or correct the stale hash in `ROBINHOOD_TESTNET_DRY_RUN.md` (§2).
7. Deploy `ChromiesCommemorative` + point `ChromaRenderer` at it + set the real
   address in `src/lib/robinhood-contract.js` (currently the zero-address
   placeholder) before `/launch-edition` can go live.
