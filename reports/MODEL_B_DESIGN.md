# Model B Design — Universal Permanence + Optional Finality (SEAL)

**Status:** **DESIGN — STOP for approval before contract code**  
**Generated:** 2026-07-07  
**Approved direction:** Model B — universal on-chain permanence, revised tiers (0.003 / 0.004 / 0.005 ETH), permanence/finality split.  
**Constraints:** No contract changes, no deploys, until this document is approved.

---

## 0. Executive summary

| Concept | Meaning in Model B |
|---------|------------------|
| **Permanence** | Every token’s mint pixels (+ traits) live in **SSTORE2** via a **project-executed batch inscription** post-reveal. `tokenURI` **never returns to IPFS** after that. This is “fully on-chain Chromies.” |
| **Finality (SEAL)** | **Optional, holder-elected, one-way.** `sealed = true` ⇒ pixels **immutable forever** (today’s `locked` semantics). |
| **Canvas on unsealed inscribed tokens** | **Allowed.** `applyDiff` / burn-with-diff on **inscribed ∧ ¬sealed** triggers **re-inscription** (new SSTORE2 pointer, canonical bytes updated). **Gas paid by tx sender** (burner on burn path, owner on `applyDiff`). |
| **Burn-into-token** | **Legal for unsealed tokens** (including inscribed-unsealed). **Reverts only when receiver is sealed.** |

**Core semantic shift:** Today `inscribe()` conflates permanence + finality (`locked=true` at inscription). Model B **splits** them.

---

## 1. State model

### 1.1 Lifecycle states (after Model B)

```
                    ┌─────────────┐
                    │ Unrevealed  │  revealed=false, hasData=false, sealed=false
                    └──────┬──────┘
                           │ reveal()
                           ▼
                    ┌─────────────┐
                    │  Revealed   │  revealed=true, hasData=false, sealed=false
                    │  (off-chain │  tokenURI → revealedBaseURI (IPFS/HTTP)
                    │   metadata) │  canvas: applyDiff OK (diffs only)
                    └──────┬──────┘
                           │ batchInscribe (project) OR legacy inscribe path
                           ▼
                    ┌─────────────┐
                    │  Inscribed  │  revealed=true, hasData=true, sealed=false
                    │  (on-chain  │  tokenURI → renderer.tokenURI (~3.0M gas)
                    │   pixels)   │  canvas: applyDiff → re-inscribe; burn-into OK
                    └──────┬──────┘
                           │ seal() — holder only, optional
                           ▼
                    ┌─────────────┐
                    │   Sealed    │  revealed=true, hasData=true, sealed=true
                    │  (final)    │  tokenURI → renderer; canvas frozen
                    └─────────────┘
```

**Invariants (normative):**

1. `sealed ⇒ hasData` (cannot seal without inscription).
2. `hasData ⇒ revealed` (batch inscription sets both).
3. `sealed` is **monotone** — no `unseal`.
4. `hasData` is **monotone** — no deletion of inscription (only pointer **replacement** via re-inscribe).

### 1.2 Storage layout changes

#### `Chroma.sol`

| Field (today) | Model B | Notes |
|---------------|---------|-------|
| `mapping(uint256 => bool) public locked` | **`mapping(uint256 => bool) public sealed`** | Rename + resemanticize. `isLocked()` → **`isSealed()`** (keep `isLocked()` as deprecated alias returning `sealed` for one release, or break ABI in fresh deploy). |
| `mapping(uint256 => bool) public revealed` | **unchanged** | |
| `mapping(uint256 => bytes32) public revealedTraits` | **unchanged** | Cleared on **first** inscription (same as today). |
| *(none)* | **`bool public batchInscribeOpen`** or **`uint64 public batchInscribeDeadline`** | Access-control window for project batch (see §4). |
| *(none)* | **`uint64 public inscriptionGeneration`** optional | Per-token generation counter for indexers / archaeology (see §3.2). |

**Derived (not stored):**

| Predicate | Definition |
|-----------|------------|
| `isInscribed(tokenId)` | `chromaStorage.hasData(tokenId)` |
| `isSealed(tokenId)` | `sealed[tokenId]` |
| `isFinal(tokenId)` | `isSealed(tokenId)` |
| `canMutatePixels(tokenId)` | `isInscribed(tokenId) && !isSealed(tokenId)` |

#### `ChromaStorage.sol`

| Field (today) | Model B | Notes |
|---------------|---------|-------|
| `mapping(uint256 => address) pixelPointers` | **unchanged** | Pointer **replaced** on re-inscribe; old pointer orphaned. |
| `mapping(uint256 => bytes32) traits` | **unchanged** | `[17–18]` updated on re-inscribe when pixel count changes. |
| `mapping(uint256 => uint256) totalPixels` | **unchanged** | |
| `writeTokenData` one-shot guard | **Keep for first write** | `TokenAlreadyWritten` on duplicate **initial** inscription. |
| `rewritePixels` | **Primary re-inscribe write path** | Already replaces SSTORE2 pointer (`:199`). |

**Optional extension (indexer-facing):**

```solidity
mapping(uint256 => address[]) public pixelPointerHistory; // append-only
mapping(uint256 => uint256) public inscriptionGeneration;  // increment on each rewrite
```

