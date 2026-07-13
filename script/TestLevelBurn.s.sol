// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";

/// @notice Reveal token #9 (if needed) and burn into #1 to verify totalApEarned + getLevel().
contract TestLevelBurn is Script {
    using stdJson for string;

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerKey);

        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address canvasAddress = vm.envAddress("CANVAS_ADDRESS");

        Chroma chroma = Chroma(payable(chromaAddress));
        ChromaCanvasV2 canvas = ChromaCanvasV2(canvasAddress);

        uint256 receiverId = 1;
        uint256 burnId = 9;

        vm.startBroadcast(deployerKey);

        if (!chroma.revealed(burnId)) {
            string memory revealJson = vm.readFile("art-pipeline/output/mint-data.json");
            string memory proofsJson = vm.readFile("art-pipeline/output/reveal-merkle-proofs.json");
            bytes memory pixels = _readBytes(revealJson, burnId, "pixelsHex");
            bytes memory traits = _readBytes(revealJson, burnId, "traitsHex");
            bytes32[] memory proof = _loadProof(proofsJson, burnId);
            chroma.reveal(burnId, pixels, traits, proof);
            console2.log("Revealed token #9");
        }

        if (!chroma.isApprovedForAll(deployer, canvasAddress)) {
            chroma.setApprovalForAll(canvasAddress, true);
        }

        uint256 burnAp = canvas.calculateBurnAP(burnId);
        console2.log("calculateBurnAP(#9):", burnAp);

        bytes32 salt = keccak256(abi.encodePacked("level-burn-test", block.timestamp));
        bytes memory diffData = "";
        bytes32 commitment = keccak256(abi.encode(deployer, receiverId, burnId, diffData, salt));

        canvas.submitCommit(commitment);
        canvas.revealBurnAndApplyDiff(receiverId, burnId, salt, diffData);
        console2.log("Burned #9 into #1");

        uint256 earned = canvas.totalApEarned(receiverId);
        uint256 ap = canvas.actionPoints(receiverId);
        uint256 level = canvas.getLevel(receiverId);

        console2.log("totalApEarned(#1):", earned);
        console2.log("actionPoints(#1):", ap);
        console2.log("getLevel(#1):", level);

        vm.stopBroadcast();
    }

    function _readBytes(string memory json, uint256 tokenId, string memory field) internal view returns (bytes memory) {
        string memory key = string.concat("[", _indexOf(json, tokenId), "].", field);
        return vm.parseBytes(json.readString(key));
    }

    function _indexOf(string memory json, uint256 tokenId) internal pure returns (string memory) {
        // mint-data.json is ordered by tokenId starting at 1 -> index tokenId-1
        return vm.toString(tokenId - 1);
    }

    function _loadProof(string memory json, uint256 tokenId) internal view returns (bytes32[] memory proof) {
        uint256 len;
        while (true) {
            string memory key = string.concat(".proofs.", vm.toString(tokenId), "[", vm.toString(len), "]");
            if (!json.keyExists(key)) break;
            ++len;
        }
        require(len > 0, "missing merkle proof");

        proof = new bytes32[](len);
        for (uint256 i = 0; i < len; ++i) {
            string memory key = string.concat(".proofs.", vm.toString(tokenId), "[", vm.toString(i), "]");
            proof[i] = vm.parseBytes32(json.readString(key));
        }
    }
}
