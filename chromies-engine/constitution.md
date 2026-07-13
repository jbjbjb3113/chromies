# Chromies Visual Constitution

Every forged identity must pass all **REQUIRED** rules and violate zero **FORBIDDEN** rules. Enforcement is programmatic — not subjective review.

Normies are a negative similarity reference only. This document defines what a Chromie **is**, not what we copy.

---

## Canvas & Proportions

| Rule | Value |
|------|-------|
| Canvas | 64×64 px, transparent background (canonical) |
| Character bounding box | Width 30–46 px, height 48–60 px |
| Head height | 40–50% of total character height |
| Head width | 22–34 px |
| Vertical anchor | Feet baseline at y=60; head top between y=4 and y=12 |
| Horizontal anchor | Center of mass offset from canvas center by 1–3 px |

---

## Required Rules

1. **Forehead mark present** on 100% of identities. Within the forehead band (6–10 px wide, per head shape). Mark: 3–12 colored pixels.
2. **Asymmetry**: horizontal mirror diff ≥ 8% of character pixels.
3. **Hair never centered**: hair mass centroid ≥ 3 px off head vertical centerline.
4. **Jaw tapers into mask**: bottom 25% of head narrows monotonically row-by-row into the mask edge.
5. **Mask/face structure is the identity anchor**: mask region always defined; ≥ 1 hard silhouette break (row width change ≥ 2 px).
6. **Strong silhouette**: 3–7 convexity defects in the alpha silhouette.
7. **Outline discipline**: 1 px outline, one dedicated outline color per palette family; open breaks allowed in ≤ 2 designated zones.
8. **Palette compliance**: every pixel color ∈ assigned family (≤ 15 colors + transparent, 4bpp-compatible).

---

## Forbidden Rules

- Perfect symmetry
- Centered hair mass
- Pure grayscale / monochrome (minimum 3 distinct hues, ≥ 25° HSV separation)
- 40×40 or 40-grid-aligned internal structure
- Round-dot eyes + flat-line mouth on plain oval head
- Pixels on canvas edge rows 0–1 or columns 0–1
- Orphan pixels (opaque with zero opaque 4-neighbors)
- Partial alpha (alpha must be 0 or 255 only)

---

## Face / Mask

- Mask: lower 40–60% of head
- Visible seam where mask meets upper face
- Eyes above mask line; vertical position 30–45% of head height from top
- Mouth only when mask type permits; masked identities never have a mouth

---

## Body

- Shoulder width: 60–110% of head width
- Arms optional; if both present, not mirror images
- Clothing covers ≥ 70% of torso pixels
- Feet: 2–4 px foot block, or exactly 2 px hover gap (rare)

---

## Palette

- 8 families: Ember, Tide, Verdant, Ash, Violet Hour, Signal, Rust, Polar
- Each family: 15 colors + transparent
- Slots: 1 outline, 3 skin/mask, 3 hair, 3 clothing, 2 accent, 2 accessory, 1 forehead mark
- Mark color = highest saturation in family
- Ramps use hue-shifted shading
- No color in more than 3 families

---

## Identity DNA

Every Chromie carries:

- **Appearance traits** — head, mask, eyes, hair, mark, body, clothing, accessories, drift, palette
- **Provenance** — seed, engine version, roll order version, conflict repairs
- **Validation record** — pixel, palette, silhouette checks
- **Similarity verdict** — distance from Normies fingerprints and collection (Phase 5+)

Same seed + same engine version + same asset versions = byte-identical output forever.