**Design choice flagged (not decided):** store history on-chain vs emit events only.

#### `ChromaCanvasV2.sol`

| Field | Model B |
|-------|---------|
| `tokenDiffs`, `customized`, `actionPoints`, etc. | **unchanged** |
| Internal gate | `isLocked` → **`isSealed`** |

#### `ChromaRenderer.sol`

| Today | Model B |
|-------|---------|
| `_statusAttribute`: `"Inscribed"` when `isLocked` | Split: **`"Status":"On-chain"`** when `hasData`; **`"Status":"Sealed"`** when sealed (or combined attributes — flagged in §5). |

### 1.3 Migration semantics

| Environment | Policy |
|-------------|--------|
| **Current Sepolia** | Tokens 1–5 inscribed with **old semantics** (`locked=true` at inscribe). **No migration.** |
| **Model B Sepolia** | **Full suite redeploy** — new `Chroma`, `ChromaStorage`, `ChromaCanvasV2`, `ChromaRenderer`, `ChromaPaletteData`, `PixelMarketplace` addresses. Fresh `revealRoot`. |
| **Mapping old → new** | Old `locked=true` ≈ new **`sealed=true` AND `hasData=true`**. Old `inscribe()` ≈ new **`batchInscribe` + immediate `seal()`** if parity with legacy holder expectation is desired for demo tokens only (operational, not automatic). |
| **Production mainnet** | Greenfield deploy; batch pass before public trading if policy requires uniform permanence. |

---

## 2. Function gating — full before/after table

Legend: **✓** allowed · **✗** reverts · **→** new/changed behavior · **n/a** unchanged

### 2.1 `Chroma.sol`

| Function | Before (today) | After (Model B) |
|----------|----------------|-----------------|
| `reveal` | ✓ if token exists (`_requireOwned`) | **unchanged** |
| `inscribe` (holder) | ✓ owner; sets `locked`, `hasData`, bakes | **→ Optional retain** for team / late self-service: sets `hasData`, **does not seal**; or **deprecate** in favor of batch-only permanence |
| **`batchInscribe`** *(new)* | n/a | ✓ **`onlyOwner`**, window guard; per token: merkle verify, `writeTokenData`, bake, **no seal**; idempotent skip if `hasData` |
| **`seal`** *(new)* | n/a | ✓ **`ownerOf == msg.sender`**, `hasData`, `!sealed` → `sealed=true` |
| **`reInscribeFromCanvas`** *(new, writer-only)* | n/a | ✓ callable only by `Chroma` writer path; `hasData && !sealed`; composite diffs → `rewritePixels` → `clearDiffs` |
| `isLocked` / `isSealed` | `locked` flag | **`sealed` flag** |
| `tokenURI` | 3-way: unrevealed / IPFS / renderer | **unchanged routing**; IPFS branch **unreachable once `hasData`** |
| `setRenderer` | owner | **unchanged** (freeze is operational — §8) |
| `mint` / phases | unchanged economics | **new price constants** (§6) |

### 2.2 `ChromaStorage.sol`

| Function | Before | After |
|----------|--------|-------|
| `writeTokenData` | one-shot | **unchanged** — first inscription only |
| `rewritePixels` | bake at inscribe | **+ primary re-inscribe path** (may append history / generation) |
| `getPixels` / `getTraits` | read active pointer | **unchanged** — always **current** canonical pointer |

### 2.3 `ChromaCanvasV2.sol`

| Function | Before | After |
|----------|--------|-------|
| `applyDiff` | ✗ if `isLocked` | ✗ if **`isSealed`**; if **`hasData && !sealed` →** apply diff then **`Chroma.reInscribeFromCanvas`** in same tx |
| `revealBurnAndApplyDiff` | ✗ if receiver `isLocked` (after burn, before diff) | ✗ if receiver **`isSealed`**; **✓ if inscribed-unsealed** — AP credit proceeds; diff triggers **re-inscribe**; **gas: msg.sender** |
| `spendAP` | ✓ owner, no lock check | **unchanged** (works on sealed tokens) |
| `transferAP` / `operatorTransferAP` | ✓ no lock check | **unchanged** |
| `earnAP` (owner) | ✓ | **unchanged** |
| `calculateBurnAP` | uses storage if `hasData` | **unchanged** |
| `computeFinalPixels` | reads SSTORE2 + diffs | **unchanged** — re-inscribe reads this output |
| `clearDiffs` | chroma-only | **unchanged** — called after successful re-inscribe |

### 2.4 `PixelMarketplace.sol`

| Function | Before | After |
|----------|--------|-------|
| `list` / `buy` / `cancel` | no inscription awareness | **unchanged** (AP economy independent of seal) |

### 2.5 `ChromaRenderer.sol`

| Function | Before | After |
|----------|--------|-------|
| `tokenURI` / `renderSVG` | reads active SSTORE2 | **unchanged** — always renders **current** pointer |
| metadata attributes | `"Inscribed"` if locked | **→** distinguish **On-chain** vs **Sealed** (wording TBD) |

### 2.6 Summary matrix by token state

