// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";

/// @notice Minimal redeploy: fresh ChromaCanvasV2 + ChromaRenderer wired to existing Chroma/Storage.
contract RedeployCanvasAndRendererScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address storageAddress = vm.envAddress("CHROMA_STORAGE_ADDRESS");
        address marketplaceAddress = vm.envAddress("MARKETPLACE_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        Chroma chroma = Chroma(payable(chromaAddress));
        ChromaStorage chromaStorage = ChromaStorage(storageAddress);

        ChromaCanvasV2 canvas = new ChromaCanvasV2(chromaAddress, storageAddress, deployer);
        chromaStorage.setTraitUpdater(address(canvas));
        canvas.setOperatorApproval(marketplaceAddress, true);

        ChromaRenderer renderer = new ChromaRenderer(storageAddress, deployer);
        renderer.setCanvas(address(canvas));
        renderer.setChroma(chromaAddress);

        chroma.setCanvas(address(canvas));
        chroma.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("Chroma:", chromaAddress);
        console2.log("ChromaStorage:", storageAddress);
        console2.log("ChromaCanvasV2:", address(canvas));
        console2.log("ChromaRenderer:", address(renderer));
        console2.log("PixelMarketplace:", marketplaceAddress);
    }
}
