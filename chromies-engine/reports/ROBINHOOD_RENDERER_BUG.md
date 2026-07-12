# Corrected Renderer — Root Cause, Fix, and Redeploy

**Date:** 2026-07-12
**Trigger:** Blockscout showed a broken image for minted mainnet commemorative token #1.

---

## 1. Root cause

`contracts/ChromaRendererPngLib.sol` — the library that assembles the on-chain PNG —
was **never committed to git**. `git log --follow` on that path returns no history at
all, and `git status` still shows it as untracked (`??`) even today. Every deployment
that used it (the live Sepolia ETH-path renderer, the RH testnet dry-run, the RH
testnet smoke test, and the RH mainnet deploy) was built from an uncommitted local
copy of the file, which already contained the bug described below. There is no
"commit that introduced the bug" — there was never a commit at all. This is itself a
process failure independent of the code bug: rendering logic this critical was never
checked in, so it could drift silently between deploys with zero diff trail.

**Sepolia verdict:** the live Sepolia `ChromaRenderer` (ETH-path deployment) was
strict-decoded directly via `eth_call tokenURI(1)` and carries the **same bug** —
`IHDR` height field reads `0`. It predates this fix and has not been redeployed as
part of this task (out of scope; the ETH collection has not yet minted against it in
a way that would be user-visible the way the RH mainnet mint was).

## 2. The bugs (found together while root-causing the display issue)

### 2a. `ChromaRendererPngLib.IHDR_DATA` — height hardcoded to 0

```solidity
// before
bytes internal constant IHDR_DATA = hex"00000040000000000403000000";
//                                        ^^^^^^^^ width=64   ^^^^^^^^ height=0 (BUG)

// after
bytes internal constant IHDR_DATA = hex"00000040000000400403000000";
//                                        ^^^^^^^^ width=64   ^^^^^^^^ height=64
```

Every rendered PNG declared a canvas of `64 x 0` pixels. Pillow/browsers/Blockscout
either refuse to decode a zero-height image outright or render nothing — this is
exactly the "broken image" Blockscout showed. It never showed up as a rendering
*error* on-chain because nothing on the write path checks the IHDR fields it just
wrote; and it never showed up in prior "parity" tests because every one of those
tests compared a render against **another render of the same buggy code path**
(hash-vs-self / pixel-diff-vs-self), which a self-consistent-but-spec-invalid PNG
always passes.

### 2b. `ChromaRendererCrc32.sol` — four independent CRC32 bugs

Discovered while building a strict, spec-compliant decoder to validate the IHDR fix
(a real decode necessarily verifies chunk CRCs, which the old hash-vs-self tests
never did):

1. **Table lookup:** `initTable()` packs 8 table entries per 32-byte word (4-byte
   stride). Every lookup site did `mload(add(table, shl(2, b)))` and used the raw
   32-byte result directly, instead of `shr(224, ...)`-ing it down to the actual
   4-byte `table[b]` entry — silently mixing in the next 7 packed entries into every
   CRC accumulation.
2. **Chunk-type byte extraction:** `crc32Chunk`/`crc32ChunkMem` mixed in the 4
   `chunkType` bytes using `shr(mul(24, i), t)`, which is the wrong shift for a
   left-aligned `bytes4` value (byte 0 is bits `[255:248]`, not `[31:24]`). Corrected
   to `shr(sub(248, mul(8, i)), t)`.
3. **Accumulator initialization:** `let crc := not(0)` sets all 256 EVM bits to 1,
   not the 32-bit CRC32 seed `0xffffffff`. The extra set bits above bit 31 leaked into
   the running CRC on every `shr(8, crc)` step. Fixed to `let crc := 0xffffffff` with
   the final result masked `and(not(crc), 0xffffffff)`.
4. **`crc32ChunkMem` double-counting:** this variant mixed in `chunkType` bytes
   *and* expected `memPtr` to already point at a buffer that includes those same
   type bytes — double-counting them. The two production call sites
   (`_writePlteChunk`/`_writeIdatChunk`) already pass `memPtr` at the type bytes with
   `totalLen` covering type+data, so the type-mixing loop was removed from
   `crc32ChunkMem` entirely (the `chunkType` parameter is now anonymous).