| Operation | Revealed (no SSTORE2) | Inscribed, unsealed | Sealed |
|-----------|:---------------------:|:-------------------:|:------:|
| `tokenURI` | IPFS/base URI | renderer | renderer |
| `applyDiff` | ✓ (diffs staged) | **✓ → re-inscribe** | ✗ `TokenSealed` |
| `revealBurnAndApplyDiff` (as receiver) | ✓ | **✓ → re-inscribe if diff** | ✗ |
| `spendAP` | ✓ | ✓ | ✓ |
| AP marketplace | ✓ | ✓ | ✓ |
| `seal()` | ✗ (not inscribed) | ✓ holder | ✗ already sealed |
| Project `batchInscribe` | ✓ if revealed | skip (idempotent) | skip |
| Re-inscribe | n/a | ✓ via canvas paths | ✗ |

---

## 3. Re-inscription mechanics

### 3.1 Trigger paths

| Path | Who triggers | When | Cost bearer |
|------|--------------|------|-------------|
| **A. `applyDiff`** | Token owner | Each diff application on inscribed-unsealed | **`msg.sender`** (owner) pays full tx gas incl. re-inscribe |
| **B. `revealBurnAndApplyDiff`** | Token owner (owns receiver + sacrifice) | Non-empty `diffData` on inscribed-unsealed receiver | **`msg.sender`** (burner) |
| **C. Admin / project** | — | **Not available** — no privileged re-inscribe without holder action |

**No merkle re-proof on re-inscribe:** Mint leaf proves initial entitlement; canvas mutations are **authorized by gameplay** (AP spend + ownership). Re-inscribe writes **composite pixels**, not the original mint leaf.

### 3.2 Algorithm (`reInscribeFromCanvas`)

```
1. assert hasData(tokenId) && !sealed(tokenId)
2. (pixels, totalPixelCount) = canvas.computeFinalPixels(tokenId)
3. chromaStorage.rewritePixels(tokenId, pixels, totalPixelCount)  // new SSTORE2 pointer
4. canvas.clearDiffs(tokenId)
5. emit TokenReInscribed(tokenId, generation, newPointer)  // optional generation++
```

**Atomicity / `tokenURI` switchover:** Steps 3–4 occur in **one transaction** with no external call between pointer write and diff clear. After tx success, **`getPixels` returns new bytes**; `tokenURI` is consistent in the same block. Indexers should key off **`TokenReInscribed`** (and/or generation counter), not block delay.

### 3.3 SSTORE2 archaeology — orphaned pointers

Each `rewritePixels` / `SSTORE2.write` deploys a **new contract** holding the old byte array. The previous pointer is **not destroyed**.

| Aspect | Detail |
|--------|--------|
| On-chain persistence | Old bytes remain readable at old address **forever** (archaeology) |
| Canonical source | **`pixelPointers[tokenId]` only** — renderer / `tokenURI` ignore history |
| Gas | Each re-inscribe pays full new SSTORE2 write (~similar order to initial pixel write portion of inscribe) |

**Options flagged (do not decide):**

| Option | Description |
|--------|-------------|
| **A. Ignore** | No product surfacing; only active pointer matters |
| **B. Event-only history** | `TokenReInscribed` emits `previousPointer` / `newPointer` for indexers |
| **C. On-chain history array** | `pixelPointerHistory[tokenId].push(old)` — higher write gas, explorer “timeline” feature |
| **D. External indexer** | Subgraph reconstructs from events + `eth_getCode` on pointer addrs |

**Design ruling (PRE-RULED):** **Ignore / document-only.** Orphaned SSTORE2 contracts remain readable on-chain forever, but the product treats **`pixelPointers[tokenId]` as the sole canonical source** — no UI surfacing, no explorer “timeline” feature, no on-chain history array. One paragraph in comms/docs for archaeology-aware indexers; **no holder-facing exposure.**

**Minimum for implementation:** emit `previousPointer` / `newPointer` on `TokenReInscribed` (event-only, indexer-facing) — **not** a product feature.

### 3.4 AP accounting interaction

| Field | On re-inscribe |
|-------|----------------|
| `actionPoints[tokenId]` | **unchanged** |
| `totalApEarned` / `totalApSpent` | **unchanged** |
| `burnCount` | **unchanged** |
| `pixelsEdited` | **Already incremented in `_applyDiff`** before re-inscribe |
| `customized` | **Design:** remain `true` if historical edits existed; **`tokenDiffs` emptied** after re-inscribe |
| `totalPixels` (storage + trait bytes) | **Updated** to composite count |

**Invariant:** Re-inscribe **never** mints, burns, or transfers AP except via the normal `_spendAP` inside `_applyDiff` (1 AP per pixel edited).

### 3.5 Gas measurement (re-inscribe)

**Initial inscription (measured Foundry 2026-07-07, `GasStressProfile`):**

| Metric | Gas |
|--------|----:|
| `inscribe_min` | **553,819** |
| `inscribe_mean_5_samples` | **553,837** |
| `inscribe_max` | **553,849** |

**Re-inscribe (implementation must measure before audit):** Use existing `rewritePixels` path — expected **lower than full inscribe** (no merkle verify, no `sealed`/`revealedTraits` cleanup). Target harness: `test_Inscribe_PreservesCustomizedPixels` extended with gas snapshot. **Placeholder bound for planning: 350k–500k** until measured — **do not use for budget sign-off**.

