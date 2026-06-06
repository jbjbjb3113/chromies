// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvas} from "../contracts/ChromaCanvas.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";

contract DeployScript is Script {
    uint96 internal constant ROYALTY_BPS = 500;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        ChromaStorage storageContract = new ChromaStorage(deployer, address(0));
        console2.log("ChromaStorage", address(storageContract));

        Chroma chroma = new Chroma(address(storageContract), deployer, deployer, ROYALTY_BPS);
        console2.log("Chroma", address(chroma));

        storageContract.setWriter(address(chroma));

        ChromaCanvas canvas = new ChromaCanvas(address(chroma), address(storageContract), deployer);
        console2.log("ChromaCanvas", address(canvas));

        storageContract.setTraitUpdater(address(canvas));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), deployer);
        console2.log("ChromaRenderer", address(renderer));

        renderer.setCanvas(address(canvas));
        chroma.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("Deployer", deployer);
        console2.log("Royalty receiver", deployer);
        console2.log("Royalty fee (bps)", ROYALTY_BPS);
    }
}
