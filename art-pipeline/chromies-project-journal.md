# Chromies Project Journal

## Project Overview

Chromies is a fully on-chain, 64×64 pixel-art NFT identity system. 4 bits-per-pixel,
16-color indexed palettes. Art is generated deterministically from a token ID, stored
on-chain, rendered on-chain as SVG. Separate hand-drawn art pipeline for authoring
components in Aseprite.

Collection size: 4,000 tokens.
Supply reference: Normies (~8,053 remaining after burns, ~10,000 original mint).

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite 8 |
| Art engine | TypeScript modules under src/art/ |
| API | Express 5 (TypeScript) |
| Chain reads / indexer | viem + Ponder 0.16 |
| Smart contracts | Solidity 0.8.24, Foundry, OpenZeppelin + Solady |
| Art pipeline | Node.js, sharp, pngjs, standalone in art-pipeline/ |

---

## Art Pipeline

### Location
`X:\Cursor\Homies\art-pipeline\`

### Commands
```
node generate.js --token <id>              # single token
node generate.js --token <id> --character Alien  # force character
node gallery.js --count <n>               # batch gallery
node gallery.js --count <n> --character Cat      # force character
node build-master.js                      # rebuild master ledger
```

### Key Files
- `chromies-config.js` — palettes, roles, characters, mutation settings
- `traits.json` — slot catalog with variants and weights
- `generate.js` — single token generator, character system, coverage rules
- `gallery.js` — batch generator + grid preview
- `pixel-mutation.js` — edge erode/dilate + palette swap engine
- `phase3-variance.js` — layer drift (currently zeroed)
- `components/` — 64×64 PNGs named SLOT_Name.png
- `output/` — generated renders (gitignored)

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

### Human palettes (6 base × 4 hair colors = 24 total)
Base: SIGNAL, ACID, CYAN, GHOST, BLOOD, MOSS
Hair variants: _BLONDE, _GREY, _RED
Original base palettes untouched — variants only swap slots 13/14/15.

### Special palettes
- ALIEN — olive khaki, locked to Alien character
- CAT — tabby fur tones, locked to Cat character

### Palette weights (traits.json)
SIGNAL=50, ACID=12, CYAN=12, GHOST=10, BLOOD=10, MOSS=6
SIGNAL_BLONDE/GREY/RED=15 each
ACID/CYAN variants=4 each, GHOST/BLOOD variants=3 each, MOSS variants=2 each
ALIEN=0 (character-gated), CAT=0 (character-gated)

---

## Slot System

### zOrder stack (back to front)
```
5   hood
6   shirt
7   bodytattoo
8   neck
9   body
9   bodytattoo (renders above body, under neck)
10  head
11  bodytattoo
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
- hood=Classic → suppress shirt, body, bodytattoo, necklace
- hood=None + shirt=None → promote body to Default/Female
- hood=None + shirt=Crew → suppress body, bodytattoo, necklace
- Tank_Female shirt → keep female body visible, necklace shows
- Body visible (Default/Female/Female_Tank/Alien) → bodytattoo eligible
- Necklace shows when: shirtless OR tank top OR female tank

---

## Character System (Locked)

### Top-level roll before any slot picks

| Character | Weight | Notes |
|-----------|--------|-------|
| HeroA Male | 538 | Full palette pool |
| HeroA Female | 441 | Full palette pool |
| Cat | 11 | CAT palette locked |
| Alien | 6 | ALIEN palette locked |
| Agent | 4 | TBD assets |

Zombie: filed post-launch as layer effect (~0.22% in Normies).

### Gender split
55% Male / 45% Female within human pool. Expressed via head/neck variants.

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
- slotDriftOverrides: tattoo { dx:0, dy:-4 } (tattoo sits 4px higher on alien skull)

**Cat**
- palettePool: [CAT]
- forcedSlots: head=Cat, neck=HeroA (temp), beard=None, mustache=None
- weight=50 temporarily for testing (real weight=11 at launch)

