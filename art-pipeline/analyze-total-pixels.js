// Analyze totalPixels distribution from mint-data.json
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "output", "mint-data.json");
const TIER1 = 1500;
const TIER2 = 2000;

const CHAR_NAMES = ["HeroA Male", "HeroA Female", "Alien", "Cat", "Agent"];
const MUT_NAMES = ["Pristine", "Standard", "Drifted", "OffKilter"];

function parseTraits(traitsHex) {
  const hex = traitsHex.replace(/^0x/i, "");
  const buf = Buffer.from(hex, "hex");
  return {
    character: buf[0],
    mutation: buf[15],
    totalPixels: (buf[17] << 8) | buf[18],
  };
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    n: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
    median,
    p25: sorted[Math.floor(sorted.length * 0.25)],
    p75: sorted[Math.floor(sorted.length * 0.75)],
  };
}

function fmt(s) {
  if (!s) return "n=0";
  return `n=${s.n}  min=${s.min}  max=${s.max}  median=${s.median.toFixed(1)}  mean=${s.mean.toFixed(1)}  p25=${s.p25}  p75=${s.p75}`;
}

function overlapPct(aMin, aMax, bMin, bMax) {
  const overlapStart = Math.max(aMin, bMin);
  const overlapEnd = Math.min(aMax, bMax);
  if (overlapStart > overlapEnd) return 0;
  const overlapSpan = overlapEnd - overlapStart + 1;
  const aSpan = aMax - aMin + 1;
  const bSpan = bMax - bMin + 1;
  return {
    overlapRange: [overlapStart, overlapEnd],
    overlapSpan,
    pctOfA: (overlapSpan / aSpan) * 100,
    pctOfB: (overlapSpan / bSpan) * 100,
  };
}

const records = JSON.parse(fs.readFileSync(DATA, "utf8"));
if (records.length !== 5150) {
  console.warn(`Expected 5150 tokens, got ${records.length}`);
}

const all = [];
const byMut = Object.fromEntries(MUT_NAMES.map((n) => [n, []]));
const byChar = Object.fromEntries(CHAR_NAMES.map((n) => [n, []]));
const apTier = { tier1_lt1500: 0, tier2_1500_1999: 0, tier3_gte2000: 0 };

for (const r of records) {
  const t = parseTraits(r.traitsHex);
  all.push(t.totalPixels);
  byMut[MUT_NAMES[t.mutation]].push(t.totalPixels);
  byChar[CHAR_NAMES[t.character]].push(t.totalPixels);

  if (t.totalPixels < TIER1) apTier.tier1_lt1500++;
  else if (t.totalPixels < TIER2) apTier.tier2_1500_1999++;
  else apTier.tier3_gte2000++;
}

console.log("=== totalPixels distribution (all 5150 tokens) ===");
console.log(fmt(stats(all)));
console.log();

console.log("=== By mutation tier ===");
for (const name of MUT_NAMES) {
  console.log(`${name.padEnd(10)} ${fmt(stats(byMut[name]))}`);
}
console.log();

console.log("=== By character ===");
for (const name of CHAR_NAMES) {
  console.log(`${name.padEnd(14)} ${fmt(stats(byChar[name]))}`);
}
console.log();

console.log("=== Mutation tier range overlap ===");
const mutRanges = MUT_NAMES.map((name) => {
  const s = stats(byMut[name]);
  return { name, min: s.min, max: s.max, p25: s.p25, p75: s.p75 };
});

for (let i = 0; i < MUT_NAMES.length; i++) {
  for (let j = i + 1; j < MUT_NAMES.length; j++) {
    const a = mutRanges[i];
    const b = mutRanges[j];
    const o = overlapPct(a.min, a.max, b.min, b.max);
    console.log(
      `${a.name} [${a.min}-${a.max}] vs ${b.name} [${b.min}-${b.max}]: ` +
      `overlap ${o.overlapRange[0]}-${o.overlapRange[1]} (${o.overlapSpan}px) — ` +
      `${o.pctOfA.toFixed(1)}% of ${a.name} span, ${o.pctOfB.toFixed(1)}% of ${b.name} span`,
    );
  }
}
console.log();

// Distribution overlap: what % of tokens in tier A fall inside tier B's [p25,p75]?
console.log("=== Cross-tier concentration (tokens in neighbor's IQR) ===");
for (let i = 0; i < MUT_NAMES.length; i++) {
  for (let j = 0; j < MUT_NAMES.length; j++) {
    if (i === j) continue;
    const ref = stats(byMut[MUT_NAMES[j]]);
    const vals = byMut[MUT_NAMES[i]];
    const inIQR = vals.filter((v) => v >= ref.p25 && v <= ref.p75).length;
    console.log(
      `${MUT_NAMES[i]} tokens inside ${MUT_NAMES[j]} IQR [${ref.p25}-${ref.p75}]: ` +
      `${inIQR}/${vals.length} (${((inIQR / vals.length) * 100).toFixed(1)}%)`,
    );
  }
}
console.log();

const n = records.length;
console.log(`=== calculateBurnAP pixel tiers (TIER1=${TIER1}, TIER2=${TIER2}) ===`);
for (const [key, count] of Object.entries(apTier)) {
  const pct = ((count / n) * 100).toFixed(1);
  const label = key === "tier1_lt1500" ? `<${TIER1} (1% yield)`
    : key === "tier2_1500_1999" ? `${TIER1}-${TIER2 - 1} (2% yield)`
    : `>=${TIER2} (3% yield)`;
  console.log(`${label.padEnd(24)} ${count} (${pct}%)`);
}

// AP tier breakdown within each mutation tier
console.log();
console.log("=== AP tier % within each mutation tier ===");
for (const name of MUT_NAMES) {
  const vals = byMut[name];
  const t1 = vals.filter((v) => v < TIER1).length;
  const t2 = vals.filter((v) => v >= TIER1 && v < TIER2).length;
  const t3 = vals.filter((v) => v >= TIER2).length;
  console.log(
    `${name}: <${TIER1} ${((t1 / vals.length) * 100).toFixed(1)}% | ` +
    `${TIER1}-${TIER2 - 1} ${((t2 / vals.length) * 100).toFixed(1)}% | >=${TIER2} ${((t3 / vals.length) * 100).toFixed(1)}%`,
  );
}

function ap(px) {
  let pct = px < TIER1 ? 1 : px < TIER2 ? 2 : 3;
  let v = Math.floor((px * pct) / 100);
  let cap = Math.floor((px * 4) / 100);
  return v > cap ? cap : v;
}

console.log();
console.log("=== calculateBurnAP yield (overall) ===");
console.log(fmt(stats(all.map((px) => ap(px)))));

console.log();
console.log("=== calculateBurnAP yield by character ===");
for (const name of CHAR_NAMES) {
  console.log(`${name.padEnd(14)} ${fmt(stats(byChar[name].map((px) => ap(px))))}`);
}
