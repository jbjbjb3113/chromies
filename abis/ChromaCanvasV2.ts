export const chromaCanvasV2Abi = [
  {
    type: "function",
    name: "ACTION_POINTS_PER_BURN",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "actionPoints",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "submitCommit",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revealBurnAndApplyDiff",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "burnedTokenId", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "diffData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getBurnCount",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "BurnRevealed",
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "burnedTokenId", type: "uint256" },
      { indexed: true, name: "creditedTokenId", type: "uint256" },
      { indexed: false, name: "actionPointsAwarded", type: "uint256" },
    ],
  },
] as const;

export const ACTION_POINTS_PER_BURN = 100n;