**Agent**
- Assets pending (HEAD_Agent, NECK_Agent)
- weight=4, set to 0 until assets ready

### slotDriftOverrides
Per-character fixed pixel drift applied regardless of drift tier.
Currently only Alien uses this (tattoo shifts up 4px).

---

## Asset Status

### Complete
- HEAD_HeroA.png (Male)
- NECK_HeroA.png (Male)
- BODY_Default.png (Male shirtless)
- BODY_Tank.png (Male tank body, group=tank)
- HEAD_Female_Hero_A.png
- NECK_HeroA_Female.png
- BODY_Female.png (Female shirtless)
- BODY_Female_Tank.png (Female tank cutout body)
- SHIRT_Tank_Female.png (group=tank_female)
- HEAD_ALien.png
- NECK_ALien.png
- BODY_Alien.png
- EYES_ALien.png
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
- HEAD_Agent.png
- NECK_Agent.png
- NECK_Cat.png (Cat currently borrows NECK_HeroA)

---

## Mutation System (Locked)

### Pixel Mutation Tiers

Every Chromie rolls a mutation tier at mint. Permanent on-chain trait.

| Tier | Weight | paletteSwap | edgeErode | edgeDilate | edgePasses |
|------|--------|-------------|-----------|------------|------------|
| Pristine | 3% | 0.00 | 0.00 | 0.00 | 0 |
| Standard | 30% | 0.05 | 0.03 | 0.03 | 1 |
| Drifted | 50% | 0.10 | 0.06 | 0.06 | 1 |
| OffKilter | 17% | 0.20 | 0.10 | 0.08 | 2 |

**Pristine = rare collector piece. Drifted = default Chromie feel.**

### Mutable slots
hair, head, neck, body

### Palette families
- hair: slots 13, 14, 15 (hair_dark, hair_mid, hair_bright)
- head/neck/body: slots 4-8 (skin family)

### Key principle
PHASE3 drift (layer offset) stays zeroed — drift seams look bad.
Pixel mutation only. Edge wobble is organic; layer shift creates seams.

---

## Canvas Mechanics (Post-Mint, Filed)

### Mutation tier as gameplay loop
- Burn one Chromie → purify another (move toward Pristine)
- Action points spent to shift mutation tier up or down
- Pristine becomes rarer over time as community burns toward it

### Normified Mode (Filed)
Canvas editor slider from clean Chromie to full Normie chaos.
Named tiers map to mutation intensity presets.
Holders preview and purchase tier shifts via action points.

### Awaken event (post-launch)
- Links to ERC-8004 agent system
- Awakened Chromies may have different mutation rules than dormant ones
- Each Chromie can spawn an Agent with its own token ID

---

## Combination Analysis

Current unique trait combinations (excl. drift/mutation tiers):
- Male: ~60,480
- Female: ~45,360
- Alien: ~10
- Grand total: ~105,850

With drift × mutation tiers (4×4): ~1.7M visually distinct outputs.
Duplicate trait sets in 4,000 token run: ~57 sets (3,939 unique = 98.3%).

---

## Normies Rarity Reference

Used to set Chromies character weights.
- Human: ~99.3% of Normies
- Cat: ~1.07%
- Alien: ~0.59%
- Agent: ~0.42%
- Zombie: ~0.22%

Normies API: https://api.normies.art
Canvas tool: https://normie-canvas-lab.jbjbjb2112.workers.dev/agent

---

## Filed / Post-Launch

- Zombie layer effect
- Normified mode canvas slider
- Eye color palette variants (same 16-slot approach as hair colors)
- Male-specific necklace variants beyond Male_Chain
- Additional earring styles
- Mask variants (currently all None — high combo leverage)
- Agent assets and rules
- Cat neck asset
- Awaken Chromie event (ERC-8004)
- Talking pixel avatar (lip sync from mouth pixels + ElevenLabs)
