// ============================================================================
// prepare-dataset.js
// Prepare Chromies component PNGs for kohya_ss LoRA training.
//
// USAGE:  node lora-pipeline/prepare-dataset.js
// OUTPUT: lora-pipeline/dataset/10_chromie/  (images + .txt captions)
// ============================================================================

const fs = require("fs");
const path = require("path");

const REPEAT_COUNT = 10;
const INSTANCE_TOKEN = "chromie";
const DATASET_FOLDER = `${REPEAT_COUNT}_${INSTANCE_TOKEN}`;

const SCRIPT_DIR = __dirname;
const COMPONENTS_DIR = path.resolve(SCRIPT_DIR, "..", "components");
const DATASET_DIR = path.resolve(SCRIPT_DIR, "dataset", DATASET_FOLDER);

function captionFromFilename(filename) {
  let base = path.basename(filename, path.extname(filename));
  let sideProfile = false;

  if (base.startsWith("SP_")) {
    sideProfile = true;
    base = base.slice(3);
  }

  const parts = base.split("_");
  const slot = parts[0].toLowerCase();
  let variant = parts.slice(1).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  if (!variant) variant = "default";
  if (sideProfile) variant = `side profile ${variant}`.trim();

  return `chromie pixel art ${slot} ${variant}, 64x64, 16 color palette, indexed color`;
}

function main() {
  if (!fs.existsSync(COMPONENTS_DIR)) {
    console.error(`Components directory not found: ${COMPONENTS_DIR}`);
    process.exit(1);
  }

  const pngs = fs
    .readdirSync(COMPONENTS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b));

  if (pngs.length === 0) {
    console.error(`No PNG files found in ${COMPONENTS_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(DATASET_DIR, { recursive: true });

  let pairs = 0;
  for (const file of pngs) {
    const srcPng = path.join(COMPONENTS_DIR, file);
    const destPng = path.join(DATASET_DIR, file);
    const caption = captionFromFilename(file);
    const destTxt = path.join(DATASET_DIR, `${path.basename(file, ".png")}.txt`);

    fs.copyFileSync(srcPng, destPng);
    fs.writeFileSync(destTxt, caption, "utf8");
    pairs++;
  }

  console.log(`Chromies LoRA dataset prepared (kohya_ss format)`);
  console.log(`  Source:      ${COMPONENTS_DIR}`);
  console.log(`  Destination: ${DATASET_DIR}`);
  console.log(`  Folder:      ${DATASET_FOLDER} (${REPEAT_COUNT} repeats per image per epoch)`);
  console.log(`  Pairs:       ${pairs} image + caption .txt files`);
  console.log(`\nExample caption (${pngs[0]}):`);
  console.log(`  ${captionFromFilename(pngs[0])}`);
}

if (require.main === module) main();

module.exports = { captionFromFilename, REPEAT_COUNT, INSTANCE_TOKEN, DATASET_FOLDER };