---

## 4. Batch inscription design

### 4.1 Requirements (from product)

- **Project-executed** — no holder signatures.
- **Post-reveal** — tokens must be `revealed=true` (or batch sub-call reveals — **flagged:** single `batchRevealAndInscribe` vs two passes).
- **Pre-transfer OK** — may inscribe tokens still in minter wallets; **no `ownerOf` check**.
- **Idempotent** — safe on partial failure / reruns.
- **Does not seal** — permanence only.

### 4.2 Proposed API

```solidity
/// @notice Project permanence pass. Does not seal.
function batchInscribe(
    uint256[] calldata tokenIds,
    bytes[] calldata pixels,      // each 2048 bytes
    bytes[] calldata traits,      // each 32 bytes
    bytes32[][] calldata proofs
) external onlyOwner;

/// @notice Irreversible — close batch forever after verified universal pass
function renounceBatchInscribe() external onlyOwner;
```

**Per-item logic:**

```
for each i:
  if hasData(tokenIds[i]): emit BatchInscribeSkipped(tokenId, reason=AlreadyInscribed); continue
  if !revealed[tokenIds[i]): revert NotRevealed (or skip — prefer revert for visibility)
  merkle verify(revealRoot, leaf)
  writeTokenData(...)
  delete revealedTraits[tokenId]
  _bakeCanvasEdits(tokenId)
  emit TokenInscribed(tokenId)   // permanence
  // NO sealed=true
```

### 4.3 Access control — **PRE-RULED**

| Mechanism | Detail |
|-----------|--------|
| **Authorization** | **`onlyOwner`** — project-executed permanence pass |
| **Post-pass closure** | **`renounceBatchInscribe()`** — one-way; sets `batchInscribeOpen = false` permanently |
| **Timing** | Executed **after** verified universal pass (`hasData` coverage scan on full `totalSupply`) |
| **Public proof** | **`renounceBatchInscribe` tx hash** documented in public permanence proof package alongside batch tx hashes |

No deadline-only window without renounce; no separate `INSCRIBER` role. Compromised-key mitigation is **merkle-bound calldata + ops discipline + renounce immediately after verified pass**.

### 4.4 Tokens per tx vs block limit

**Measured batch gas (Foundry 2026-07-07, `ModelBBatchInscribeGas.t.sol`, NOT-FINAL probe):**

| Metric | Gas |
|--------|----:|
| `batchInscribe48_total` | **29,097,355** |
| `batchInscribe48_per_token` (amortized) | **606,194** |
| `batchInscribe48_idempotent_skip_per_token` | **8,162** |

**Reference single-tx holder `inscribe` (same fixture family):** **553,837** mean — per-token batch amortization is **~+9.5%** vs isolated inscribe due to loop/calldata overhead; collection budgeting must use **batch measurement**, not `inscribe_mean × 5,150`.

| Budget | Tokens / tx |
|--------|------------:|
| 30M block limit | ~49 theoretical |
| **27M safe target (90%)** | **~44** |
| **48 (design-doc batch size)** | **29.1M measured** — fits under 30M limit |

**Calldata:** ~2.5 KB/token (2048 + 32 + proof) → 48 tokens ≈ **120 KB** (within practical limits).

| Collection | Batch size | Txs |
|----------:|-----------:|----:|
| 5,150 | 48 | **108** |
| 5,150 | 44 | **118** |
| 5,150 | 1 (status quo) | 5,150 |

**Implementation note:** Loop with **`try/catch` discouraged** — prefer **all-or-nothing per batch** tx for atomicity, or explicit **`continue` + skip event** for idempotent reruns (see below).

### 4.5 Idempotency

| Scenario | Behavior |
|----------|----------|
| Token already `hasData` | **Skip** + `BatchInscribeSkipped(id, AlreadyInscribed)` |
| Token not revealed | **Revert entire batch** (recommended) OR skip with event (weaker visibility) |
| Invalid merkle proof | **Revert entire batch** |
| Partial batch tx succeeds, later tx fails | Rerun — skipped tokens idempotent |
| Double-submit same batch | Second run all skip — **no double-write** (`TokenAlreadyWritten` guard) |

**Invariant:** `batchInscribe` **cannot** skip merkle verification or write twice to active pointer.

### 4.6 Events (indexers)

```solidity
event TokenInscribed(uint256 indexed tokenId);           // permanence (keep)
event BatchInscribeStarted(uint256 indexed batchIndex, uint256 count);
event BatchInscribeCompleted(uint256 indexed batchIndex, uint256 inscribed, uint256 skipped);
event BatchInscribeSkipped(uint256 indexed tokenId, bytes32 reason);
event BatchInscribeWindowClosed(uint64 closedAt);
event TokenReInscribed(uint256 indexed tokenId, uint256 generation, address indexed newPointer);
event TokenSealed(uint256 indexed tokenId);              // finality (rename from TokenLocked)
```

### 4.7 Pre-transfer / minter-wallet operation

Batch **must not** call `ownerOf` for authorization. Requirements:

