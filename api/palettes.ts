export type Palette = { id: number; name: string; colors: string[] };

export const PALETTES: Palette[] = [
  {
    id: 0,
    name: "Ember",
    colors: [
      "#1a1014",
      "#2d161c",
      "#451d24",
      "#5e2730",
      "#7a3340",
      "#9c4050",
      "#c25062",
      "#e06478",
      "#f2879a",
      "#ffb0bd",
      "#ffd28f",
      "#ffac4a",
      "#ff7b2e",
      "#e8541d",
      "#a83515",
      "#5c1d0f",
    ],
  },
  {
    id: 1,
    name: "Tide",
    colors: [
      "#08111c",
      "#0d1f33",
      "#13314d",
      "#1a456b",
      "#225d8c",
      "#2d7aad",
      "#3f9bcc",
      "#5cbce0",
      "#86d6ee",
      "#b8eefa",
      "#d4f6e8",
      "#8fe6c4",
      "#4fcf9c",
      "#1d9e75",
      "#0f6e56",
      "#063f33",
    ],
  },
  {
    id: 2,
    name: "Dusk",
    colors: [
      "#0f0a1a",
      "#1c1330",
      "#2c1c4a",
      "#3e2a66",
      "#523a84",
      "#6a4ca6",
      "#8463c4",
      "#a181df",
      "#c0a3f0",
      "#ddc8fb",
      "#f6d6ec",
      "#e89bc9",
      "#d4609f",
      "#a8447a",
      "#6f2a52",
      "#3a1530",
    ],
  },
  {
    id: 3,
    name: "Verdant",
    colors: [
      "#0a1108",
      "#142010",
      "#1f3318",
      "#2c4a20",
      "#3d662b",
      "#519136",
      "#6db742",
      "#8fd95a",
      "#bff07e",
      "#e4ffb0",
      "#fff0a8",
      "#f5c45e",
      "#d99432",
      "#a8651c",
      "#6e3e12",
      "#3a210a",
    ],
  },
  {
    id: 4,
    name: "Mono+",
    colors: [
      "#0a0a0b",
      "#161618",
      "#242427",
      "#343438",
      "#48494b",
      "#5f6063",
      "#787a7d",
      "#94969a",
      "#b1b3b7",
      "#cfd1d4",
      "#e3e5e4",
      "#f2f3f2",
      "#ff5470",
      "#3f9bcc",
      "#ffac4a",
      "#6db742",
    ],
  },
  {
    id: 5,
    name: "Candy",
    colors: [
      "#1a0f1a",
      "#2e1730",
      "#4a2050",
      "#6a2c72",
      "#8c3a92",
      "#b14fae",
      "#d46bc4",
      "#ef8fd6",
      "#ffb8e6",
      "#ffe0f4",
      "#fff3cc",
      "#ffd96b",
      "#ffb03f",
      "#ff7a5c",
      "#e84d6b",
      "#8c2a4a",
    ],
  },
];

const TYPES = ["Human", "Cat", "Alien", "Droid", "Specter"];
const EXPRESSIONS = ["Neutral", "Smile", "Serious", "Smug", "Surprised", "Sleepy"];
const HEADGEAR = ["None", "Cap", "Crown", "Halo", "Antenna", "Top Hat", "Visor", "Beanie"];
const EYEWEAR = ["None", "Shades", "Round Glasses", "Visor", "Eyepatch", "VR"];

export function decodeTraits(rawTraits: `0x${string}`) {
  const bytes = Buffer.from(rawTraits.slice(2), "hex");
  const type = bytes[0] ?? 0;
  const expression = bytes[1] ?? 0;
  const headgear = bytes[2] ?? 0;
  const eyewear = bytes[3] ?? 0;
  const paletteId = (bytes[4] ?? 0) % PALETTES.length;

  return {
    type: TYPES[type % TYPES.length],
    expression: EXPRESSIONS[expression % EXPRESSIONS.length],
    headgear: HEADGEAR[headgear % HEADGEAR.length],
    eyewear: EYEWEAR[eyewear % EYEWEAR.length],
    paletteId,
    palette: PALETTES[paletteId].name,
  };
}
