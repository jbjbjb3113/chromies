export const chromaAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "chromaStorage",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "renderer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
    ],
  },
] as const;

export const chromaStorageAbi = [
  {
    type: "function",
    name: "getPixels",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "getTraits",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

export const chromaRendererAbi = [
  {
    type: "function",
    name: "renderSVG",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "setCanvas",
    stateMutability: "nonpayable",
    inputs: [{ name: "canvasAddress", type: "address" }],
    outputs: [],
  },
] as const;

export const chromaCanvasAbi = [
  {
    type: "function",
    name: "getDiff",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "pixelIndexes", type: "uint16[]" },
      { name: "newColorIndexes", type: "uint8[]" },
    ],
  },
  {
    type: "function",
    name: "getCanvasInfo",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [
      { name: "points", type: "uint256" },
      { name: "diffCount", type: "uint256" },
      { name: "customized", type: "bool" },
      { name: "hasPendingCommit", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "CommitSubmitted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "commitment", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "BurnRevealed",
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "burnedTokenId", type: "uint256" },
      { indexed: false, name: "actionPointsAwarded", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "DiffApplied",
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: false, name: "entriesApplied", type: "uint256" },
    ],
  },
] as const;
