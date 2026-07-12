// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";
import {PixelMarketplace} from "../contracts/PixelMarketplace.sol";

/// @notice Redeploy Chroma stack with inscribe bake + lock-only paths.
///         Always deploys fresh ChromaStorage (requires rewritePixels for bake-on-lock).
contract RedeployChromaScript is Script {
    uint96 internal constant ROYALTY_BPS = 500;
    bytes32 internal constant MERKLE_ROOT_ONE =
        0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39;
    bytes32 internal constant MERKLE_ROOT_TWO =
        0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac;

    string internal constant REVEAL_ROOT_PATH = "art-pipeline/output/reveal-merkle-root.txt";

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);
        bytes32 revealRoot = vm.parseBytes32(vm.trim(vm.readFile(REVEAL_ROOT_PATH)));

        vm.startBroadcast(deployerPrivateKey);

        ChromaStorage storageContract = new ChromaStorage(deployer, deployer);
        Chroma chroma = new Chroma(address(storageContract), deployer, deployer, ROYALTY_BPS);
        storageContract.setWriter(address(chroma));

        ChromaCanvasV2 canvas = new ChromaCanvasV2(address(chroma), address(storageContract), deployer);

        PixelMarketplace marketplace = new PixelMarketplace();
        canvas.setOperatorApproval(address(marketplace), true);

        ChromaPaletteData paletteData = new ChromaPaletteData();
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(paletteData), deployer);
        renderer.setCanvas(address(canvas));
        renderer.setChroma(address(chroma));

        chroma.setRenderer(address(renderer));
        chroma.setCanvas(address(canvas));
        chroma.setMerkleRootOne(MERKLE_ROOT_ONE);
        chroma.setMerkleRootTwo(MERKLE_ROOT_TWO);
        chroma.setRevealRoot(revealRoot);

        vm.stopBroadcast();

        console2.log("ChromaStorage:", address(storageContract));
        console2.log("Chroma:", address(chroma));
        console2.log("ChromaCanvasV2:", address(canvas));
        console2.log("ChromaPaletteData:", address(paletteData));
        console2.log("ChromaRenderer:", address(renderer));
        console2.log("PixelMarketplace:", address(marketplace));
        console2.log("RevealRoot:", vm.toString(revealRoot));
    }
}
