#!/usr/bin/env node
/**
 * Derive proposed NORMIE_* palette registry entries from legendary-finals PNGs.
 * Output: reports/LEGENDARY_PALETTE_PROPOSAL.md (JB approval gate — no registry writes).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));
const { PNG } = require("pngjs");

const FINALS_DIR = path.join(REPO, "art-pipeline/legendary-finals");
const OUT_MD = path.join(REPO, "reports/LEGENDARY_PALETTE_PROPOSAL.md");

/** Mirrors compile_palette_registry.py ROLES (slot labels). */
const ROLE_LABELS = [
  "background (transparent convention)",
  "mask_dark",
  "mask_mid",
  "highlight",
  "skin_shadow_deep",
  "skin_shadow",
  "skin_mid",
  "skin_light",
  "skin_highlight",
  "shirt_torso / hood garment",
  "eye_socket",
  "eye_glow",
  "eye_signal",
  "hair_dark",
  "hair_mid",
  "hair_bright",
];

const ON_CHAIN_IDS = {
  NORMIE_SNOWFRO: 28,
  NORMIE_ACK: 29,
  NORMIE_SERC: 30,
  NORMIE_JACKBUTCHER: 31,
  NORMIE_TIMPERS: 32,
  NORMIE_DEEKAY: 33,
  NORMIE_PIV: 34,
  NORMIE_DOPEMIND: 35,
  NORMIE_UPCOMING2: 36,
};

const TOKENS = [
  { tokenId: 45, file: "0045.png", palette: "NORMIE_SNOWFRO", artist: "Snowfro", normieRef: 45 },
  { tokenId: 264, file: "0264.png", palette: "NORMIE_TIMPERS", artist: "Timpers", normieRef: 5974 },
  { tokenId: 603, file: "0603.png", palette: "NORMIE_ACK", artist: "a.c.k.", normieRef: 603 },
  { tokenId: 1173, file: "1173.png", palette: "NORMIE_DEEKAY", artist: "Deekay", normieRef: 6576 },
  { tokenId: 1294, file: "1294.png", palette: "NORMIE_PIV", artist: "PIV", normieRef: 7409 },
  { tokenId: 4698, file: "4698.png", palette: "NORMIE_JACKBUTCHER", artist: "Jack Butcher", normieRef: 4698 },
];

/** Slot 0 sentinel — alpha=0 maps here; must not collide with art or UNUSED padding. */
const SLOT0_TRANSPARENT = "#000000";

const NEAR_MISS_RGB_THRESHOLD = 18;

function rgbKey(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toLowerCase();
}

function parseHex(hex) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbDistance(hexA, hexB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function extractOpaqueInventory(pngPath) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const counts = new Map();
  let transparent = 0;
  let opaque = 0;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o];
      const g = png.data[o + 1];
      const b = png.data[o + 2];
      const a = png.data[o + 3];
      if (a === 0) {
        transparent += 1;
        continue;
      }
      opaque += 1;
      const hex = rgbKey(r, g, b);
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
  }

  const sorted = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);

  return {
    width: png.width,
    height: png.height,
    transparent,
    opaque,
    colors: sorted,
  };
}

