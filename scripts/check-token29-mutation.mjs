#!/usr/bin/env node
/** Compare pristine vs mutated buffers and on-chain mutation eligibility for token #29 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { keccak256, encodePacked } from 'viem';

const require = createRequire(import.meta.url);
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const artRoot = path.join(root, 'art-pipeline');

const {
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  compositeChromie,
  getMutationTier,
} = require(path.join(artRoot, 'generate.js'));
const { SETTINGS, CHARACTERS } = require(path.join(artRoot, 'chromies-config.js'));
const { pickCharacter } = require(path.join(artRoot, 'generate.js'));

const tokenId = 29;
const traits = JSON.parse(fs.readFileSync(path.join(artRoot, 'traits.json'), 'utf8'));
const mintData = JSON.parse(fs.readFileSync(path.join(root, 'public/data/mint-data.json'), 'utf8'));
const rec = mintData.find(r => r.tokenId === tokenId);

function unpack(hex) {
  const packed = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  const buf = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    const b = packed[i >> 1];
    buf[i] = (i & 1) === 0 ? b >> 4 : b & 0x0f;
  }
  return buf;
}

function countDiffs(a, b) {
  let d = 0;
  for (let i = 0; i < 4096; i++) if (a[i] !== b[i]) d++;
  return d;
}

function mutationSwapThreshold(tier) {
  if (tier === 1) return 5;
  if (tier === 2) return 10;
  if (tier === 3) return 20;
  return 0;
}

function mutatePixelIndexOnChain(tokenId, pixelIndex, paletteIndex, tier) {
  if (tier === 0 || paletteIndex === 0) return paletteIndex;
  const threshold = mutationSwapThreshold(tier);
  if (threshold === 0) return paletteIndex;
  const seed = BigInt(keccak256(encodePacked(['uint256', 'uint256', 'string'], [BigInt(tokenId), BigInt(pixelIndex), 'mutation'])));
  if (seed % 100n >= BigInt(threshold)) return paletteIndex;
  if (paletteIndex >= 4 && paletteIndex <= 8) {
    const familyPos = paletteIndex - 4;
    return 4 + Number((BigInt(familyPos) + seed) % 5n);
  }
  if (paletteIndex >= 13 && paletteIndex <= 15) {
    const familyPos = paletteIndex - 13;
    return 13 + Number((BigInt(familyPos) + seed) % 3n);
  }
  return paletteIndex;
}

// traits byte 15 from mint-data
const traitsBytes = Buffer.from(rec.traitsHex.replace(/^0x/, ''), 'hex');
console.log('=== Token #29 mint-data ===');
console.log('traits[15] mutation tier:', traitsBytes[15], '(1=Standard)');
console.log('traits[16] drift tier:', traitsBytes[16]);
console.log('totalPixels bytes [17-18]:', (traitsBytes[17] << 8) | traitsBytes[18]);

const storedBuf = unpack(rec.pixelsHex);

// Regenerate pristine vs mutated
const character = pickCharacter(tokenId);
const picks = pickTokenVariants(tokenId, traits, new Set(), character, false);
loadPickBuffers(picks, traits, character);
const renderPicks = applyCoverageRules(picks, traits, character);
const mTier = getMutationTier(tokenId);

console.log('\n=== Off-chain Standard tier params (chromies-config.js) ===');
console.log(JSON.stringify(mTier, null, 2));

const pristineBuf = compositeChromie(renderPicks, traits, 0, null, null);
const mutatedBuf = compositeChromie(renderPicks, traits, tokenId, null, mTier);

console.log('\n=== Off-chain mutation (generate.js compositeChromie) ===');
console.log('Pristine vs mutated cell diffs:', countDiffs(pristineBuf, mutatedBuf));
console.log('Stored mint-data vs pristine diffs:', countDiffs(storedBuf, pristineBuf));
console.log('Stored mint-data vs fresh mutated diffs:', countDiffs(storedBuf, mutatedBuf));

// On-chain mutation simulation
const tier = traitsBytes[15];
let eligible = 0, swapped = 0, edgeEligible = 0;
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const flat = y * 64 + x;
    const idx = storedBuf[flat];
    if (idx === 0) continue;
    if ((idx >= 4 && idx <= 8) || (idx >= 13 && idx <= 15)) eligible++;
    const mutated = mutatePixelIndexOnChain(tokenId, flat, idx, tier);
    if (mutated !== idx) swapped++;
  }
}
console.log('\n=== On-chain ChromaRendererSvgLib mutation (render-time only) ===');
console.log('Effect: palette index swap within families 4-8 and 13-15');
console.log('Standard threshold: 5% of eligible pixels');
console.log('Eligible pixels (indices 4-8 or 13-15):', eligible);
console.log('Pixels that would swap at render time:', swapped);
