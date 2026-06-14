import { chromaAbi } from "../../abis/Chroma.ts";
import {
  decodeSvgFromMetadataImage,
  createSvgBlobUrl,
  revokeObjectUrl,
  fetchOnChainTokenMetadata,
  resolveMetadataImageUrl,
  tokenPngUrl,
} from "./chromie-token.js";

/**
 * Resolve display image for on-chain metadata.
 * Revealed tokens use an SVG blob URL; unrevealed use reveal placeholders.
 */
export function resolveOnChainDisplayImage(metadata, revealed, tokenId) {
  if (!revealed) {
    return {
      src: resolveMetadataImageUrl(metadata?.image) ?? null,
      kind: "unrevealed-placeholder",
      cleanup: () => {},
    };
  }

  const svg = decodeSvgFromMetadataImage(metadata?.image);
  if (!svg) {
    console.error("[token-display-image] Revealed token missing SVG image", { tokenId });
    return { src: null, kind: "revealed-missing-svg", cleanup: () => {} };
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
    const [metadata, revealed] = await Promise.all([
      fetchOnChainTokenMetadata(publicClient, chromaAddress, tokenId),
      publicClient.readContract({
        address: chromaAddress,
        abi: chromaAbi,
        functionName: "revealed",
        args: [BigInt(tokenId)],
      }),
    ]);

    return resolveOnChainDisplayImage(metadata, revealed, tokenId);
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