1. Token **minted** (`ownerOf != 0`).
2. **`revealed[tokenId]`** (or reveal bundled — flagged).
3. Merkle proof matches **`revealRoot`** and committed mint payload.

Holder may transfer **before or after** batch; permanence is **token-scoped**, not wallet-scoped.

---

## 5. SEAL design (holder finality)

### 5.1 Proposed API

```solidity
function seal(uint256 tokenId) external {
    if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
    if (!chromaStorage.hasData(tokenId)) revert NotInscribed();
    if (sealed[tokenId]) revert AlreadySealed();
    sealed[tokenId] = true;
    emit TokenSealed(tokenId);
}
```

| Property | Value |
|----------|-------|
| Initiator | **Holder only** |
| Direction | **One-way** |
| Prerequisite | **`hasData`** (inscribed) |
| Effect | `_applyDiff`, burn-with-diff, re-inscribe **all revert** |

### 5.2 Gas target

Seal is a **single cold bool SSTORE** (false → true): **~20k–25k gas** (+ baseline tx ~21k). **Target: <50k total** — measure in `ChromaPhaseMintTest`-style harness post-implementation.

### 5.3 Economic / product hooks — **PRE-RULED**

| Decision | Ruling |
|----------|--------|
| **Seal cost** | **Pure one-way state flag** at launch — gas-only, **no AP sink**, no economic coupling |
| **Marketplace** | Optional **“Sealed” badge/filter** — **frontend-only** if ever wanted; no contract hooks |
| **Auto-seal / deadline** | **Rejected** — conflicts with optional holder-elected finality |

### 5.4 Metadata / renderer

| State | Suggested attributes (flagged) |
|-------|-------------------------------|
| Inscribed, unsealed | `"Permanence":"On-chain"`, `"Finality":"Open"` |
| Sealed | `"Permanence":"On-chain"`, `"Finality":"Sealed"` |

Replace today’s single `"Status":"Inscribed"` (`ChromaRenderer._statusAttribute`).

---

## 6. Pricing

### 6.1 Target constants

| Constant | Deployed today | **Model B target** |
|----------|---------------:|-------------------:|
| `ALLOWLIST_ONE_PRICE` | 0.0025 ether | **0.003 ether** |
| `ALLOWLIST_TWO_PRICE` | 0.0035 ether | **0.004 ether** |
| `MINT_PRICE` (public) | 0.0045 ether | **0.005 ether** |

Wei: `3e15`, `4e15`, `5e15`.

### 6.2 Published-price drift (0.005 vs 0.00525)

| Source | Tier 1 | Tier 2 | Public | Notes |
|--------|-------:|-------:|-------:|-------|
| **`contracts/Chroma.sol` (Sepolia deployed)** | 0.0025 | 0.0035 | 0.0045 | On-chain truth today |
| **Model B decision** | 0.003 | 0.004 | **0.005** | Approved direction |
| **`art-pipeline/chromies-project-journal.md`** (“Mint Structure Locked”) | 0.003 | 0.004 | **0.00525** | Also lists per-wallet **2/2/3** (stale vs contract **5/5/5**) |
| **`docs/chromies-contracts.md`** (generated stale) | 0.003 | 0.005 | 0.006 | Regenerate after deploy |
| **`SESSION_HANDOFF.md`** | 0.0025 | 0.0035 | 0.0045 | Matches deployed |
| **`src/lib/chroma-contract.js` fallbacks** | 0.0025 | 0.0035 | 0.0045 | RPC-fail fallback |

**0.00525 origin:** Journal “Mint Structure (Locked)” — public price **0.00525 ETH** with gross **~$27,695 @ $1,450/ETH**. Model B decision **supersedes** journal public tier to **0.005 flat** (**decrease of 0.00025 ETH vs last published journal figure**). **Implementation must update journal + comms inventory** before external comms; no on-chain `0.00525` exists today.

**Revenue at full sellout (4,950 community mints):**

| | Current | Model B | Δ |
|---|--------:|--------:|--:|
| Gross | 16.275 ETH | **18.750 ETH** | **+2.475 ETH** |

### 6.3 Change inventory (from UNIVERSAL_INSCRIPTION §3.3 — folded)

#### Contracts
- `contracts/Chroma.sol` — price constants + Model B state/API

#### Tests (hardcoded literals → new prices)
- `test/Chroma.t.sol`, `test/GasStressProfile.t.sol`, `test/GasStressInvariant.t.sol`

#### Scripts
- `script/TestMint.s.sol`, `script/TestBurnAndList.s.sol`, `scripts/diagnose-mint.ts`

#### Frontend
- `src/lib/chroma-contract.js` — `MINT_PRICES_ETH`
- `src/pages/Mint.jsx` — reads chain (auto after redeploy)

#### Docs
- `SESSION_HANDOFF.md`, `chromies-engine/reports/SEPOLIA_DEPLOY_SCOPE.md`, `art-pipeline/chromies-project-journal.md`, `docs/chromies-contracts.md`, `CHECKLIST.md`

#### Model B **additional** surface (new section)
- `src/lib/chroma-ownership.js` — `inscribed` / `sealed` predicates
- `src/pages/Inscribe.jsx` → split **Seal** UX from permanence (batch is project-side)
- `src/pages/Canvas.jsx`, `Burn.jsx`, `FAQ.jsx`, `MyChromies.jsx` — unsealed inscribed editing + seal CTA
- `src/lib/chroma-gas-copy.js` — re-inscribe + seal gas copy
- `abis/*` — new events/functions

