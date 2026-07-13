# Components Deletion Audit

**Date:** 2026-07-08  
**Trigger:** Reported loss of `HOOD_Male_Hooded.png` (HeroA Male hood-up)  
**Scope:** `art-pipeline/components/` — full forensic inventory  
**Status:** Forensics complete — **no restoration performed** (see §1)

---

## Executive summary

| Finding | Result |
|---------|--------|
| `HOOD_Male_Hooded.png` ever in git? | **NO** — zero commits, zero blobs, zero path history |
| `Male_Hooded` ever in `traits.json` / pools? | **NO** — HeroA Male hood-up was never wired |
| Git-recorded deletions from `components/` | **6 files** (all intentional reorganize/cleanup, 2026-06-10 → 2026-07-05) |
| Legendary head disk deletion (incident #1) | **Not a git delete** — restored 2026-07-07 via `HEAD_MANIFEST.json` from commit `9f3b512` |
| Current tracked vs on-disk (Windows) | **353/353 present** (`Test-Path`); case-alias `chubby/` ↔ `Chubby/` |
| Recycle bin (`HOOD_Male*`, `Male_Hooded*`) | **Empty** — no matches |
| Uncommitted git deletions | **None** — `git status` shows 3 untracked adds only |

**Conclusion:** `HOOD_Male_Hooded.png` cannot be restored from git. It was either a **local-only file never committed**, a **planned asset that never landed**, or **confusion with** `HOOD_Classic.png` (HeroA Male hood-down) / `female/HOOD_Female_Hooded.png` (the only HeroA-family hood-up variant in the repo). Both deletion incidents (legendary heads + this report) bypassed the read-only guard because **deletions via Explorer/shell/git are not intercepted** — the guard only blocks **writes through pipeline APIs**.

---

## 1. `HOOD_Male_Hooded.png` forensics

### 1.1 Git history

```text
git log --all --follow --diff-filter=AD -- "*HOOD_Male*"
→ (empty)

git log --all -S "HOOD_Male_Hooded" --oneline
→ (empty)

git log --all -S "Male_Hooded" --oneline -- art-pipeline/
→ (empty)

git rev-list --all | git grep "HOOD_Male"
→ (empty, full history scan)
```

**Never added. Never deleted. Never referenced in any commit.**

### 1.2 Wiring cross-check

| Location | `Male_Hooded` / `male/HOOD_Male_Hooded` |
|----------|----------------------------------------|
| `art-pipeline/traits.json` hood slot | **Absent** — HeroA Male uses `Classic` → `HOOD_Classic.png` (zOrder 5, hood-down bib) |
| `chromies-config.js` HeroA Male `slotVariantPool.hood` | **Absent** — falls back to traits.json: `Classic: 20`, `None: 80` |
| `trait-byte-registry.json` | **Absent** |
| `art-pipeline/lora-pipeline/dataset/` | **Absent** — only `HOOD_Classic`, `HOOD_None`, SP hoods |
| `chromies-engine/reports/components_full_report.json` | **Absent** — 10 hood assets listed, no Male hood-up |

**Config + file deletions in same commit:** N/A — neither config nor file ever existed in git.

Hood-up (`zOrder: 41`) variants **in repo today:**

| Variant | File | Character pool |
|---------|------|----------------|
| `Female_Hooded` | `female/HOOD_Female_Hooded.png` | HeroA Female w=0.6 |
| `Zombie_Hooded` | `zombie/HOOD_Zombie_Hooded.png` | Zombie w=4 |
| `Zombie_Hoodie` | `zombie/HOOD_Zombie_Hoodie.png` | Zombie w=4 |

### 1.3 Working tree & recycle bin

**`git status art-pipeline/components/`** (2026-07-08):

| Status | Path |
|--------|------|
| `??` untracked | `female/HEAD_Female_Angular.png` |
| `??` untracked | `male/HEAD_Angloar.png` |
| `??` untracked | `legendary/HEAD_MANIFEST.json` |

No `D` (deleted) tracked files. No `HOOD_Male*` anywhere.

**Windows Recycle Bin:** searched `*HOOD_Male*`, `*Male_Hooded*` — no results.

### 1.4 Recovery verdict

**Do not restore from git** — no blob exists. JB must confirm whether:

1. Asset lived only in Aseprite export / local disk (check `Hero_A.aseprite` layers manually), or  
2. Report targets a **planned** Male hood-up that was never committed, or  
3. Name confusion with `HOOD_Classic.png` / `HOOD_Female_Hooded.png`.

**No sample renders produced** — nothing to wire into `traits.json` without a source PNG.

---

## 2. Git-recorded deletions (`--diff-filter=D`)

Complete list of files **deleted via git commit** under `art-pipeline/components/`:

| Commit | Date | Author | File | Context |
|--------|------|--------|------|---------|
| `04064668` | 2026-06-10 | JB | `SIDE_PROFILE_TEST.png` | Sepolia address update / test cleanup |
| `296b4307` | 2026-06-10 | JB | `SP_EYES.png`, `SP_NECK.png` | Marketplace E2E — legacy root SP layers removed |
| `5a9457cf` | 2026-06-23 | JB | `HEAD_HeroA.png`, `SP_HEAD_HeroA.png` | **Reorganize** into `male/`, `female/`, `sideprofile/` subfolders (renames, not loss) |
| `e503d08b` | 2026-07-05 | JB | `SideProfile_Female/SP_EXPRESSION_Neutral_Female.png` | Beard palette fix batch |

**Total: 6 deletions, 4 commits, all author JB, all deliberate.**

No hood files appear in any deletion commit.

---

## 3. Historical inventory vs HEAD

| Metric | Count |
|--------|------:|
| Unique paths ever in `components/` (all branches) | 441 |
| Currently git-tracked | 353 |
| Paths in history but not in HEAD | 88 |

The 88 "gone" paths are **reorganization moves** (e.g. root `BODY_Default.png` → `male/BODY_Default.png`, root `HAIR_Chubby_*.png` → `chubby/` folder), not silent deletions. None are `HOOD_Male*`.

### Hood assets — tracked in git today (all on disk)

| Path | Status |
|------|--------|
| `HOOD_Classic.png` | present |
| `HOOD_None.png` | present |
| `HOOD_Classic - Copy.png` | present |
| `female/HOOD_Female_Classic.png` | present |
| `female/HOOD_Female_Hooded.png` | present |
| `female/HOOD_Female_None.png` | present |
| `chubby/HOOD_Chubby_Classic.png` | present (disk: `Chubby/` — case alias on Windows) |
| `zombie/HOOD_Zombie_Classic.png` | present |
| `zombie/HOOD_Zombie_Hooded.png` | present |
| `zombie/HOOD_Zombie_Hoodie.png` | present |
| `sideprofile/SP_HOOD_Classic*.png` | present |
| `SideProfile_*/SP_HOOD_Classic_*.png` | present |
| **`male/HOOD_*`** | **never existed in git** |

---

## 4. Legendary deletion window (incident #1)

| Item | Detail |
|------|--------|
| **When** | Discovered 2026-07-07 (pre–encoder-fix session) |
| **What** | 7 legendary head PNGs missing from disk under `components/legendary/` |
| **Git delete commits** | **None** — `git log --diff-filter=D -- components/legendary/` is empty |
| **Mechanism** | **Filesystem deletion outside git** (Explorer, shell `rm`, IDE, or sync tool) |
| **Restoration** | `HEAD_MANIFEST.json` + `scripts/check-legendary-heads.js`; blobs from commit `9f3b512` |
| **Current status** | **PASS** — all 7 heads match pinned SHA-256 (2026-07-08 verify) |

Legendary adds (never deleted in git):

- `9f3b512` — 7 `NORMIE_*.png` heads  
- `e503d08` — 2 `-export.png` sidecars  

---

## 5. Deletion mechanism analysis

| Incident | Git commit? | Config change? | Likely tool |
|----------|-------------|----------------|-------------|
| Legendary heads (Jul 7) | No | No | **Manual filesystem** or IDE clean — same class as incident #2 |
| `HOOD_Male_Hooded` (reported) | Never in git | Never wired | **Local-only file** or **naming confusion** — not a git-tracked deletion |
| 6 git deletes (Jun–Jul) | Yes | Sometimes same PR | **Deliberate JB commits** (reorganize, cleanup) |

**Not caused by:** Face Forge, `extract-legendary.js`, `lora-pipeline/prepare-dataset-v2.js` (only deletes inside `dataset/`), or `generate.js`. No repo script deletes arbitrary `components/` PNGs.

**Same pattern both incidents?** Yes — **out-of-band filesystem mutation** bypassing `art-safety.js` / `art_safety.py`. Legendary incident deleted committed files from disk; `HOOD_Male` was never committed so wouldn't appear in a git diff.

---

## 6. Guard postmortem

### What the guard protects

| Layer | File | Protects | Does NOT protect |
|-------|------|----------|------------------|
| JS write guard | `art-pipeline/lib/art-safety.js` | `guardedWriteFileSync()` — blocks **pipeline writes** without `--force` | `fs.unlink`, Explorer delete, `git checkout`, Cursor file ops, shell `rm` |
| Python write guard | `chromies-engine/engine/art_safety.py` | `safe_write_*`, `safe_unlink`, `safe_rename` — blocks **scripted** mutations | Same gaps + only when scripts use the API |
| Hash snapshot | `ReadOnlyArtGuard` in Python | Detects **any** change if `snapshot_before()` → work → `verify_unchanged()` called | Only runs when harness explicitly wraps an operation |
| Legendary pin | `HEAD_MANIFEST.json` + `check-legendary-heads.js` | **7 legendary heads** — CI fails on hash mismatch | Other 346 component files |
| CI path filter | `.github/workflows/chromies-ci.yml` | Legendary check on contract/engine pushes | Full `components/` tree |

### Why both incidents missed

1. **Legendary heads:** Files deleted from disk but still in git index → `git status` may not show deletion until `git diff` / fresh clone on Linux CI. Legendary CI only added **after** first incident.  
2. **`HOOD_Male_Hooded`:** Never in git → no diff signal at all.  
3. **Write guards are not delete guards** — nothing prevents `Delete` key in Explorer.  
4. **`compute_art_library_hash()` exists but is not CI-gated** for the full tree.

---

## 7. Proposed hardening (ready, not activated)

Scripts added (not run — awaiting JB approval to pin manifest):

| Script | Purpose |
|--------|---------|
| `scripts/generate-components-manifest.js` | Build `art-pipeline/components/COMPONENTS_MANIFEST.json` — SHA-256 per git-tracked file |
| `scripts/check-components-manifest.js` | CI/local gate — fails on **any** add, delete, or hash change without manifest update |

**Activation steps (JB):**

1. `node scripts/generate-components-manifest.js`  
2. Commit `COMPONENTS_MANIFEST.json`  
3. Add to `.github/workflows/chromies-ci.yml`:
   - Path trigger: `art-pipeline/components/**`
   - Step: `node scripts/check-components-manifest.js`
4. Policy: any art change requires manifest regen in the **same PR**

**Mainnet gate (unchanged):** `KNOWN_DRIFT.md` empty — separate palette waiver track.

---

## 8. Still missing / JB decision queue

| Item | Severity | Action |
|------|----------|--------|
| `HOOD_Male_Hooded.png` | Unknown — never in repo | JB: confirm if local/Aseprite source exists; if yes, extract + wire new `Male_Hooded` variant |
| `female/HEAD_Female_Angular.png` | Untracked | Commit or delete |
| `male/HEAD_Angloar.png` | Untracked (typo name?) | Commit or delete |
| `legendary/HEAD_MANIFEST.json` | Untracked | **Should be committed** (CI depends on it) |
| Full manifest pin | Not yet generated | Run generate script after JB approves |
| HeroA Male hood-up feature | Never implemented | Requires art + `traits.json` + `chromies-config.js` + zOrder 41 entry |

**No other git-tracked component files are missing from disk** as of this audit.

---

## 9. Appendix — hood slot reference (current wiring)

```text
HeroA Male:  hood Classic (20) / None (80)  → HOOD_Classic.png  [zOrder 5, hood-down]
HeroA Female: Female_Classic (7.5) / Female_Hooded (0.6) / Female_None (91.9)
Chubby Male: Chubby_Classic (4) / None (96)
Zombie:      Zombie_Classic/Hooded/Hoodie (4 each) / None (88)
```

`hoodCoversTorso()` and `hoodSuppressesHair()` in `generate.js` apply to Classic and hood-up variants per archetype — a future `Male_Hooded` would need entries in both functions plus `zOrder: 41`.

---

*Forensics only. No files restored. Manifest not generated pending JB sign-off.*
