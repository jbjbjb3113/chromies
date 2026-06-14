// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";

/// @notice Redeploy ChromaRenderer only and point the live Chroma contract at it.
contract RedeployRendererScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address storageAddress = vm.envAddress("CHROMA_STORAGE_ADDRESS");
        address canvasAddress = vm.envAddress("CHROMA_CANVAS_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ChromaRenderer renderer = new ChromaRenderer(storageAddress, deployer);
        renderer.setCanvas(canvasAddress);
        renderer.setChroma(chromaAddress);

        Chroma chroma = Chroma(payable(chromaAddress));
        chroma.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("ChromaRenderer:", address(renderer));
        console2.log("Chroma:", chromaAddress);
        console2.log("ChromaStorage:", storageAddress);
        console2.log("ChromaCanvasV2:", canvasAddress);
    }
}
