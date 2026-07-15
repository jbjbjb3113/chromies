# ChromiesAwakenRegistry — ERC-8048 Sidecar Spec

Status: **scaffold only — not deployed.** Two JB rulings open (below).

- Contract: `contracts/src/ChromiesAwakenRegistry.sol`
- Tests: `test/ChromiesAwakenRegistry.t.sol`
- Related (layer 1, off-chain): `chromies-engine/scripts/persona/` persona seed compiler

## ERC-8048 status

| Item | Value |
|---|---|
| Standard | [ERC-8048: Onchain Metadata for Token Registries](https://eips.ethereum.org/EIPS/eip-8048) |
| Status at adoption | **Draft** (Standards Track: ERC), authored September 2025 |
| Checked on | 2026-07-13 |
| Interface ID | `0xdf670be1` (`metadata(uint256,string)` selector; asserted in tests) |
| Profile | ERC-721T agent metadata profile (reserved key set; no extra interface ID or events) |

Because the standard is still Draft, re-verify the interface (function signature,
event shape, interface ID, ERC-721T key spellings) against the live EIP text
before any mainnet deploy.

## Adopted key set

Reserved awaken keys (written atomically by `awaken`, exact-bytes / case-sensitive):

| Key | Value (`bytes`) | Written by |
|---|---|---|
| `context` | UTF-8 text; Markdown recommended, may embed a fenced JSON block | `awaken` **only** — never `setMetadataAsOwner` |
| `endpoint[a2a]` | UTF-8 URI, Agent-to-Agent endpoint. Lowercase `a2a` is canonical; `endpoint[A2A]` is a distinct, non-reserved key | `awaken` **only** — never `setMetadataAsOwner` |

Non-reserved keys any holder may set via `setMetadataAsOwner` (ERC-721T
canonical spellings, all lowercase): `endpoint[mcp]`, `endpoint[web]`,
`endpoint[x402]`, `address[<erc-7930-chain-id>]`, plus arbitrary future keys.

## Write policy

- Caller must be `ownerOf(tokenId)` on the immutable `chromiesToken` pointer — checked live, so transfers move write rights with the token.
- `awaken(tokenId, context, a2aEndpoint)` writes both reserved keys, emits `MetadataSet` per write plus `Awakened(tokenId, owner)`.
- **Reserved keys are awaken-path-only, always:** `setMetadataAsOwner` reverts
  (`ReservedKey`) on an exact-bytes match of `context` or `endpoint[a2a]`,
  regardless of awaken state and regardless of `WRITE_ONCE`. Case-variants
  (`endpoint[A2A]`, `Context`, …) are ordinary non-reserved keys per ERC-8048
  exact-bytes semantics. The only mutation route for the reserved keys is
  `awaken`, so their state machine is exactly the awaken state machine.
- `WRITE_ONCE` (immutable constructor param) gates re-awakening:
  - `true`: any re-`awaken` reverts (`AlreadyAwakened`) — reserved keys are
    permanent after the first awakening.
  - `false`: current holder may re-`awaken` (rewriting both reserved keys)
    freely; non-reserved keys are holder-writable in both modes.
- **No admin write path to token metadata. No contract owner. No upgradeability.** The only contract-level state fixed at deploy is the token pointer and the `WRITE_ONCE` flag, both immutable.

## Open JB rulings

1. **`WRITE_ONCE` deploy value.** Both paths implemented and tested. `true` = one
   awakening per token, permanent context (strongest provenance story, no
   recovery from a bad write). `false` = holder-rewritable (agent personas can
   evolve; a flipped token can be re-contextualized by the new holder). Ruling
   pending; deploy blocks on it.
2. **Legendary hand-authored personas.** Layer-1 seeds emit
   `"handAuthored": null` for the nine legendary token IDs (45, 264, 603, 1173,
   1294, 2222, 3792, 4354, 4698 — from `art-pipeline/legendary-token-ids.js`).
   Open question: do the legendary artists author their tokens' `context`
   values, and if so, are those written by the artist wallet, the holder, or
   pre-seeded before transfer? Interacts with ruling 1 (a hand-authored context
   under `WRITE_ONCE=true` must be written by whoever holds the token at
   awaken time, exactly once).

## Renderer-redeploy checklist item

The main token contract is frozen and does not implement ERC-8048, so clients
discover this sidecar via the ERC-8048 **Onchain Metadata Contract Reference**
extension: a top-level `"metadata_contract"` string in the `tokenURI` JSON.

- [ ] `ChromaRenderer` (or its successor) must emit a top-level
      `"metadata_contract"` field in every token's `tokenURI` JSON.
- [ ] Field value format: ERC-7930 interoperable address of this registry,
      lowercase `0x`-prefixed hex, single JSON string (chain ID + 20-byte
      contract address; see the EIP's Agent NFT example).
- [ ] **CREATE2 address dependency:** the renderer bakes the registry address
      into its output, so deploy the registry via CREATE2 with a pinned salt +
      init code so its address is known (and reproducible) *before* the
      renderer redeploy is prepared. Constructor args (`chromiesToken`,
      `WRITE_ONCE`) are part of init code — **the CREATE2 address changes if
      the `WRITE_ONCE` ruling changes.** Do not precompute the address until
      ruling 1 lands.
- [ ] Renderer redeploy is a separate gated task — this scaffold does not touch
      `ChromaRenderer.sol`.

## Test coverage

`forge test --match-contract ChromiesAwakenRegistryTest`:
holder-gating (awaken + setMetadataAsOwner + transfer), both `WRITE_ONCE`
paths, ERC-165 (`0xdf670be1`, `0x01ffc9a7`, negative cases), compile-time
interface ID assertion, `MetadataSet`/`Awakened` event emission, non-holder and
nonexistent-token reverts, key case-sensitivity (`endpoint[a2a]` ≠
`endpoint[A2A]`), empty-bytes default reads, and an `awaken` gas snapshot.
Reserved-key guard regressions (parameterized over both `WRITE_ONCE` values):
generic-path writes to `context` / `endpoint[a2a]` revert pre-awaken and
post-awaken; `awaken` still succeeds normally after those reverts; case-variant
keys stay writable pre- and post-awaken.

Read path note: `metadata(uint256,string)` is the only read surface and is
untouched by the reserved-key write guard — renderer/tokenURI plans (the
`metadata_contract` extension) resolve reserved keys through `metadata()` like
any other key.