function nextUnusedSentinel(used) {
  for (let i = 1; i <= 255; i++) {
    const candidate = `#${String(i).padStart(6, "0")}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("ran out of UNUSED sentinel hexes");
}

function proposePalette(token, inventory) {
  const artColors = inventory.colors;
  const usedHex = new Set(artColors.map((c) => c.hex));
  usedHex.add(SLOT0_TRANSPARENT);

  const slots = Array.from({ length: 16 }, (_, i) => ({
    index: i,
    role: ROLE_LABELS[i],
    hex: null,
    label: null,
    source: null,
    pixelCount: 0,
  }));

  // Slot 0 — transparent convention (alpha=0); full-bg art does not sample this RGB.
  let slot0Hex = SLOT0_TRANSPARENT;
  if (usedHex.has(SLOT0_TRANSPARENT)) {
    slot0Hex = "#000001";
    usedHex.add(slot0Hex);
  }
  slots[0] = {
    index: 0,
    role: ROLE_LABELS[0],
    hex: slot0Hex,
    label: "TRANSPARENT CONVENTION (alpha=0 → idx 0)",
    source: "convention",
    pixelCount: inventory.transparent,
  };

  const ordering = "frequency (most-used opaque pixels first) — role-agnostic for 1/1 legendaries";
  const maxArtSlots = 15;
  const fits = artColors.length <= maxArtSlots;

  for (let i = 0; i < Math.min(artColors.length, maxArtSlots); i++) {
    const c = artColors[i];
    slots[i + 1] = {
      index: i + 1,
      role: ROLE_LABELS[i + 1],
      hex: c.hex,
      label: `art color rank ${i + 1}`,
      source: "art",
      pixelCount: c.count,
    };
    usedHex.add(c.hex);
  }

  for (let i = 1 + artColors.length; i < 16; i++) {
    const pad = nextUnusedSentinel(usedHex);
    usedHex.add(pad);
    slots[i] = {
      index: i,
      role: ROLE_LABELS[i],
      hex: pad,
      label: "UNUSED padding",
      source: "padding",
      pixelCount: 0,
    };
  }

  return {
    token,
    inventory,
    ordering,
    fits,
    artColorCount: artColors.length,
    slots,
    overflowColors: fits ? [] : artColors.slice(maxArtSlots),
  };
}

function pairwiseDistances(colors) {
  const pairs = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const dist = rgbDistance(colors[i].hex, colors[j].hex);
      pairs.push({
        a: colors[i],
        b: colors[j],
        distance: dist,
        nearMiss: dist <= NEAR_MISS_RGB_THRESHOLD,
      });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}

function swatch(hex) {
  return `\`${hex}\``;
}

function renderSlotTable(proposal) {
  const lines = [
    "| Slot | Role | Hex | Label | Pixels |",
    "|-----:|------|-----|-------|-------:|",
  ];
  for (const s of proposal.slots) {
    lines.push(
      `| ${s.index} | ${s.role} | ${swatch(s.hex)} | ${s.label} | ${s.pixelCount} |`,
    );
  }
  return lines.join("\n");
}

function renderColorsJson(proposal) {
  return JSON.stringify(proposal.slots.map((s) => s.hex), null, 2);
}

function buildMarkdown(proposals) {
  const lines = [];
  lines.push("# Legendary palette registry proposal");
  lines.push("");
  lines.push("**Status:** PROPOSAL ONLY — awaiting JB approval per token before registry compile.");
  lines.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Source art:** \`art-pipeline/legendary-finals/*.png\` (6 delivered)`);
  lines.push("");
  lines.push("## Ordering policy");
  lines.push("");
  lines.push("- **Slot 0:** transparent convention (`alpha=0` → index 0). Full-background finals do not use transparent pixels; slot 0 hex is registry/on-chain background role only.");
  lines.push("- **Slots 1–15:** art opaque colors ordered by **pixel frequency (descending)**. Role names are labels only — not remapped to skin/hair semantics for 1/1 legendaries.");
  lines.push("- **Unused slots:** unique `#00000N` sentinels marked **UNUSED** (distinct from slot 0 and all art colors).");
  lines.push("");
  lines.push("## Sepolia / byte-stability note");
  lines.push("");
  lines.push("These palettes are on-chain IDs **28–36** (`NORMIE_SNOWFRO` … `NORMIE_UPCOMING2`). Updating colors **will change** deployed `ChromaPaletteData` bytes vs current Sepolia (greyscale placeholders). After approval:");
  lines.push("- Re-run `scripts/compile_palette_registry.py`");
  lines.push("- Update byte-stability / palette ID test fixtures expecting IDs 28–36 (documented in same PR as registry change)");
  lines.push("- Production PaletteData redeploy required before mainnet; Sepolia dress-rehearsal stack uses stale legendaries until redeploy");
  lines.push("");
  lines.push("## Remaining blockers (post-approval of these 6)");
  lines.push("");
  lines.push("| Token | Artist | Status |");
  lines.push("|------:|--------|--------|");
  lines.push("| 2222 | DOPEMIND | Final PNG missing; palette hexes unconfirmed — derive on arrival |");
  lines.push("| 4354 | Serc | Final PNG missing — derive on arrival |");
  lines.push("| 3792 | Coming Soon | Final PNG missing — TBD |");
  lines.push("");
  lines.push("**Mint-data:** blocked until 9/9 finals pass preflight + round-trip.");
  lines.push("");

  for (const p of proposals) {
    const { token, inventory, ordering, fits, artColorCount } = p;
    lines.push(`---`);
    lines.push("");
    lines.push(`## #${token.tokenId} ${token.artist} — \`${token.palette}\` (on-chain ID **${ON_CHAIN_IDS[token.palette]}**)`);
    lines.push("");
    lines.push(`- **Final:** \`legendary-finals/${token.file}\``);
    lines.push(`- **Normie ref:** #${token.normieRef}`);
    lines.push(`- **Canvas:** ${inventory.width}×${inventory.height} | opaque ${inventory.opaque} px | transparent ${inventory.transparent} px`);
    lines.push(`- **Distinct opaque colors:** ${artColorCount}`);
    lines.push(`- **Ordering:** ${ordering}`);
    lines.push(`- **Fits 16 slots (incl. slot-0 convention):** ${fits ? `**YES** — ${artColorCount} art color${artColorCount === 1 ? "" : "s"} + slot 0` : "**NO** — see overflow / STOP below"}`);
    lines.push("");

    lines.push("### Distinct-color inventory (opaque, by frequency)");
    lines.push("");
    lines.push("| Rank | Hex | Pixels | Share |");
    lines.push("|-----:|-----|-------:|------:|");
    for (let i = 0; i < inventory.colors.length; i++) {
      const c = inventory.colors[i];
      const pct = ((100 * c.count) / inventory.opaque).toFixed(1);
      lines.push(`| ${i + 1} | ${swatch(c.hex)} | ${c.count} | ${pct}% |`);
    }
    lines.push("");

    if (token.tokenId === 4698) {
      lines.push("### #4698 STOP — 16 art colors + slot 0 = 17 slots");
      lines.push("");
      lines.push("One art color must be **dropped or merged** before this palette can compile. **No automatic merge.**");
      lines.push("");
      lines.push(`Near-miss threshold: RGB Euclidean distance ≤ **${NEAR_MISS_RGB_THRESHOLD}** (flag only).`);
      lines.push("");
      const pairs = pairwiseDistances(inventory.colors);
      const near = pairs.filter((p) => p.nearMiss);
      lines.push("#### Closest color pairs (all 16 × 15 / 2, nearest first)");
      lines.push("");
      lines.push("| Color A | px | Color B | px | Distance | Flag |");
      lines.push("|---------|---:|---------|---:|---------:|:----:|");
      for (const p of pairs.slice(0, 20)) {
        lines.push(
          `| ${swatch(p.a.hex)} | ${p.a.count} | ${swatch(p.b.hex)} | ${p.b.count} | ${p.distance.toFixed(2)} | ${p.nearMiss ? "**NEAR-MISS**" : ""} |`,
        );
      }
      if (pairs.length > 20) {
        lines.push(`| … | | | | | (${pairs.length - 20} more pairs) |`);
      }
      lines.push("");
      if (near.length > 0) {
        lines.push("#### Merge candidates for JB (NOT applied)");
        lines.push("");
        for (const p of near) {
          lines.push(
            `- **${p.a.hex}** (${p.a.count} px) ↔ **${p.b.hex}** (${p.b.count} px) — distance **${p.distance.toFixed(2)}**`,
          );
        }
        lines.push("");
        lines.push(
          "If JB approves merging one near-miss pair, re-run derive → 15 art colors → fits. Otherwise JB must drop one color in the art.",
        );
      } else {
        lines.push("No pairs within near-miss threshold — all 16 colors are ≥ threshold apart; **JB must drop one color in art**.");
      }
      lines.push("");
    }

    if (!fits && token.tokenId !== 4698) {
      lines.push("### Overflow (does not fit)");
      lines.push("");
      for (const c of p.overflowColors) {
        lines.push(`- ${swatch(c.hex)} ×${c.count}`);
      }
      lines.push("");
    }

    if (fits) {
      lines.push("### Proposed 16-slot registry entry");
      lines.push("");
      lines.push(renderSlotTable(p));
      lines.push("");
      lines.push("```json");
      lines.push(renderColorsJson(p));
      lines.push("```");
      lines.push("");
      lines.push("**JB approval:** ☐ Approve as-is");
    } else {
      lines.push("### Proposed registry entry");
      lines.push("");
      lines.push("_Withheld — resolve overflow before approval._");
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Approval workflow (ON APPROVAL ONLY)");
  lines.push("");
  lines.push("1. JB checks ☐ per token above");
  lines.push("2. Write approved `colors` arrays into `art-pipeline/chromies-config.js` + `art-pipeline/palette-registry.json`");
  lines.push("3. `python scripts/compile_palette_registry.py`");
  lines.push("4. `python scripts/check_palette_registry.py` (CI diff clean)");
  lines.push("5. Update palette byte-stability fixtures for IDs 28–36");
  lines.push("6. `node scripts/preflight-legendary.js` × 6 → expect **6/6 PASS**");
  lines.push("7. `node art-pipeline/verify-legendary-finals.js --generate` → expect **zero-diff round-trip**");
  lines.push("");

  return lines.join("\n");
}

function main() {
  const proposals = [];
  for (const token of TOKENS) {
    const pngPath = path.join(FINALS_DIR, token.file);
    if (!fs.existsSync(pngPath)) {
      console.error(`Missing ${pngPath}`);
      process.exit(1);
    }
    const inventory = extractOpaqueInventory(pngPath);
    proposals.push(proposePalette(token, inventory));
  }

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  const md = buildMarkdown(proposals);
  fs.writeFileSync(OUT_MD, md);

  console.log(`Wrote ${OUT_MD}`);
  for (const p of proposals) {
    const status = p.fits ? "FITS" : "STOP/OVERFLOW";
    console.log(`  #${p.token.tokenId} ${p.token.palette}: ${p.artColorCount} colors → ${status}`);
  }
}

main();
