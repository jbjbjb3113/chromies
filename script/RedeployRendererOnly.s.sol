// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";

/// @notice Renderer-only redeploy: new ChromaRenderer wired to EXISTING storage + paletteData.
/// @dev Does not touch ChromaPaletteData, ChromaStorage, Canvas, Marketplace, or merkle roots.
contract RedeployRendererOnlyScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address storageAddress = vm.envAddress("CHROMA_STORAGE_ADDRESS");
        address paletteDataAddress = vm.envAddress("CHROMA_PALETTE_DATA_ADDRESS");
        address canvasAddress = vm.envAddress("CHROMA_CANVAS_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ChromaRenderer renderer = new ChromaRenderer(storageAddress, paletteDataAddress, deployer);
        renderer.setCanvas(canvasAddress);
        renderer.setChroma(chromaAddress);

        Chroma chroma = Chroma(payable(chromaAddress));
        chroma.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("ChromaRenderer:", address(renderer));
        console2.log("ChromaPaletteData (unchanged):", paletteDataAddress);
        console2.log("ChromaStorage (unchanged):", storageAddress);
        console2.log("Chroma:", chromaAddress);
        console2.log("ChromaCanvasV2:", canvasAddress);
    }
}
