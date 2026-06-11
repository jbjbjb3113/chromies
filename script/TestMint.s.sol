// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvas} from "../contracts/ChromaCanvas.sol";

contract TestMint is Script {
    using stdJson for string;

    string internal constant TEST_REVEAL_PATH = "art-pipeline/output/test-reveal.json";
    string internal constant REVEAL_PROOFS_PATH = "art-pipeline/output/reveal-merkle-proofs.json";
    bytes internal constant DATA_URI_PREFIX = "data:application/json;base64,";

    /// @notice Uses the next two token IDs based on current totalSupply().
    function run() external {
        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        uint256 startTokenId = Chroma(payable(chromaAddress)).totalSupply() + 1;
        _run(startTokenId);
    }

    /// @notice Test reveal on `startTokenId` and inscribe on `startTokenId + 1`.
    function run(uint256 startTokenId) external {
        _run(startTokenId);
    }

    function _run(uint256 revealTokenId) internal {
        require(revealTokenId > 0, "start token ID must be > 0");

        uint256 inscribeTokenId = revealTokenId + 1;

        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerKey = uint256(bytes32(keyBytes));
        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address canvasAddress = vm.envAddress("CANVAS_ADDRESS");

        Chroma chroma = Chroma(payable(chromaAddress));
        ChromaCanvas canvas = ChromaCanvas(canvasAddress);

        require(
            chroma.totalSupply() == revealTokenId - 1,
            "totalSupply mismatch: pass startTokenId = totalSupply() + 1"
        );

        string memory revealJson = vm.readFile(TEST_REVEAL_PATH);
        string memory proofsJson = vm.readFile(REVEAL_PROOFS_PATH);

        bytes memory revealPixels = revealJson.readBytes(".reveal.pixelsHex");
        bytes memory revealTraits = revealJson.readBytes(".reveal.traitsHex");
        bytes32[] memory revealProof = _loadProof(proofsJson, revealTokenId);

        bytes memory inscribePixels = revealJson.readBytes(".inscribe.pixelsHex");
        bytes memory inscribeTraits = revealJson.readBytes(".inscribe.traitsHex");
        bytes32[] memory inscribeProof = _loadProof(proofsJson, inscribeTokenId);

        console2.log("Reveal token ID:", revealTokenId);
        console2.log("Inscribe token ID:", inscribeTokenId);

        vm.startBroadcast(deployerKey);

        chroma.setPhase(Chroma.Phase.Public);
        console2.log("Phase set to Public");

        chroma.mint{value: 0.006 ether}(1);
        require(chroma.totalSupply() == revealTokenId, "reveal mint got unexpected token ID");
        console2.log("Minted token ID:", revealTokenId);
        console2.log("Owner:", chroma.ownerOf(revealTokenId));

        string memory uri = chroma.tokenURI(revealTokenId);
        console2.log("tokenURI (unrevealed):", uri);

        chroma.reveal(revealTokenId, revealPixels, revealTraits, revealProof);
        console2.log("Revealed token ID:", revealTokenId);
        console2.log("Reveal complete - check tokenURI on Sepolia explorer");

        chroma.mint{value: 0.006 ether}(1);
        require(chroma.totalSupply() == inscribeTokenId, "inscribe mint got unexpected token ID");
        console2.log("Minted token ID for inscribe:", inscribeTokenId);

        chroma.inscribe(inscribeTokenId, inscribePixels, inscribeTraits, inscribeProof);
        console2.log("Inscribed token ID:", inscribeTokenId);
        console2.log("isLocked:", chroma.isLocked(inscribeTokenId));

        string memory inscribedUri = chroma.tokenURI(inscribeTokenId);
        console2.log("tokenURI (inscribed):", inscribedUri);

        string memory decodedJson = _decodeDataUri(inscribedUri);
        require(_contains(decodedJson, '"trait_type":"Status"'), "tokenURI missing Status trait");
        require(_contains(decodedJson, '"value":"Inscribed"'), "tokenURI missing Inscribed value");

        vm.expectRevert(ChromaCanvas.TokenLocked.selector);
        canvas.applyDiff(inscribeTokenId, hex"00000f");
        console2.log("applyDiff reverted with TokenLocked as expected");

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
        require(len > 0, "missing merkle proof for token");

        proof = new bytes32[](len);
        for (uint256 i = 0; i < len; ++i) {
            string memory key =
                string.concat(".proofs.", vm.toString(tokenId), "[", vm.toString(i), "]");
            proof[i] = vm.parseBytes32(json.readString(key));
        }
    }

    function _decodeDataUri(string memory uri) internal pure returns (string memory) {
        bytes memory uriBytes = bytes(uri);
        bytes memory prefix = bytes(DATA_URI_PREFIX);
        require(uriBytes.length > prefix.length, "invalid tokenURI");
        bytes memory encoded = new bytes(uriBytes.length - prefix.length);
        for (uint256 i = 0; i < encoded.length; ++i) {
            encoded[i] = uriBytes[prefix.length + i];
        }
        return string(Base64.decode(string(encoded)));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;

        for (uint256 i = 0; i <= h.length - n.length; ++i) {
            bool matchFound = true;
            for (uint256 j = 0; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) return true;
        }
        return false;
    }
}