---

## 7. Fuzz / invariant test spec

These become **required** properties for Foundry fuzz + invariant suite post-implementation.

### 7.0 Plain-language invariants (normative)

1. **Sealed ⇒ pixels immutable forever.** Once `sealed`, no `applyDiff`, burn-with-diff, or re-inscribe path may change canonical pixels.
2. **Re-inscription preserves ownership and AP balances except as specified.** `ownerOf`, `actionPoints`, `totalApEarned`, and `totalApSpent` are unchanged by re-inscribe; only `_spendAP` for the diff pixels applies.
3. **`batchInscribe` cannot skip merkle verification or double-inscribe.** Already-inscribed tokens are idempotently skipped; merkle verify + `TokenAlreadyWritten` guard prevent double-write to active pointer.
4. **Inscribed ⇒ `tokenURI` never falls back off-chain.** Once `hasData`, `tokenURI` routes through renderer only — IPFS/`revealedBaseURI` branch unreachable.

### 7.1 Core invariants

| ID | Property |
|----|----------|
| **I1** | `sealed(id) ⇒ hasData(id)` |
| **I2** | `hasData(id) ⇒ revealed(id)` |
| **I3** | `sealed(id)` never transitions to `false` |
| **I4** | `sealed(id) ⇒ applyDiff(id,·)` always reverts |
| **I5** | `sealed(id) ⇒ revealBurnAndApplyDiff(..., id,·)` always reverts |
| **I6** | `hasData(id) ∧ ¬sealed(id) ∧ applyDiff succeeds ⇒` active pointer changes iff diff non-empty |
| **I7** | `hasData(id) ⇒ tokenURI(id)` never uses `revealedBaseURI` path |
| **I8** | `batchInscribe` skip: `hasData` before ⇒ `hasData` after, same pointer |
| **I9** | `batchInscribe` success: `¬hasData` before ⇒ `hasData` after, `¬sealed` |
| **I10** | Re-inscribe **never** changes `ownerOf`, `actionPoints`, `totalApEarned`, `totalApSpent` except `_spendAP` for diff |
| **I11** | `seal(id)` only by holder; `seal(id) ⇒ sealed` permanent |
| **I12** | Active `getPixels(id)` always matches `computeFinalPixels(id)` when `tokenDiffs` empty |

### 7.2 Suggested fuzz scenarios

- Random diff sequences on inscribed-unsealed → seal mid-sequence → all further diffs revert.
- Batch with random subset already inscribed → idempotent skip count correct.
- Burn-into inscribed-unsealed with diff → AP credited, pointer updated, sacrifice dead.
- Re-inscribe loop N times → pointer changes N times, AP accounting linear.

---

## 8. Renderer-lock in sequence

| When | Action |
|------|--------|
| **Before batch pass** | Deploy Pass B.1 renderer; wiring verified (`verify_sepolia_wiring`, artifact proof) |
| **After batch pass** | Spot `tokenURI` on N tokens (money-test pattern); **1011 parity** |
| **Renderer freeze** | **Operational policy:** no further `setRenderer` after verification — **not on-chain today** |
| **Seal semantics vs renderer** | Seal **does not** change renderer address; metadata **does** change finality attributes. **Frozen renderer** ensures sealed and unsealed tokens share deterministic render logic |

**Flagged:** optional `renounceSetRenderer()` or timelock — out of Model B scope unless requested.

---

## 9. Threat pass

### 9.1 Griefing — forced re-inscription cost

| Attack | Feasible? | Analysis |
|--------|:---------:|----------|
| Third party applies diff to victim token | **No** | `applyDiff` requires `ownerOf == msg.sender` |
| Third party burns into victim token | **No** | Must own **both** sacrifice and receiver |
| Owner self-grief (1-pixel diff → re-inscribe gas) | **Yes** | Self-inflicted; owner pays own gas |
| Forced re-inscribe **without** consent | **No** | Diff requires owner signature path |

**Burn-into-unsealed** credits AP to receiver **before** diff/re-inscribe — receiver benefits from AP; attacker cannot force cost on someone else’s token without owning it.

### 9.2 Reentrancy (new write paths)

| Path | Risk | Mitigation |
|------|------|------------|
| `batchInscribe` loop | External calls via SSTORE2 deploy | **CEI**; **`nonReentrant`** on `Chroma` mutators |
| `reInscribeFromCanvas` | `clearDiffs` after write | Write pointer **before** clearing; canvas callbacks **none** |
| `seal` | Minimal | No external calls |
| ERC721 hooks | Transfer during batch | Batch **does not** transfer; use **`_safeMint` awareness** only on mint paths |

### 9.3 Project batch window

| Threat | Mitigation |
|--------|------------|
| Compromised owner key inscribes wrong art | **Merkle proof** per token binds payload; ops must feed correct calldata |
| Compromised key inscribes before reveal | Require `revealed` or revert |
| Window left open indefinitely | **`renounceBatchInscribe()`** immediately after verified universal pass |
| Censorship (skip tokens) | Monitoring: `hasData` coverage script for all `tokenId ≤ totalSupply` |
| Replay double-inscribe | `TokenAlreadyWritten` + skip logic |

