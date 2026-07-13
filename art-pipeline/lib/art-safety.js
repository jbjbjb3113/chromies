// Read-only guard for art-pipeline/components (mirrors chromies-engine/engine/art_safety.py).
const fs = require("fs");
const path = require("path");

const COMPONENTS_ROOT = path.resolve(__dirname, "..", "components");
const LEGENDARY_HEAD_MANIFEST = path.join(COMPONENTS_ROOT, "legendary", "HEAD_MANIFEST.json");

class ReadOnlyArtViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReadOnlyArtViolationError";
  }
}

function isUnderComponentsRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const rel = path.relative(COMPONENTS_ROOT, resolved);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function isLegendaryHeadComponent(targetPath) {
  const resolved = path.resolve(targetPath);
  const rel = path.relative(path.join(COMPONENTS_ROOT, "legendary"), resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  return /^NORMIE_\d+_[A-Za-z0-9_]+\.png$/i.test(path.basename(resolved));
}

/**
 * Block writes into components/ unless explicitly allowed.
 * Legendary head PNGs require --force + manifest update workflow.
 */
function assertWritableComponentPath(targetPath, options = {}) {
  if (!isUnderComponentsRoot(targetPath)) return;

  const force = options.force === true;
  const rel = path.relative(COMPONENTS_ROOT, path.resolve(targetPath)).replace(/\\/g, "/");

  if (isLegendaryHeadComponent(targetPath)) {
    if (!force) {
      throw new ReadOnlyArtViolationError(
        `Refusing to write pinned legendary head component: ${rel}\n` +
        "  These files are manifest-locked. Update HEAD_MANIFEST.json + use --force after JB approval.",
      );
    }
    return;
  }

  if (!force) {
    throw new ReadOnlyArtViolationError(
      `Refusing to write inside read-only components root: ${rel}\n` +
      "  Use --force only for approved extraction workflows outside legendary heads.",
    );
  }
}

function guardedWriteFileSync(targetPath, data, options = {}) {
  assertWritableComponentPath(targetPath, options);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, data);
}

module.exports = {
  COMPONENTS_ROOT,
  LEGENDARY_HEAD_MANIFEST,
  ReadOnlyArtViolationError,
  isUnderComponentsRoot,
  isLegendaryHeadComponent,
  assertWritableComponentPath,
  guardedWriteFileSync,
};
