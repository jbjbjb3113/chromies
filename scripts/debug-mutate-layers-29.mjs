#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const artRoot = path.join(root, 'art-pipeline');

const { pickTokenVariants, loadPickBuffers, applyCoverageRules, pickCharacter } = require(path.join(artRoot, 'generate.js'));
const { getMutationTier } = require(path.join(artRoot, 'generate.js'));
const { mutateLayer } = require(path.join(artRoot, 'pixel-mutation.js'));
const { PIXEL_MUTATION } = require(path.join(artRoot, 'chromies-config.js'));

const tokenId = 29;
const traits = require(path.join(artRoot, 'traits.json'));
const character = pickCharacter(tokenId);
const picks = pickTokenVariants(tokenId, traits, new Set(), character, false);
loadPickBuffers(picks, traits, character);
const renderPicks = applyCoverageRules(picks, traits, character);
const mTier = getMutationTier(tokenId);

function countNonZero(buf) {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i]) n++;
  return n;
}

function diffCount(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

console.log('PIXEL_MUTATION.enabled:', PIXEL_MUTATION.enabled);
console.log('mutableSlots:', PIXEL_MUTATION.mutableSlots);
console.log('mTier:', mTier.name);

for (const [slot, pick] of Object.entries(renderPicks)) {
  if (!pick?.buffer) continue;
  const scale = pick.variant?.mutationScale ?? 1;
  const out = mutateLayer(pick.buffer, tokenId, slot, mTier, scale);
  const d = diffCount(pick.buffer, out);
  console.log(`${slot.padEnd(12)} pixels=${countNonZero(pick.buffer)} diffs=${d} mutable=${PIXEL_MUTATION.mutableSlots.includes(slot)} scale=${scale}`);
}

// Force OffKilter to see if ANY mutation fires
const offKilter = PIXEL_MUTATION.tiers.find(t => t.name === 'OffKilter');
console.log('\n--- Forced OffKilter tier per layer ---');
for (const [slot, pick] of Object.entries(renderPicks)) {
  if (!pick?.buffer) continue;
  const scale = pick.variant?.mutationScale ?? 1;
  const out = mutateLayer(pick.buffer, tokenId, slot, offKilter, scale);
  console.log(`${slot.padEnd(12)} diffs=${diffCount(pick.buffer, out)}`);
}
