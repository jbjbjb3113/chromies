# Chromies Project Journal

## Project Overview

Chromies is a fully on-chain, 64×64 pixel-art NFT identity system. 4 bits-per-pixel,
16-color indexed palettes. Art is generated deterministically from a token ID, stored
on-chain, rendered on-chain as SVG. Separate hand-drawn art pipeline for authoring
components in Aseprite.

**Collection size: 5,150 tokens**
**Chain: Ethereum Mainnet**
**Domain: chromies.art ✅**
**Repo: github.com/jbjbjb3113/chromies.git**
Supply reference: Normies (~8,053 remaining after burns, ~10,000 original mint).

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite 8 + React Router + Tailwind v4 |
| Site hosting | Cloudflare Pages (auto-deploys from main branch) |
| Art engine | TypeScript modules under src/art/ |
| API | Express 5 (TypeScript) |
| Chain reads / indexer | viem + Ponder 0.16 |
| Smart contracts | Solidity 0.8.24, Foundry, OpenZeppelin + Solady |
| Art pipeline | Node.js, sharp, pngjs, standalone in art-pipeline/ |

---

## Site (chromies.art)

### Pages built
- `/` — Landing with splash screen, Normies-style layout, off-white bg
- `/mint` — Mint placeholder with countdown (MINT_DATE=2026-09-01T17:00:00Z)
- `/lab` — Talking Chromie agent (OpenAI chat + ElevenLabs TTS + lip sync)
- `/canvas` — Pixel editor (paint/erase/fill, undo/redo, zoom, export PNG/SVG)
- `/pixel-chroma` — Original dev tool preserved

### Key config
- `.env.local`: OPENAI_API_KEY, VITE_TTS_PROXY_URL, VITE_CHAT_COMPLETIONS_URL
- Cloudflare Pages auto-deploys on git push origin main

---

## Art Pipeline

