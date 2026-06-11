// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";
import {PixelMarketplace} from "../contracts/PixelMarketplace.sol";

/// @notice Full AP marketplace flow on Sepolia:
///         mint 4 -> reveal #1 -> burn #2/#3/#4 into #1 (300 AP) -> list 100 AP.
///
///         NOTE: public mint is capped at 3 per wallet, so tokens 1-3 are
///         public mints (0.006 ETH each) and token 4 is an owner mint
///         (deployer is contract owner; placeholder data, no payment).
contract TestBurnAndList is Script {
    using stdJson for string;

    string internal constant TEST_REVEAL_PATH = "art-pipeline/output/test-reveal.json";
    string internal constant REVEAL_PROOFS_PATH = "art-pipeline/output/reveal-merkle-proofs.json";

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerKey);

        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address canvasAddress = vm.envAddress("CANVAS_ADDRESS");
        address marketplaceAddress = vm.envAddress("MARKETPLACE_ADDRESS");

        Chroma chroma = Chroma(payable(chromaAddress));
        ChromaCanvasV2 canvas = ChromaCanvasV2(canvasAddress);
        PixelMarketplace marketplace = PixelMarketplace(marketplaceAddress);

        require(chroma.totalSupply() == 0, "expected fresh deployment (totalSupply 0, token IDs 1-4)");

        string memory revealJson = vm.readFile(TEST_REVEAL_PATH);
        string memory proofsJson = vm.readFile(REVEAL_PROOFS_PATH);
        bytes memory revealPixels = revealJson.readBytes(".reveal.pixelsHex");
        bytes memory revealTraits = revealJson.readBytes(".reveal.traitsHex");
        bytes32[] memory revealProof = _loadProof(proofsJson, 1);

        vm.startBroadcast(deployerKey);

        chroma.setPhase(Chroma.Phase.Public);
        console2.log("Phase set to Public");

        for (uint256 i = 1; i <= 3; ++i) {
            chroma.mint{value: 0.006 ether}();
            console2.log("Minted token ID (public):", i);
        }

        // Public mint caps at 3/wallet -- token 4 via owner mint (placeholder data)
        chroma.mint(deployer, 4, new bytes(2048), new bytes(32));
        console2.log("Minted token ID (owner):", uint256(4));
        require(chroma.totalSupply() == 4, "expected 4 tokens minted");

        chroma.reveal(1, revealPixels, revealTraits, revealProof);
        console2.log("Revealed token ID: 1");

        // Canvas pulls burned tokens to DEAD via transferFrom
        chroma.setApprovalForAll(canvasAddress, true);

        for (uint256 burnedId = 2; burnedId <= 4; ++burnedId) {
            bytes32 salt = keccak256(abi.encodePacked("burn-and-list", burnedId));
            bytes memory diffData = "";
            bytes32 commitment = keccak256(abi.encode(deployer, uint256(1), burnedId, diffData, salt));

            canvas.submitCommit(commitment);
            canvas.revealBurnAndApplyDiff(1, burnedId, salt, diffData);
            console2.log("Burned token into #1:", burnedId);
        }

        console2.log("Token 1 AP balance:", canvas.actionPoints(1));
        console2.log("Token 1 level:", canvas.level(1));

        uint256 listingId = marketplace.list(canvasAddress, 1, 100, 0.001 ether);
        console2.log("Listing ID:", listingId);
        console2.log("Listed 100 AP from token 1 for 0.001 ETH");

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
}
