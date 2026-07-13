import { encodeAbiParameters, keccak256 } from "viem";

const account = "0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a" as const;
const salt = "0x44add3625f044a4fa7e174ce2a4ced92dbc542b2a779f07fa1061fe06706ea7b" as const;
const receiverId = 1n;
const burnId = 9n;
const diffData = "0x" as const;

const commitment = keccak256(
  encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes" },
      { type: "bytes32" },
    ],
    [account, receiverId, burnId, diffData, salt],
  ),
);

console.log("inputs:");
console.log("  user:", account);
console.log("  receiver:", receiverId.toString());
console.log("  burn:", burnId.toString());
console.log("  diffData:", diffData);
console.log("  salt:", salt);
console.log("recomputed commitment:", commitment);