Only the **hardcoded** `CRC_IHDR`/`CRC_IEND` constants (used for the two
never-computed-through-the-table chunks) were unaffected. Every PLTE and IDAT chunk
CRC ever emitted by this library was wrong. This had **no visible effect** before now
because PNG decoders that ignore CRC mismatches (or fail earlier on the height=0 IHDR)
never got far enough to notice, and — again — every prior test only ever compared
renders to each other.

`chromies-engine/scripts/gen_crc_lib.py` was updated to emit `ChromaRendererCrc32.sol`
with all four fixes, and to **derive** `CRC_IHDR`/`CRC_IEND` from the actual IHDR/IEND
bytes via Python's `zlib.crc32` rather than hand-pasting them, so they can never drift
from `ChromaRendererPngLib.IHDR_DATA` again.

## 3. RH-specific metadata strings

`contracts/ChromaRenderer.sol` previously hardcoded `"Chroma #<id>"` /
`"Chroma is a fully on-chain 64x64 indexed-color NFT."` inside `_encodeTokenJson`.
Refactored into two `internal view virtual` hooks, `_tokenName`/`_tokenDescription`,
with those same strings kept as the **default** (i.e. the shared ETH-path renderer's
behavior is unchanged — this is a finding, not a fix: any ETH-collection renderer
deployed from this file today still emits `"Chroma #<id>"` and the generic
description).

`contracts/robinhood/ChromaRendererRobinhood.sol` is a new, thin subclass used only
for Robinhood Chain deployments, overriding those two hooks:
- `name`: `"Chromie #<id>"`
- `description`: `"One of the canonical first 100 Chromies — fully on-chain on
  Robinhood Chain."`

## 4. Strict image validation (hash-vs-self banned as sole check)

- `chromies-engine/engine/png_strict.py` — spec-enforcing decoder: signature, chunk
  stream well-formedness, IHDR field checks, CRC32 verification per chunk, and a
  Pillow `verify()` + `load()` pass.
- Wired into `chromies-engine/scripts/parity_harness.py` (local payload renders) and
  `scripts/sepolia_tokenuri_money_test.py` (live Sepolia renders) — both now fail hard
  on any spec violation instead of only diffing pixels against a local preview.
- `scripts/strict_verify_tokenuri.py` — standalone CLI for ad-hoc live verification
  against any contract/RPC (`--rpc <alias> --contract <addr> --token-id <id>`). This
  is the tool used below for both the testnet insurance run and the mainnet
  redeploy.
- `test/ChromaRendererPngStrict.t.sol` — Foundry-level independent re-parse of the
  chunk stream (own IHDR checks, own CRC32 recomputation) so a bug in the library's
  own offset constants cannot self-certify. Includes a permanent regression guard,
  `test_IhdrHeightIsNotZero()`.

All 23 `test/robinhood/*` tests, the 3 new `ChromaRendererPngStrict.t.sol` tests, and
the 2 `ChromaRendererGasRegression.t.sol` tests pass post-fix (gas ceilings were bumped
slightly — computing *correct* CRCs costs a little more gas than the old broken
table-corrupted path).

## 5. Testnet insurance deploy (corrected renderer)

Brand-new, disposable stack — `script/robinhood/DeployCorrectedRendererTestnet.s.sol`
— exercising the real `ChromiesCommemorative.tokenURI()` wrapper end-to-end (mint +
`_requireOwned`, not just a direct renderer call):

| Contract | Address |
|---|---|
| `ChromaPaletteData` (throwaway) | `0x3C8C9615889762bDcF9647a3C86C74aFA498a158` |
| `ChromiesCommemorative` (throwaway) | `0x9C34Bd0c872983e33611f0cF1cF3C1C968516736` |
| `ChromaRendererRobinhood` (corrected) | `0x08288c62d945cAd7bc1449a32997677208F306a4` |

