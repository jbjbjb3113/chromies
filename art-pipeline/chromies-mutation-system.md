## Mutation System (Locked)

### Pixel Mutation Tiers

Every Chromie rolls a mutation tier at mint. This is a permanent on-chain trait
that determines how much pixel-level variation the token has from its base shape.

**Tier weights (locked):**
```
Pristine:  3%  — clean, no mutation. Genuinely rare collector piece.
Standard:  30% — light noise, subtle skin and hair variation.
Drifted:   50% — the default Chromie feel. Organic texture, loose edges.
OffKilter: 17% — heavy chaos. Normie-adjacent energy.
```

**What mutation does:**
- `paletteSwap` — per-pixel probability of swapping to a sibling in the same
  role family (hair colors swap within hair family, skin swaps within skin family)
- `edgeErode` / `edgeDilate` — silhouette boundary wobble, deterministic per token
- `edgePasses` — number of edge mutation passes (more = more organic/chaotic)

**Mutable slots:** hair, head, neck, body
**Palette families:**
- hair: hair_dark, hair_mid, hair_bright (slots 13-15)
- head/neck/body: skin_shadow_deep → skin_highlight (slots 4-8)

**Key principle:** PHASE3 drift (layer offset) stays zeroed. Mutation is the
only randomization system active. Drift seams look bad; pixel mutation looks organic.

---

### Canvas Mechanics (Post-Mint)

Mutation tier is NOT permanently locked — it is the primary canvas gameplay loop.

**Burn mechanic:**
- Burn one Chromie to "purify" another
- Burned token's mutation energy transfers, moving target toward Pristine
- Pristine tokens become rarer over time as community burns toward them

**Action points:**
- Earned through holding, participation, or other on-chain activity (TBD)
- Spent to shift mutation tier up or down within a defined range
- Gives holders agency over their token's aesthetic

**Awaken event (post-launch):**
- Holders can choose mutation level within a range unlocked by their tier
- Links to ERC-8004 agent system — awakened Chromies may have different
  mutation rules than dormant ones

**Design intent:**
- Pristine = ultra-rare, high value, likely held not used
- OffKilter = raw, expressive, more common but personality-rich
- The mutation tier IS the gameplay — not a static trait but a living one
- This differentiates Chromies from static PFP collections fundamentally

---

### Normified Mode (Filed)

Future canvas editor feature. A slider from "clean Chromie" to "full Normie chaos"
with named tiers. Each position on the slider maps to a mutation intensity preset.
Holders can preview and purchase tier shifts via action points.