---

## 10. Cost model (measured, batched)

### 10.1 Measured inputs

| Operation | Gas (measured) | Harness |
|-----------|---------------:|---------|
| `inscribe_mean_5_samples` (single-tx reference) | **553,837** | `GasStressProfile.t.sol` |
| `reveal_production_depth_single` | **58,265** | `GasStressProfile.t.sol` |
| **`batchInscribe48_total`** | **29,097,355** | `ModelBBatchInscribeGas.t.sol` (NOT-FINAL probe) |
| **`batchInscribe48_per_token`** (amortized) | **606,194** | same |
| **`batchInscribe5150_extrapolated`** | **3,121,899,100** | `606,194 × 5,150` |
| `batchInscribe48_idempotent_skip_per_token` | **8,162** | same |

**Correction:** Prior **`553,837 × 5,150 = 2,852,260,550`** was **single-tx extrapolation** — valid for per-holder self-inscribe UX copy, **not** for project batch budgeting. Collection permanence pass must use **measured batch amortization** above.

### 10.2 Total gas — 5,150 tokens

| Phase | Formula | Total gas |
|-------|---------|----------:|
| **Batch inscribe only (measured amortization)** | **606,194 × 5,150** | **3,121,899,100** |
| **Single-tx inscribe reference** | 553,837 × 5,150 | 2,852,260,550 |
| **Reveal + batch inscribe** | (58,265 + 606,194) × 5,150 | **3,421,963,850** |

**Amortized batch inscribe gas per token:** **606,194** (~606k in UI copy for project pass).

### 10.3 ETH bands (execution gas only)

Formula: **`ETH = total_gas × gwei × 10⁻⁹`**

#### Batch inscribe only (3,121,899,100 gas — **measured, batched**)

| Gwei | Total ETH | Per token ETH | Per token @ $3k ETH |
|-----:|----------:|--------------:|--------------------:|
| **0.3** | **0.937** | 0.000182 | ~$0.55 |
| **0.5** | **1.561** | 0.000303 | ~$0.91 |
| **1.0** | **3.122** | 0.000606 | ~$1.82 |
| **2.0** | **6.244** | 0.001212 | ~$3.64 |
| **5.0** | **15.609** | 0.003031 | ~$9.09 |

#### Reveal + batch inscribe (3,421,963,850 gas)

| Gwei | Total ETH |
|-----:|----------:|
| **0.3** | **1.027** |
| **0.5** | **1.711** |
| **1.0** | **3.422** |
| **2.0** | **6.844** |
| **5.0** | **17.110** |

### 10.4 Premium coverage math — **2.575 ETH earmark**

**Interpretation:** Earmark = **5,150 × 0.0005 ETH/token** premium allocation for subsidized permanence (round-number budget line tied to pricing strategy).

| Gwei | Batch inscribe cost (ETH) | vs 2.575 ETH earmark |
|-----:|--------------------------:|---------------------|
| **0.3** | 0.937 | **Surplus +1.638 ETH** (earmark covers 275%) |
| **0.5** | 1.561 | **Surplus +1.014 ETH** |
| **0.825** | 2.575 | **Breakeven** (batch inscribe-only) |
| **1.0** | 3.122 | **Shortfall −0.547 ETH** |
| **2.0** | 6.244 | **Shortfall −3.669 ETH** |
| **5.0** | 15.609 | **Shortfall −13.034 ETH** |

**Pricing uplift (+2.475 ETH gross at sellout)** vs **batch inscribe @ 1 gwei (3.122 ETH):** mint premium **does not fully fund** permanence pass at 1 gwei — need **≤0.825 gwei** execution window or additional budget.

**Note:** Re-inscribe gas during gameplay is **holder/burner-paid**, not from earmark. Idempotent batch reruns cost **~8.2k gas/token** (skip path).

---

## 11. Delivery sequence & timeline

**Gate:** This design doc approved → then contract work begins.

| Phase | Deliverables | Est. duration |
|-------|--------------|:-------------:|
| **0. Design approval** | Sign-off on this doc | — |
| **1. Contract changes** | `Chroma`, `ChromaStorage`, `ChromaCanvasV2`, `ChromaRenderer`, `IChroma*` interfaces; batch + seal + re-inscribe | **5–8 days** |
| **2. Foundry suite** | **~99 existing tests** (forge `--list`) updated + **~30–40 new** Model B cases; target **≥130 total** | **4–6 days** (overlap with 1) |
| **3. Fuzz / invariants** | §7 spec wired; `testFuzz_*` + invariant handlers | **2–3 days** |
| **4. Sepolia full redeploy** | New addresses all six contracts; `RedeployChroma.s.sol` updated | **1 day** |
| **5. Verify-by-construction** | `verify_sepolia_wiring.py`, `verify_deployed_artifacts.py` | **0.5 day** |
| **6. Parity 1011** | `parity_harness.py` + registry diff | **0.5 day** |
| **7. Money test** | `sepolia_tokenuri_money_test.py` on inscribed sample | **0.5 day** |
| **8. Batch rehearsal + four-corner acceptance** | Real `batchInscribe` txs on Sepolia (≥48-token batch); coverage `hasData` scan; `tokenURI` spot checks; **live acceptance criteria below** | **1–2 days** |
| **9. Gas re-measure** | `GasStressProfile` + re-inscribe + seal + batch loop harness; update `GAS_STRESS_REPORT.md` | **1 day** |
| **10. Dress rehearsal** | End-to-end: mint → reveal window → batch → seal samples → burn/edit on unsealed → seal → verify frozen | **2–3 days** |
| **11. Frontend / docs cutover** | Seal UX, pricing display, journal fix **0.005**, deprecate holder `inscribe` flow copy | **3–5 days** (parallel post Phase 4) |

