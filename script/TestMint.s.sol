// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Chroma} from "../contracts/Chroma.sol";

contract TestMint is Script {
    using stdJson for string;

    string internal constant REVEAL_DATA_PATH = "art-pipeline/output/test-reveal.json";

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerKey = uint256(bytes32(keyBytes));
        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");

        Chroma chroma = Chroma(payable(chromaAddress));

        vm.startBroadcast(deployerKey);

        // 1. Set phase to Public (3)
        chroma.setPhase(Chroma.Phase.Public);
        console2.log("Phase set to Public");

        // 2. Mint one token
        chroma.mint{value: 0.006 ether}();
        uint256 tokenId = chroma.totalSupply();
        console2.log("Minted token ID:", tokenId);
        console2.log("Owner:", chroma.ownerOf(tokenId));

        // 3. Log tokenURI (unrevealed)
        string memory uri = chroma.tokenURI(tokenId);
        console2.log("tokenURI (unrevealed):", uri);

        // 4. Reveal the token from single-token pipeline data (avoids OOG on full mint-data.json)
        string memory json = vm.readFile(REVEAL_DATA_PATH);
        uint256 revealTokenId = json.readUint(".tokenId");
        require(revealTokenId == tokenId, "test-reveal.json tokenId mismatch");
        bytes memory pixels = json.readBytes(".pixelsHex");
        bytes memory traits = json.readBytes(".traitsHex");

        uint256[] memory tokenIds = new uint256[](1);
        bytes[] memory pixelsArr = new bytes[](1);
        bytes[] memory traitsArr = new bytes[](1);
        tokenIds[0] = tokenId;
        pixelsArr[0] = pixels;
        traitsArr[0] = traits;

        chroma.reveal(tokenIds, pixelsArr, traitsArr);
        console2.log("Revealed token ID:", tokenId);
        console2.log("Reveal complete - check tokenURI on Sepolia explorer");

        vm.stopBroadcast();
    }
}
