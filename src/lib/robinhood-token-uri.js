import {
  decodeSvgFromMetadataImage,
  decodeTokenUriMetadata,
  revokeObjectUrl,
} from "./chromie-token.js";
import {
  chromiesCommemorativeAbi,
  getChromaRendererRobinhoodAddress,
  getChromiesCommemorativeAddress,
  robinhoodChain,
} from "./robinhood-contract.js";

const PNG_IN_SHELL_RE = /data:image\/png;base64,([A-Za-z0-9+/=]+)/;

const rendererAbi = [
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
];

/** Trait slots shown on the listing card — OpenSea order, values from live tokenURI JSON. */
export const LISTING_TRAIT_SLOTS = [
  { label: "Beard", traitType: "Beard" },
  { label: "Body", traitType: "Body" },
  { label: "Bodytattoo", traitType: "Bodytattoo" },
  { label: "Burns Absorbed", traitType: "Burns Absorbed" },
  { label: "Character", traitType: "Character" },
  { label: "Earrings", traitType: "Earrings" },
  { label: "Eyes", traitType: "Eyes" },
  { label: "Glasses", traitType: "Glasses" },
  { label: "Hair", traitType: "Hair" },
  { label: "Hood", traitType: "Hood" },
  { label: "Level", traitType: "Level" },
  { label: "Mustache", traitType: "Mustache" },
  { label: "Necklace", traitType: "Necklace" },
  { label: "Palette", traitType: "Palette" },
  { label: "Shirt", traitType: "Shirt" },
  { label: "Tattoo", traitType: "Tattoo" },
  { label: "Total Pixels", traitType: "Total Pixels" },
];

export function shortenAddress(address) {
  if (!address || typeof address !== "string") return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function attributesFromMetadata(metadata) {
  const map = new Map();
  for (const entry of metadata?.attributes ?? []) {
    const traitType = entry?.trait_type;
    if (!traitType) continue;
    map.set(String(traitType), entry.value);
  }
  return map;
}

export function extractPngBytesFromMetadata(metadata) {
  const image = metadata?.image;
  if (typeof image !== "string") {
    throw new Error("tokenURI metadata missing image field.");
  }

  const svg = decodeSvgFromMetadataImage(image);
  if (!svg) {
    throw new Error("tokenURI image is not an embedded SVG shell.");
  }

  const match = svg.match(PNG_IN_SHELL_RE);
  if (!match) {
    throw new Error("SVG shell missing embedded PNG.");
  }

  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function createPngBlobUrl(pngBytes) {
  const blob = new Blob([pngBytes], { type: "image/png" });
  return URL.createObjectURL(blob);
}

export function parseRobinhoodTokenUri(tokenUri) {
  const metadata = decodeTokenUriMetadata(tokenUri);
  const pngBytes = extractPngBytesFromMetadata(metadata);
  return {
    metadata,
    attributes: attributesFromMetadata(metadata),
    pngBytes,
    pngBlobUrl: createPngBlobUrl(pngBytes),
  };
}

export async function fetchRobinhoodTokenListing(publicClient, tokenId, chainId = robinhoodChain.id) {
  const rendererAddress = getChromaRendererRobinhoodAddress(chainId);
  const commemorativeAddress = getChromiesCommemorativeAddress(chainId);
  if (!rendererAddress || !commemorativeAddress) {
    throw new Error("Robinhood commemorative contracts are not configured for this chain.");
  }

  const [tokenUri, owner] = await Promise.all([
    publicClient.readContract({
      address: rendererAddress,
      abi: rendererAbi,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    }),
    publicClient.readContract({
      address: commemorativeAddress,
      abi: chromiesCommemorativeAbi,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    }),
  ]);

  const parsed = parseRobinhoodTokenUri(tokenUri);
  return {
    chainId,
    rendererAddress,
    commemorativeAddress,
    owner,
    tokenUri,
    ...parsed,
  };
}

export { revokeObjectUrl as revokeRobinhoodPngUrl };
