// ============================================================================
// trait-breakdown.js
// Decodes mint-data.json traitsHex and shows full trait distributions.
// Run from art-pipeline/:  node trait-breakdown.js
// ============================================================================

const fs = require("fs");
const path = require("path");
const { buildCharacterDecoderTable } = require("./on-chain-character-bytes");

const MINT_DATA_PATH = path.resolve("output/mint-data.json");

const CHARACTER  = buildCharacterDecoderTable();
const PALETTE    = ["SIGNAL","ACID","CYAN","GHOST","BLOOD","MOSS","SIGNAL_BLONDE","SIGNAL_GREY","SIGNAL_RED","ACID_BLONDE","ACID_GREY","ACID_RED","CYAN_BLONDE","CYAN_GREY","CYAN_RED","GHOST_BLONDE","GHOST_GREY","GHOST_RED","BLOOD_BLONDE","BLOOD_GREY","BLOOD_RED","MOSS_BLONDE","MOSS_GREY","MOSS_RED","CAT","ALIEN","ZOMBIE","AGENT"];
const HOOD       = ["None","Classic"];
const SHIRT      = ["None","Crew","Tank","Tank_Female"];
const BODY       = ["None","Default","Female","Female_Tank","Alien","Tank","Zombie"];
const BODYTATTOO = ["None","UnderArmour","AkuHeart","Pyramid","Normies"];
const NECKLACE   = ["None","Male_Chain","Female_Chain","Female_Ornate","Female_Flower","Female_UpsideDownCross","Female_Opal","Male_Chromies","Male_HappyFace","Male_Normies","Male_Pendent"];
const TATTOO     = ["None","Signal","Thug","Marks","Scar"];
const MASK       = ["None"];
const BEARD      = ["None","Full","Goat"];
const MUSTACHE   = ["None","Thick"];
const EYES       = ["Signal","Alien"];
const EARRINGS   = ["None","Stud"];
const GLASSES    = ["None","Shades","Neo","VR"];
const HAIR       = ["None","Mohawk","Pompadour","MrT","Afro","Dreads","Surfer","FadeRight"];
const SLOTS = [
  { name: "Character",   table: CHARACTER  },
  { name: "Palette",     table: PALETTE    },
  { name: "Hood",        table: HOOD       },
  { name: "Shirt",       table: SHIRT      },
  { name: "Body",        table: BODY       },
  { name: "BodyTattoo",  table: BODYTATTOO },
  { name: "Necklace",    table: NECKLACE   },
  { name: "Tattoo",      table: TATTOO     },
  { name: "Mask",        table: MASK       },
  { name: "Beard",       table: BEARD      },
  { name: "Mustache",    table: MUSTACHE   },
  { name: "Eyes",        table: EYES       },
  { name: "Earrings",    table: EARRINGS   },
  { name: "Glasses",     table: GLASSES    },
  { name: "Hair",        table: HAIR       },
  { name: "Mutation",    retired: true     },
  { name: "Drift",       retired: true     },
];

function decode(traitsHex) {
  const hex = traitsHex.replace("0x", "");
  const bytes = Buffer.from(hex, "hex");
  return SLOTS.map((slot, i) => {
    if (slot.retired) return "Retired/Unused";
    const val = bytes[i];
    return slot.table[val] ?? `unknown(${val})`;
  });
}

function showDist(label, values, total) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  console.log(`\n${label}:`);
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) =>
      console.log(`  ${k.padEnd(28)} ${String(v).padStart(5)}  (${((v/total)*100).toFixed(1)}%)`)
    );
}

const data = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
const total = data.length;
console.log(`Decoding ${total} tokens from mint-data.json...\n`);

const decoded = data.map(r => decode(r.traitsHex));

SLOTS.forEach((slot, i) => {
  showDist(slot.name, decoded.map(d => d[i]), total);
});

console.log(`\nTotal: ${total} tokens`);
