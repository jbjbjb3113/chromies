import { chromaAbi } from "../../abis/Chroma.ts";
import {
  decodeSvgFromMetadataImage,
  createSvgBlobUrl,
  revokeObjectUrl,
  fetchTokenMetadata,
  resolveMetadataImageUrl,
  tokenPngUrl,
} from "./chromie-token.js";
import {
  TOKEN_DISPLAY_STATE,
  fetchTokenDisplayState,
} from "./chroma-token-state.js";

export { TOKEN_DISPLAY_STATE, fetchTokenDisplayState };

/**
 * Resolve display image from metadata + three-state token lifecycle.
 * @param {object|null} metadata
 * @param {string} displayState — TOKEN_DISPLAY_STATE value
 * @param {number} tokenId
 */
export function resolveOnChainDisplayImage(metadata, displayState, tokenId) {
  if (displayState === TOKEN_DISPLAY_STATE.Unrevealed) {
    return {
      src: resolveMetadataImageUrl(metadata?.image) ?? null,
      kind: "unrevealed-placeholder",
      cleanup: () => {},
    };
  }

  if (displayState === TOKEN_DISPLAY_STATE.RevealedOffChain) {
    const src =
      resolveMetadataImageUrl(metadata?.image) ?? tokenPngUrl(tokenId);
    return {
      src,
      kind: "offchain-revealed",
      cleanup: () => {},
    };
  }

  const svg = decodeSvgFromMetadataImage(metadata?.image);
  if (!svg) {
    console.error("[token-display-image] Inscribed token missing SVG image", { tokenId });
    return { src: tokenPngUrl(tokenId), kind: "inscribed-fallback-png", cleanup: () => {} };
  }

  const blobUrl = createSvgBlobUrl(svg);
  return {
    src: blobUrl,
    kind: "onchain-svg-blob",
    cleanup: () => revokeObjectUrl(blobUrl),
  };
}

/** Load the best display image for a token thumbnail / viewer. */
export async function loadTokenDisplayImage({ publicClient, chromaAddress, tokenId }) {
  if (!publicClient || !chromaAddress) {
    return {
      src: tokenPngUrl(tokenId),
      kind: "static-png",
      cleanup: () => {},
    };
  }

  try {
    const [{ state }, metadata] = await Promise.all([
      fetchTokenDisplayState(publicClient, chromaAddress, tokenId),
      fetchTokenMetadata(publicClient, chromaAddress, tokenId),
    ]);

    return resolveOnChainDisplayImage(metadata, state, tokenId);
  } catch (error) {
    console.warn("[token-display-image] On-chain fetch failed, using static PNG", {
      tokenId,
      error: error?.message ?? error,
    });
    return {
      src: tokenPngUrl(tokenId),
      kind: "static-png-fallback",
      cleanup: () => {},
    };
  }
}

export function logRevealedSvgLoadError(tokenId, kind, error) {
  console.error("[token-display-image] Revealed on-chain SVG failed to render", {
    tokenId,
    kind,
    error: error?.message ?? error ?? "image onError",
  });
}
