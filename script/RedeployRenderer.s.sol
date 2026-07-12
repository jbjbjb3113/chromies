// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";

/// @notice Redeploy ChromaRenderer + ChromaPaletteData (split stack) and wire Chroma.
/// @dev Prefer script/RedeployPaletteStack.s.sol for full migration runbook + Etherscan steps.
contract RedeployRendererScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address storageAddress = vm.envAddress("CHROMA_STORAGE_ADDRESS");
        address canvasAddress = vm.envAddress("CHROMA_CANVAS_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ChromaPaletteData paletteData = new ChromaPaletteData();
        ChromaRenderer renderer = new ChromaRenderer(storageAddress, address(paletteData), deployer);
        renderer.setCanvas(canvasAddress);
        renderer.setChroma(chromaAddress);

        Chroma chroma = Chroma(payable(chromaAddress));
        chroma.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("ChromaPaletteData:", address(paletteData));
        console2.log("ChromaRenderer:", address(renderer));
        console2.log("Chroma:", chromaAddress);
        console2.log("ChromaStorage:", storageAddress);
        console2.log("ChromaCanvasV2:", canvasAddress);
    }
}