**Critical path (serial):** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10  
**Estimated critical path:** **~18–26 working days** (~4–5 weeks) with limited parallel frontend work.

**Mainnet-readiness:** Out of scope until Sepolia dress rehearsal sign-off. **Mainnet-readiness estimate lands in the August window**, aligned with the snapshot pass (post-Sepolia acceptance).

### 11.1 Sepolia four-corner acceptance test (required)

The Sepolia batch rehearsal **must additionally execute, live, on deployed contracts** — these are **acceptance criteria for the Sepolia phase**, not optional checks:

| # | Scenario | Pass criteria |
|---|----------|---------------|
| **a** | **Burn-into inscribed-unsealed** | Re-inscription occurs; new bytes canonical in `getPixels`; `tokenURI` reflects change **atomically** in same tx/block |
| **b** | **`seal()` a token** | `TokenSealed` event emitted; `isSealed` (or equivalent) state true |
| **c** | **Burn-into sealed** | Transaction **reverts** (`ChromaCanvasV2` gating on sealed receiver) |
| **d** | **Second `batchInscribe` over already-inscribed tokens** | Idempotent skip — no double-write, no gas grief beyond skip path (~8k gas/token measured) |

---

## 12. Open decisions for approval

**Gate status:** Design gate **remains open** until JB rules on items marked **OPEN**. Items marked **PRE-RULED** are adopted pending formal sign-off.

| # | Question | Status | Recommendation / ruling |
|---|----------|--------|-------------------------|
| 1 | Retain holder `inscribe()` or **batch-only** permanence? | **OPEN** | **Batch-only** for uniform collection permanence; deprecate holder `inscribe()` unless late self-service is a hard product requirement — simpler ops, one canonical pass. |
| 2 | Batch window: **deadline only** vs **deadline + close** vs **renounce role**? | **PRE-RULED** | **Owner-only + one-way `renounceBatchInscribe()`** after verified universal pass; renounce tx documented in public permanence proof. |
| 3 | Pointer **history**: events-only vs on-chain array? | **PRE-RULED** | **Ignore / document-only** for orphaned SSTORE2 pointers — one paragraph in design doc; no UI, no exposure; event-only `previousPointer`/`newPointer` acceptable for indexers. |
| 4 | Seal: **pure flag** vs **AP sink**? | **PRE-RULED** | **Pure one-way state flag** at launch; no AP hooks, no economic coupling; marketplace badge frontend-only if ever wanted. |
| 5 | Public price: confirm **0.005** (supersedes journal **0.00525**)? | **PRE-RULED** | **0.005 flat** supersedes journal **0.00525**; note in comms inventory this is a **decrease** vs last published figure. |
| 6 | Metadata vocabulary: **On-chain / Sealed** vs **Inscribed / Sealed**? | **OPEN** | **On-chain / Sealed** — aligns permanence/finality split (`hasData` vs `sealed`); “Inscribed” conflates with today’s locked semantics. |
| 7 | Bundle **reveal+inscribe** in one batch function or two passes? | **OPEN** | **Two passes** — reveal window first, then `batchInscribe` after coverage verified; cleaner failure modes and idempotent batch reruns. |
| 8 | **`isLocked` ABI alias** for one release or clean break on fresh deploy? | **OPEN** | **Clean break** (`isSealed` only) on Model B greenfield Sepolia deploy; alias only if external integrations require backward compat. |

---

## 13. References

| Artifact | Path |
|----------|------|
| Prior analysis | `reports/UNIVERSAL_INSCRIPTION_ANALYSIS.md` |
| Current contracts | `contracts/Chroma.sol`, `ChromaStorage.sol`, `ChromaCanvasV2.sol` |
| Measured gas (single-tx inscribe) | `test/GasStressProfile.t.sol` → `chromies-engine/reports/GAS_STRESS_REPORT.md` |
| Measured gas (batch inscribe, NOT-FINAL probe) | `test/ModelBBatchInscribeGas.t.sol`, `contracts/test/ChromaBatchProbe.sol` |
| Sepolia deploy log | `chromies-engine/reports/SEPOLIA_DEPLOY_LOG.md` |
| Pricing journal drift | `art-pipeline/chromies-project-journal.md` L260–266 |
| Parked burn-into-locked | `SESSION_HANDOFF.md` — **resolved by Model B** (allow into unsealed) |

---

**STOP — design gate open pending JB rulings on §12 OPEN items (1, 6, 7, 8) before contract implementation.**
