// ============================================================================
// prepare-dataset-v2.js
// Head + hair focused kohya_ss LoRA dataset (higher repeat count).
//
// USAGE:  node lora-pipeline/prepare-dataset-v2.js
// OUTPUT: lora-pipeline/dataset-v2/30_chromie/  (images + .txt captions)
// ============================================================================

const fs = require("fs");
const path = require("path");

const REPEAT_COUNT = 30;
const INSTANCE_TOKEN = "chromie";
const DATASET_FOLDER = `${REPEAT_COUNT}_${INSTANCE_TOKEN}`;

const SCRIPT_DIR = __dirname;
const COMPONENTS_DIR = path.resolve(SCRIPT_DIR, "..", "components");
const DATASET_DIR = path.resolve(SCRIPT_DIR, "dataset-v2", DATASET_FOLDER);

const HEAD_PATTERN = /^(SP_)?HEAD_.+\.png$/i;
const HAIR_PATTERN = /^(SP_)?HAIR_.+\.png$/i;
const BACKUP_COPY_PATTERN = / - Copy|-Copy/i;

function isBackupCopy(filename) {
  return BACKUP_COPY_PATTERN.test(path.basename(filename, path.extname(filename)));
}

function isHeadFile(filename) {
  return HEAD_PATTERN.test(filename) && !isBackupCopy(filename);
}

function isHairFile(filename) {
  return HAIR_PATTERN.test(filename) && !isBackupCopy(filename);
}

function parseVariant(filename, slotPrefix) {
  let base = path.basename(filename, path.extname(filename));
  let sideProfile = false;

  if (base.startsWith("SP_")) {
    sideProfile = true;
    base = base.slice(3);
  }

  base = base.slice(slotPrefix.length);
  const variant = base.replace(/_/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
  return { variant: variant || "default", sideProfile };
}

function captionHead(filename) {
  const { variant, sideProfile } = parseVariant(filename, "HEAD_");
  if (sideProfile) {
    return `chromie pixel art face side profile ${variant}, 64x64, 16 color palette, indexed color, side profile portrait, pixel art facial features`;
  }
  return `chromie pixel art face ${variant}, 64x64, 16 color palette, indexed color, frontal portrait, pixel art facial features`;
}

function captionHair(filename) {
  const { variant, sideProfile } = parseVariant(filename, "HAIR_");
  const variantLabel = sideProfile ? `side profile ${variant}` : variant;
  return `chromie pixel art hairstyle ${variantLabel}, 64x64, 16 color palette, indexed color, hair component layer`;
}

function main() {
  if (!fs.existsSync(COMPONENTS_DIR)) {
    console.error(`Components directory not found: ${COMPONENTS_DIR}`);
    process.exit(1);
  }

  const allPngs = fs
    .readdirSync(COMPONENTS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b));

  const headFiles = allPngs.filter(isHeadFile);
  const hairFiles = allPngs.filter(isHairFile);
  const files = [...headFiles, ...hairFiles];

  if (files.length === 0) {
    console.error(`No HEAD_*.png or HAIR_*.png files found in ${COMPONENTS_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(DATASET_DIR, { recursive: true });

  // Remove stale outputs from prior runs (e.g. excluded backup copies).
  for (const existing of fs.readdirSync(DATASET_DIR)) {
    if (existing.endsWith(".png") || existing.endsWith(".txt")) {
      fs.unlinkSync(path.join(DATASET_DIR, existing));
    }
  }

  let pairs = 0;
  for (const file of files) {
    const srcPng = path.join(COMPONENTS_DIR, file);
    const destPng = path.join(DATASET_DIR, file);
    const caption = isHeadFile(file) ? captionHead(file) : captionHair(file);
    const destTxt = path.join(DATASET_DIR, `${path.basename(file, ".png")}.txt`);

    fs.copyFileSync(srcPng, destPng);
    fs.writeFileSync(destTxt, caption, "utf8");
    pairs++;
  }

  console.log("Chromies LoRA dataset v2 prepared (head + hair, kohya_ss format)");
  console.log(`  Source:      ${COMPONENTS_DIR}`);
  console.log(`  Destination: ${DATASET_DIR}`);
  console.log(`  Folder:      ${DATASET_FOLDER} (${REPEAT_COUNT} repeats per image per epoch)`);
  console.log(`  HEAD files:  ${headFiles.length}`);
  console.log(`  HAIR files:  ${hairFiles.length}`);
  console.log(`  Total pairs: ${pairs} image + caption .txt files`);
  if (headFiles.length > 0) {
    console.log(`\nExample HEAD caption (${headFiles[0]}):`);
    console.log(`  ${captionHead(headFiles[0])}`);
  }
  if (hairFiles.length > 0) {
    console.log(`\nExample HAIR caption (${hairFiles[0]}):`);
    console.log(`  ${captionHair(hairFiles[0])}`);
  }
}

if (require.main === module) main();

module.exports = {
  captionHead,
  captionHair,
  isHeadFile,
  isHairFile,
  isBackupCopy,
  REPEAT_COUNT,
  INSTANCE_TOKEN,
  DATASET_FOLDER,
};
