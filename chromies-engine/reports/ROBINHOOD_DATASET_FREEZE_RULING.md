# Robinhood Chain commemorative re-do — dataset freeze ruling

**Ruling (JB, 2026-07-12):**

> The non-legendary 5,141 dataset at merkle root
> `0x73008f45bfe38ec43fd00c9fa3af0dab1d8d6f5acdca7f87af9937d0a2887abd`
> is FROZEN as the art source for the Robinhood Chain commemorative re-do.
> Legendary slots remain open pending palette work and are excluded from
> the Robinhood collection entirely. Commit this ruling to the repo and
> promote the staging dataset to the paths the selection script reads.

## What was frozen

The staging candidate dataset built earlier this session
(`chromies-engine/generated/regen_5150_current/mint-data-excl-legendary.json`,
candidate root `0x73008f45bfe38ec43fd00c9fa3af0dab1d8d6f5acdca7f87af9937d0a2887abd`)
reflects, over the non-legendary 5,141 token IDs:

- `hat` slot byte fix (`None=0`, consistent with every other slot; `Chubby_Bandana` moved to byte 15).
- New `accessory` slot (byte index 21, `None=0` / `Cigarette=1`) — ratified this session.
- `accessory` Cigarette roll weight tuned to **3% aggregate** (measured 170/5,141 = 3.31%), per this session's final JB ruling (superseding the earlier ~1% pass).
- All other trait weights/pools unchanged from the prior "dataset provenance audit" phase.

Legendary token IDs (45, 264, 603, 1173, 1294, 2222, 3792, 4354, 4698) are untouched —
still gated on the legendary-finals palette work (see
`art-pipeline/legendary-finals/SOURCES.md`), and are excluded from the Robinhood
selection pool entirely (`scripts/robinhood/select-commemorative-100.js` already
filters them via `isLegendaryToken()`).

## What "promote to the paths the selection script reads" means

`scripts/robinhood/select-commemorative-100.js` reads exactly one path:
`public/data/mint-data.json`. That file is also the live-synced reveal source for
the main ETH-side 5,150 collection's frontend (`src/lib/chroma-reveal.js`) and its
Merkle-gated reveal (`Chroma.sol`), synced from the canonical batch-write path
`art-pipeline/output/mint-data.json` via `scripts/sync-public-reveal-data.ts` and
checked with `scripts/verify-public-reveal-data.ts` (also wired as the
`.githooks/pre-commit` hook, not yet installed locally).

To promote without leaving that pipeline in a broken/inconsistent state:

1. Built the full 5,150-record array = the newly-frozen 5,141 non-legendary
   records + the 9 existing legendary records already in
   `public/data/mint-data.json` (unchanged — legendary art is a separate,
   still-open gate, not touched by this ruling).
2. Wrote that merged array to `art-pipeline/output/mint-data.json` — this file
   was stale (2,000 records, pre-encoder-fix) and is now restored as the
   canonical batch-write source, at 5,150 records.
3. Fixed a real, pre-existing bug in `art-pipeline/generate-reveal-merkle.js`
   (the production reveal-merkle generator, not the candidate one): it converted
   `pixelsHex`/`traitsHex` to `Uint8Array` via viem's `hexToBytes` before calling
   `encodeAbiParameters`, which throws `TypeError: x.replace is not a function`
   on the current viem version — the `bytes` ABI type expects a hex string, not
   a `Uint8Array`. Fixed to pass hex strings directly (same fix already applied
   to `art-pipeline/candidate-merkle.js` earlier this session).
4. Ran `node generate-reveal-merkle.js` against the restored `output/mint-data.json`
   → new full-collection reveal root:
   **`0xb17659ae0e19720a50a2c90d16c6445029140596486ea6d808d363212ac73e7e`**
5. Ran `npm run sync:public-reveal-data` → copied
   `output/{mint-data.json,reveal-merkle-proofs.json}` to `public/data/`.
6. Ran `npm run verify:public-reveal-data` → **PASS** (mint-data.json and
   reveal-merkle-proofs.json hashes match `output/`, and the proofs' embedded
   root matches `reveal-merkle-root.txt`).
7. Sanity-checked `scripts/robinhood/select-commemorative-100.js`'s expected
   input against the new `public/data/mint-data.json` without invoking it
   (no re-selection was requested by this ruling): 5,141 non-legendary pool,
   0 malformed `pixelsHex`/`traitsHex` lengths.

## Scope note — this does NOT lift the main-collection "Pipeline — FROZEN" gate

`SESSION_HANDOFF.md`'s "Pipeline — FROZEN" section blocks mint/reveal-merkle
regen for the **main ETH 5,150 launch** until the legendary-finals gate clears
(4/9 slots still pending: DOPEMIND #2222, UPCOMING2 #3792, Serc #4354, Jack
Butcher #4698 palette-merge ruling). This ruling only freezes the non-legendary
art *for the Robinhood re-do*, which explicitly never includes legendary tokens.
The reveal-merkle regen above was necessary to keep `output/` and `public/data/`
internally consistent (both now reflect the same 5,150-record file, 9 of which
are the pre-existing, still-gated legendary rows) — it is **not** a declaration
that the main ETH collection's dataset is final or ready for its own launch.
That decision remains gated on the legendary-finals palette work, separately.

## File/data summary

| Item | Value |
|---|---|
| Candidate (staging) root, non-legendary 5,141 | `0x73008f45bfe38ec43fd00c9fa3af0dab1d8d6f5acdca7f87af9937d0a2887abd` |
| New full-collection reveal root, 5,150 (9 legendary rows preserved as-is) | `0xb17659ae0e19720a50a2c90d16c6445029140596486ea6d808d363212ac73e7e` |
| `art-pipeline/output/mint-data.json` | 5,150 records (was 2,000, stale) |
| `public/data/mint-data.json` | 5,150 records, synced from `output/` |
| Measured Cigarette accessory rate | 170/5,141 = 3.31% |