### Location
`X:\Cursor\Homies\art-pipeline\`

### Commands
```
node generate.js --token <id>
node gallery.js --count <n>
node bridge-mint-data.js --count 5150 --start 1
node snapshot-holders.js
node generate-merkle.js
node generate-reveal-merkle.js
```

### Key Files
- `chromies-config.js` — palettes, roles, characters, mutation settings
- `traits.json` — slot catalog with variants and weights
- `generate.js` — single token generator, character system, coverage rules
- `gallery.js` — batch generator + grid preview
- `pixel-mutation.js` — edge erode/dilate + palette swap engine
- `phase3-variance.js` — layer drift (currently zeroed)
- `bridge-mint-data.js` — pipeline-to-contract bridge, outputs mint-data.json
- `snapshot-holders.js` — fetches Normies + Brain Rots holder addresses
- `generate-merkle.js` — generates allowlist merkle trees (Tier 1/2)
- `generate-reveal-merkle.js` — generates reveal merkle tree
- `components/` — 64×64 PNGs named SLOT_Name.png
- `output/` — generated renders (gitignored)

### Mint data generated
- `output/mint-data.json` — 5,150 tokens, pixelsHex + traitsHex
- `output/normies-holders.json` — 1,873 unique Normies addresses
- `output/brainrots-holders.json` — 2,070 unique Brain Rots addresses
- `output/merkle-tier1-root.txt` — `0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39`
- `output/merkle-tier2-root.txt` — `0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac`
- `output/reveal-merkle-root.txt` — `0x3e956533997abafdcca2253c98299f18c0db09ad130debfd827e41b03c0e77b7`

---

## Palette System

### 16-slot role mapping (locked, on-chain safe)
```
0  background
1  mask_dark
2  mask_mid
3  highlight
4  skin_shadow_deep
5  skin_shadow
6  skin_mid
7  skin_light
8  skin_highlight
9  hood
10 eye_socket
11 eye_glow
12 eye_signal
13 hair_dark
14 hair_mid
15 hair_bright
```

### Human palettes (6 base x 4 variants = 24 total)
Base: SIGNAL, ACID, CYAN, GHOST, BLOOD, MOSS
Hair variants: _BLONDE, _GREY, _RED (swap slots 13/14/15 only)
Original base palettes untouched.

### Special palettes
- CAT — tabby fur tones, locked to Cat character
- ALIEN — olive khaki, locked to Alien character

### Palette weights (traits.json)
SIGNAL=50, ACID=12, CYAN=12, GHOST=10, BLOOD=10, MOSS=6
SIGNAL_BLONDE/GREY/RED=15 each
ACID/CYAN variants=4 each, GHOST/BLOOD variants=3 each, MOSS variants=2 each
CAT=0 (character-gated), ALIEN=0 (character-gated)

---

## Slot System

### zOrder stack (back to front)
```
5   hood
6   shirt
7   bodytattoo
8   neck
9   body
10  head
12  necklace
15  tattoo
20  mask
25  beard
26  mustache
30  eyes
32  earrings
35  glasses
40  hair
```

### Coverage rules (generate.js applyCoverageRules)
- hood=Classic -> suppress shirt, body, bodytattoo, necklace
- hood=None + shirt=None -> promote body to Default/Female
- hood=None + shirt=Crew -> suppress body, bodytattoo, necklace
- Tank_Female shirt -> keep female body visible, necklace shows
- Body visible (Default/Female/Female_Tank/Alien) -> bodytattoo eligible
- Necklace shows when: shirtless OR tank top OR female tank

---

## Character System (Locked)

### Actual mint distribution (5,150 tokens generated)

| Character | Weight | Count | % |
|-----------|--------|-------|---|
| HeroA Male | 538 | 2,689 | 52.2% |
| HeroA Female | 441 | 2,327 | 45.2% |
| Cat | 18 | 75 | 1.5% |
| Alien | 6 | 33 | 0.6% |
| Agent | 4 | 26 | 0.5% |

**Cat weight is 18 (locked).**

### Per-character rules

**HeroA Male**
- palettePool: null (all palettes)
- forcedSlots: head=HeroA, neck=HeroA
- slotVariantPool: necklace=[Male_Chain, None]

**HeroA Female**
- palettePool: null (all palettes)
- forcedSlots: head=HeroA_Female, neck=HeroA_Female, body=Female
- slotWeightOverrides: beard Full=0.1x, mustache Thick=0.1x (bearded lady is valid rare)
- slotVariantPool: hair=[FadeRight,Afro,Dreads,Surfer,Pompadour,None],
  necklace=[Female_Chain,Female_Ornate,Female_Flower,Female_UpsideDownCross,Female_Opal,None],
  shirt=[Crew,Tank_Female,None]

**Alien**
- palettePool: [ALIEN]
- forcedSlots: head=Alien, neck=Alien, body=Alien, eyes=Alien,
  hair=None, beard=None, mustache=None, hood=None, glasses=None
- slotDriftOverrides: tattoo { dx:0, dy:-4 }

**Cat**
- palettePool: [CAT]
- forcedSlots: head=Cat, neck=HeroA (temp), beard=None, mustache=None
- weight=18 (locked)

**Agent**
- Assets pending (HEAD_Agent, NECK_Agent)
- weight=4, set to 0 until assets ready

---

## Asset Status

### Complete
- HEAD_HeroA.png / NECK_HeroA.png (Male)
- HEAD_Female_Hero_A.png / NECK_HeroA_Female.png (Female)
- BODY_Default.png, BODY_Tank.png (Male)
- BODY_Female.png, BODY_Female_Tank.png (Female)
- SHIRT_Tank_Female.png
- HEAD_ALien.png / NECK_ALien.png / BODY_Alien.png / EYES_ALien.png
- HEAD_Cat.png
- Hair: Mohawk, Pompadour, MrT, Afro, Dreads, Surfer, FadeRight, None
- Tattoo: Signal, Thug, Marks, Scar, None
- BodyTattoo: UnderArmour, AkuHeart, Pyramid, Normies, None
- Beard: Full, Goat, None
- Mustache: Thick, None
- Glasses: Shades, Neo, VR, None
- Necklace: Male_Chain, Female_Chain, Female_Ornate, Female_Flower,
  Female_UpsideDownCross, Female_Opal, None
- Earrings: Stud, None

### Pending
- HEAD_Agent.png / NECK_Agent.png
- NECK_Cat.png (Cat borrows NECK_HeroA temp)
- Fat head variant (HeroA)
- New glasses styles
- New beard styles

---

## Mutation System (Locked)

### Pixel Mutation Tiers — actual mint distribution

| Tier | Weight | Count | % | paletteSwap | edgeErode | edgeDilate | edgePasses |
|------|--------|-------|---|-------------|-----------|------------|------------|
| Pristine | 2 | 81 | 1.6% | 0.00 | 0.00 | 0.00 | 0 |
| Standard | 30 | 1,603 | 31.1% | 0.05 | 0.03 | 0.03 | 1 |
| Drifted | 50 | 2,571 | 49.9% | 0.10 | 0.06 | 0.06 | 1 |
| OffKilter | 17 | 895 | 17.4% | 0.20 | 0.10 | 0.08 | 2 |

**Pristine weight=2 — 81 tokens at mint (1.6%).**

### Mutable slots
hair, head, neck, body

### Palette families
- hair: slots 13, 14, 15
- head/neck/body: slots 4-8 (skin family)

### Key principle
PHASE3 drift stays zeroed. Pixel mutation only.

---

## Mint Structure (Locked)

| Phase | Cap | Price | Per Wallet |
|-------|-----|-------|------------|
| Tier 1 (Normies) | 2,500 | 0.003 ETH | 2 |
| Tier 2 (Brain Rots) | 1,000 | 0.004 ETH | 2 |
| Public | 1,450 | 0.00525 ETH | 3 |
| Team | 200 | free | owner |
| **Total** | **5,150** | | |

**Gross at $1,450 ETH: ~$27,695**

### Allowlist contracts
- Normies: `0x9eb6e2025b64f340691e424b7fe7022ffde12438` — 1,873 unique holders
- Brain Rots: `0x38793a3FDfd098E820ddF59706280681354341fC` — 2,070 unique holders

---

## Contract System

### Architecture
```
Chroma (ERC721) -> ChromaStorage (SSTORE2) + ChromaRenderer -> IChromaCanvas.getDiff()
ChromaCanvas -> burn tokens -> AP economy
```

### Contract addresses (Sepolia testnet — current)
| Contract | Address |
|----------|---------|
| ChromaStorage | `0x8C0693bBc2e5377bC39D57DA57a75EDCB28eC2F6` |
| Chroma | `0xd328B64ed99fbfE39cFAE80B46Db28553bcD35D9` |
| ChromaCanvas | `0x43B9059027B28baCFB1357577FeE4b08a9Dcdcc2` |
| ChromaRenderer | `0xc999AbEA1E5115a6146AD5D06a69A42553cAeAe9` |

### Key contract values
- MAX_SUPPLY: 5,150
- MAX_ALLOWLIST_ONE: 2,500 (Normies, 2 per wallet)
- MAX_ALLOWLIST_TWO: 1,000 (Brain Rots, 2 per wallet)
- TEAM_RESERVE: 200
- PRICE_ALLOWLIST_ONE: 0.003 ETH
- PRICE_ALLOWLIST_TWO: 0.004 ETH
- MINT_PRICE: 0.00525 ETH (public)
- Royalties: 5% (500 bps)
- name: "Chromies", symbol: "CHROMIE"

### Merkle roots (locked)
- Tier 1 (Normies): `0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39`
- Tier 2 (Brain Rots): `0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac`
- Reveal root: `0x3e956533997abafdcca2253c98299f18c0db09ad130debfd827e41b03c0e77b7`

### Test results
28/28 tests passing.
Run: `C:\Foundry\foundry_nightly_win32_amd64\forge.exe test -vv` from `X:\Cursor\Homies\`

### Gas (at 15 gwei mainnet)
- Mint: ~115k gas (~$2.50)
- Reveal/Inscribe: ~616k gas (~$13.40) — paid by holder, optional
- Deploy: ~8-9M gas total

### PowerShell env reload
```powershell
$env:PRIVATE_KEY = (Get-Content .env | Select-String "PRIVATE_KEY").ToString().Split("=",2)[1]
$env:SEPOLIA_RPC_URL = (Get-Content .env | Select-String "SEPOLIA_RPC_URL").ToString().Split("=",2)[1]
$env:CHROMA_ADDRESS = (Get-Content .env | Select-String "CHROMA_ADDRESS").ToString().Split("=",2)[1]
```

---

## AP Economy (Locked)

- Burn yield: 100 AP base + tokenDiffs.length/10 bonus (recursive)
- Mutation tier costs: OffKilter->Drifted=500, Drifted->Standard=1500, Standard->Pristine=5000
- AP transfer function available for marketplace
- Inscribed/locked tokens cannot earn or spend AP

---

## Hybrid Reveal + Inscribe System

### Model
- Mint: cheap placeholder (~115k gas)
- Art: committed by reveal merkle root at deploy — trustless, immutable
- IPFS/Arweave: pixel data available immediately post-mint
- Inscribe: optional permanent on-chain write, holder pays ~$13, locks token forever

### Three token states
| State | Canvas | AP | Trade | Rarity |
|-------|--------|----|-------|--------|
| Active | editable | earnable | yes | Standard |
| Inscribed | frozen | locked | yes | Premium |
| Burned | gone | yields AP | no | Gone |

### Inscribed Pristine — the holy grail
- 81 Pristine at mint
- ~70 burns needed to shift one token to Pristine
- Inscribed Pristine = provably perfect + provably permanent
- Rarest achievable state in the collection

### Messaging
"Mint cheap. Inscribe if you want."

---

## Pending — Before Mainnet

1. IPFS/Arweave upload of 5,150 token pixel data
2. Wire /mint page to contract (RainbowKit/wagmi wallet connect)
3. Fresh holder snapshots close to mint date
4. Regenerate merkle trees with fresh snapshot
5. Informal contract review (ask Serc)
6. Agent assets (HEAD_Agent, NECK_Agent)
7. Cat neck asset (NECK_Cat)
8. Fat head, new glasses, new beards

---

## Filed / Post-Launch

- Zombie layer effect (~0.22% rarity reference)
- Normified mode canvas slider
- Eye color palette variants
- Additional necklace/earring/hair/glasses styles
- Mask variants (all None currently)
- Pixel marketplace (chromies.art/market)
- Awaken Chromie event (ERC-8004 agent registration)
- Talking pixel avatar (lip sync + ElevenLabs)
- AI Auditor Agent (smart contract security reviews via A2A marketplace)

---

## Pixel Marketplace (Filed — Post-Mint)

### Concept
On-chain marketplace for trading Action Points between holders.

### What can be traded
1. Raw AP — action points transferred wallet to wallet
2. Charged tokens — tokens with AP spent on edits, sold pre-loaded for burning
3. Burn bundles — curated packages for burning toward Pristine

### Pristine cost structure (locked)
- OffKilter -> Drifted: 500 AP
- Drifted -> Standard: 1,500 AP
- Standard -> Pristine: 5,000 AP
- Full journey: 7,000 AP, ~70 burns
- Theoretical max Pristine ever: ~220 tokens

### Status
Filed. Build after mint. Lives at chromies.art/market

---

## AI Auditor Agent (Filed — Post-Mint)

### Concept
AI agent on OpenSea agent marketplace specializing in NFT smart contract security reviews.

### What it does
- Takes Solidity contracts as input
- Checks for: reentrancy, access control, integer overflow, merkle issues, supply bypass
- Returns structured risk report with severity ratings and fixes

### Stack
- Claude API as reasoning engine
- ERC-8004 agent registration
- Charge 0.01-0.05 ETH per review

### The Chromies connection
- An awakened Chromie IS the agent
- First use: audit Chromies contracts, publish report as trust signal
- Branded as "Chromie Auditor"

### Status
Filed. Build post-mint as first awakened Chromie agent use case.

---

## Rarity Site (Filed — Post-Mint)

### Concept
`rarity.chromies.art` — rarity rankings, trait explorer, live OpenSea listings.
Modelled on rarity.normies.art.

### Rarity Scoring
- Level and Action Points: scored by actual value (higher = rarer), 3× weight multiplier
- All other traits: Information Content (IC) rarity scoring
- Recursive burn count factors into fair value calculation

### Fair Value Formula
fairValue = (recursiveBurnCount × floorPrice) + tierFloor
recursiveBurnCount: total Chromies consumed to customize this token, resolved recursively.
tierFloor: cheapest listed Chromie of the same mutation tier.

### Filter Categories
- TOP100 — rarest 100 tokens
- INSCRIBED — locked/inscribed tokens
- PRISTINE — Level 4 mutation tier
- Level ranges — filter by level bands
- Price — listed, underpriced

### Stack
- React + Vite frontend
- Chromies API as data source
- OpenSea API for live listings and floor price
- Ponder indexer for burn history

### Status
Filed. Build post-mint at rarity.chromies.art.
