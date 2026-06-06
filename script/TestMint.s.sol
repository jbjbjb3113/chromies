// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Chroma} from "../contracts/Chroma.sol";

contract TestMint is Script {
    using stdJson for string;

    string internal constant REVEAL_DATA_PATH = "art-pipeline/output/test-reveal.json";
    string internal constant REVEAL_PROOFS_PATH = "art-pipeline/output/reveal-merkle-proofs.json";

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerKey = uint256(bytes32(keyBytes));
        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");

        Chroma chroma = Chroma(payable(chromaAddress));

        vm.startBroadcast(deployerKey);

        chroma.setPhase(Chroma.Phase.Public);
        console2.log("Phase set to Public");

        chroma.mint{value: 0.006 ether}();
        uint256 tokenId = chroma.totalSupply();
        console2.log("Minted token ID:", tokenId);
        console2.log("Owner:", chroma.ownerOf(tokenId));

        string memory uri = chroma.tokenURI(tokenId);
        console2.log("tokenURI (unrevealed):", uri);

        string memory json = vm.readFile(REVEAL_DATA_PATH);
        uint256 revealTokenId = json.readUint(".tokenId");
        require(revealTokenId == tokenId, "test-reveal.json tokenId mismatch");
        bytes memory pixels = json.readBytes(".pixelsHex");
        bytes memory traits = json.readBytes(".traitsHex");

        bytes32[] memory proof = _loadProof(vm.readFile(REVEAL_PROOFS_PATH), tokenId);

        chroma.reveal(tokenId, pixels, traits, proof);
        console2.log("Revealed token ID:", tokenId);
        console2.log("Reveal complete - check tokenURI on Sepolia explorer");

        vm.stopBroadcast();
    }

    function _loadProof(string memory json, uint256 tokenId) internal view returns (bytes32[] memory proof) {
        uint256 len;
        while (true) {
            string memory key =
                string.concat(".proofs.", vm.toString(tokenId), "[", vm.toString(len), "]");
            if (!json.keyExists(key)) break;
            ++len;
        }

        proof = new bytes32[](len);
        for (uint256 i = 0; i < len; ++i) {
            string memory key =
                string.concat(".proofs.", vm.toString(tokenId), "[", vm.toString(i), "]");
            proof[i] = vm.parseBytes32(json.readString(key));
        }
    }
}
