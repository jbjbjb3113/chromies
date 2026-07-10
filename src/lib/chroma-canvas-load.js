import { getPaletteFromMetadata } from "../data/chromies-palettes.js";
import {
  fetchTokenMetadata,
  loadTokenImage,
  tokenPngUrl,
} from "./chromie-token.js";
import { getMintDataEntry } from "./chroma-reveal.js";
import {
  applyCanvasDiffs,
  loadTokenPixelIndices,
  unpackPixelIndicesFromHex,
} from "./pixel-canvas.js";
import { fetchCanvasDiffs } from "./chroma-canvas.js";

/**
 * Load canvas base pixels for a revealed-but-not-inscribed token (Option B):
 * off-chain mint-data / metadata base + on-chain sparse diffs.
 */
export async function loadRevealedOffChainCanvasBase({
  tokenId,
  publicClient,
  chromaAddress,
  canvasAddress,
}) {
  const meta = await fetchTokenMetadata(publicClient, chromaAddress, tokenId);
  const palette = getPaletteFromMetadata(meta);

  let indices;
  try {
    const entry = await getMintDataEntry(tokenId);
    indices = unpackPixelIndicesFromHex(entry.pixelsHex);
  } catch {
    const img = await loadTokenImage(tokenId);
    indices = loadTokenPixelIndices(img, palette.colors);
  }

  let chainDiffCount = 0;
  if (publicClient && canvasAddress) {
    try {
      const { pixelIndexes, newColorIndexes } = await fetchCanvasDiffs(
        publicClient,
        canvasAddress,
        tokenId,
      );
      chainDiffCount = pixelIndexes.length;
      indices = applyCanvasDiffs(indices, pixelIndexes, newColorIndexes);
    } catch (error) {
      console.warn("[chroma-canvas-load] Failed to load on-chain diffs", {
        tokenId,
        error: error?.message ?? error,
      });
    }
  }

  return {
    metadata: meta,
    palette,
    indices,
    chainDiffCount,
    previewImageUrl: meta?.image ? tokenPngUrl(tokenId) : null,
  };
}