Seeded batch 0 (tokens 1–10), flipped `mintOpen`, minted token 1, then ran
`strict_verify_tokenuri.py --rpc robinhood_testnet --contract
0x9C34Bd0c872983e33611f0cF1cF3C1C968516736 --token-id 1`:

```
name='Chromie #1'
description='One of the canonical first 100 Chromies — fully on-chain on Robinhood Chain.'
tokenURI sha3-256: 0x8b51f545223712d3f1a6064e2618d1eb7e631cfff8363f95940b82524302ddc9
PASS: strict PNG validation OK — width=64 height=64 bit_depth=4 color_type=3 pil_mode=P
```

(The em dash above decodes to the correct single codepoint `U+2014`; a garbled `�`
seen in some Windows console output was a display-only codepage artifact, verified by
reading the raw JSON bytes directly — not a data issue.)

**Clean pass.** Cleared for mainnet.

## 6. Mainnet redeploy (corrected renderer)

Live mainnet contracts were **not** redeployed from scratch — the existing,
already-verified, already-seeded `ChromiesCommemorative` and `ChromaPaletteData`
were reused (`script/robinhood/DeployCorrectedRendererMainnet.s.sol` deploys only the
new renderer and re-points the commemorative at it via `setRenderer`):

| Contract | Address | Status |
|---|---|---|
| `ChromiesCommemorative` | `0x10953E4975C35529a5034D54eBC9266cec0CE69D` | existing, unchanged |
| `ChromaPaletteData` | `0xb3ad67d60C44E6db461f8957AF7a2f664c01275a` | existing, unchanged |
| `ChromaRenderer` (old, buggy) | `0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437` | superseded |
| **`ChromaRendererRobinhood` (new, corrected)** | **`0xFf467699B900FC4228A34d2229cC074f37DCFfA5`** | **live** |

Post-deploy wiring confirmed: `token.renderer()` → new address;
`renderer.chromaStorage()` → the commemorative; `renderer.paletteData()` → the
verified palette. `mintOpen` (`false`) and `totalSupply` (`2`) were both unchanged by
this deploy — no seeding, no minting, no mint-open action was taken.

Verified on Blockscout: https://robinhoodchain.blockscout.com/address/0xff467699b900fc4228a34d2229cc074f37dcffa5
(`Pass - Verified`).

Tokens 1 and 2 were already minted from the earlier flip/mint/revert diagnostic cycle,
so both were strict-validated through the **real** `ChromiesCommemorative.tokenURI()`
wrapper (not a direct renderer call):

```
token 1: name='Chromie #1' — PASS width=64 height=64 bit_depth=4 color_type=3 pil_mode=P
         sha3-256: 0x8b51f545223712d3f1a6064e2618d1eb7e631cfff8363f95940b82524302ddc9
token 2: name='Chromie #2' — PASS width=64 height=64 bit_depth=4 color_type=3 pil_mode=P
         sha3-256: 0xfb8e5e08df7a3a88cc63afa096b28fab600a5e91d2c6c39574ec571364a3a3d4
```

Token 1's hash is **identical** to the testnet insurance run's token 1 hash (same
source payload, deterministic renderer) — an independent cross-chain parity check for
free.

## 7. Cost

| Chain | Before | After | Spent |
|---|---|---|---|
| Testnet (46630) | 0.432586820880000000 ETH | 0.415376508160000000 ETH | ~0.0172 ETH |
| Mainnet (4663) | 0.026469369801344405 ETH | 0.026219832675644405 ETH | 0.000249537125700000 ETH |

## 8. What was NOT done

- `mintOpen` was **not** touched (already `false`, left `false`).
- No new tokens were minted on mainnet beyond the pre-existing 2.
- The shared ETH-path `_tokenName`/`_tokenDescription` defaults in
  `contracts/ChromaRenderer.sol` were **not** changed — any ETH-collection renderer
  still emits `"Chroma #<id>"` / the generic description. The Sepolia ETH-path
  renderer's IHDR/CRC bug was also **not** fixed live (out of scope for this task) —
  flagged as a finding for a separate decision.

Reopening mint (or fixing the Sepolia deployment) is JB's call after reviewing this
report.
