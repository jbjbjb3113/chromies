import { chromaAbi } from "../../abis/Chroma.ts";

const GRID = 64;
const TOKEN_MAX = 9999;

const JSON_DATA_URI_PREFIX = "data:application/json;base64,";
const SVG_DATA_URI_PREFIX = "data:image/svg+xml;base64,";

const DEFAULT_IPFS_GATEWAY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_IPFS_GATEWAY) ||
  "https://ipfs.io/ipfs/";

/** Convert ipfs:// URIs to an HTTP gateway URL for browser fetch. */
export function resolveFetchableUri(uri) {
  if (!uri || typeof uri !== "string") return uri;
  if (uri.startsWith("ipfs://ipfs/")) {
    return `${DEFAULT_IPFS_GATEWAY}${uri.slice("ipfs://ipfs/".length)}`;
  }
  if (uri.startsWith("ipfs://")) {
    return `${DEFAULT_IPFS_GATEWAY}${uri.slice(7)}`;
  }
  return uri;
}

export function formatTokenId(id) {
  return String(id).padStart(4, "0");
}

export function parseTokenId(raw) {
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > TOKEN_MAX) return null;
  return n;
}

export function tokenPngUrl(id) {
  return `/tokens/${formatTokenId(id)}.png`;
}

/** Resolve metadata image URL for display (placeholders, ipfs, local fallbacks). */
export function resolveMetadataImageUrl(image) {
  if (!image || typeof image !== "string") return image;
  const match = image.match(/RevealImage(?:_([A-Za-z]))?\.png$/i);
  if (match) {
    const suffix = match[1] ? `_${match[1].toUpperCase()}` : "";
    return `/RevealImage${suffix}.png`;
  }
  if (image.startsWith("ipfs://")) {
    return resolveFetchableUri(image);
  }
  return image;
}

/** Decode embedded on-chain SVG from token metadata image field. */
export function decodeSvgFromMetadataImage(image) {
  if (!image?.startsWith(SVG_DATA_URI_PREFIX)) return null;
  try {
    return atob(image.slice(SVG_DATA_URI_PREFIX.length));
  } catch {
    return null;
  }
}

export function isOnChainSvgImage(image) {
  return typeof image === "string" && image.startsWith(SVG_DATA_URI_PREFIX);
}

export function isDataUriJsonTokenUri(tokenUri) {
  return typeof tokenUri === "string" && tokenUri.startsWith(JSON_DATA_URI_PREFIX);
}

/** Create a blob URL for decoded SVG markup (caller must revoke). */
export function createSvgBlobUrl(svgString) {
  if (!svgString) return null;
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function tokenJsonUrl(id) {
  return `/tokens/${formatTokenId(id)}.json`;
}

export async function fetchMetadataFromUri(uri, signal) {
  const url = resolveFetchableUri(uri);
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Metadata fetch failed (${res.status})`);
  return res.json();
}

export async function fetchChromieMetadata(id, signal) {
  const res = await fetch(tokenJsonUrl(id), { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Token #${id} metadata not found.`);
  return res.json();
}

/** Decode `data:application/json;base64,...` from on-chain tokenURI. */
export function decodeTokenUriMetadata(tokenUri) {
  if (!tokenUri?.startsWith(JSON_DATA_URI_PREFIX)) {
    throw new Error("Unsupported tokenURI format.");
  }
  const json = atob(tokenUri.slice(JSON_DATA_URI_PREFIX.length));
  return JSON.parse(json);
}

/**
 * Fetch token metadata from tokenURI — handles base64 data URIs and off-chain
 * ipfs/http links (revealed-but-not-inscribed state).
 */
export async function fetchTokenMetadata(publicClient, chromaAddress, tokenId, signal) {
  const tokenUri = await publicClient.readContract({
    address: chromaAddress,
    abi: chromaAbi,
    functionName: "tokenURI",
    args: [BigInt(tokenId)],
  });

  if (isDataUriJsonTokenUri(tokenUri)) {
    return decodeTokenUriMetadata(tokenUri);
  }

  try {
    return await fetchMetadataFromUri(tokenUri, signal);
  } catch (error) {
    console.warn("[chromie-token] Off-chain metadata fetch failed, using local fallback", {
      tokenId,
      tokenUri,
      error: error?.message ?? error,
    });
    return fetchChromieMetadata(tokenId, signal);
  }
}

/** @deprecated Prefer fetchTokenMetadata for three-state routing. */
export async function fetchOnChainTokenMetadata(publicClient, chromaAddress, tokenId) {
  return fetchTokenMetadata(publicClient, chromaAddress, tokenId);
}

export function loadTokenImage(id) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load token #${id} image.`));
    img.src = tokenPngUrl(id);
  });
}

/** Default mouth region on 64×64 Chromie grid (pixel coords). */
export const DEFAULT_MOUTH = {
  x: 24,
  y: 38,
  w: 16,
  h: 5,
};

const MOUTH_LOOK_PREFIX = "chromie-lab-mouth-look:token:";

export function mouthLookTokenKey(tokenId) {
  return `${MOUTH_LOOK_PREFIX}${tokenId}`;
}

export function clampMouth({ x, y, w, h }) {
  const cx = Math.min(GRID - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(GRID - 1, Math.max(0, Math.round(y)));
  const cw = Math.min(GRID - cx, Math.max(1, Math.round(w)));
  const ch = Math.min(GRID - cy, Math.max(1, Math.round(h)));
  return { x: cx, y: cy, w: cw, h: ch };
}

export function loadMouthForToken(tokenId) {
  try {
    const raw = localStorage.getItem(mouthLookTokenKey(tokenId));
    if (!raw) return { ...DEFAULT_MOUTH };
    const s = JSON.parse(raw);
    return clampMouth({
      x: Number.isFinite(s.x) ? s.x : DEFAULT_MOUTH.x,
      y: Number.isFinite(s.y) ? s.y : DEFAULT_MOUTH.y,
      w: Number.isFinite(s.w) ? s.w : DEFAULT_MOUTH.w,
      h: Number.isFinite(s.h) ? s.h : DEFAULT_MOUTH.h,
    });
  } catch {
    return { ...DEFAULT_MOUTH };
  }
}

function mouthEqualsDefault(mouth) {
  const m = clampMouth(mouth);
  return (
    m.x === DEFAULT_MOUTH.x &&
    m.y === DEFAULT_MOUTH.y &&
    m.w === DEFAULT_MOUTH.w &&
    m.h === DEFAULT_MOUTH.h
  );
}

export function saveMouthForToken(tokenId, mouth) {
  try {
    if (mouthEqualsDefault(mouth)) {
      localStorage.removeItem(mouthLookTokenKey(tokenId));
    } else {
      localStorage.setItem(mouthLookTokenKey(tokenId), JSON.stringify(clampMouth(mouth)));
    }
  } catch {
    /* ignore */
  }
}

export function clearMouthForToken(tokenId) {
  try {
    localStorage.removeItem(mouthLookTokenKey(tokenId));
  } catch {
    /* ignore */
  }
}

export { GRID };
