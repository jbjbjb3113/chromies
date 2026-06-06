// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Chroma} from "../contracts/Chroma.sol";

contract MintAllScript is Script {
    using stdJson for string;

    string internal constant MINT_DATA_PATH = "art-pipeline/output/mint-data.json";
    uint256 internal constant BATCH_SIZE = 50;
    uint256 internal constant LOG_INTERVAL = 250;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address chromaAddr = vm.envAddress("CHROMA_ADDRESS");
        Chroma chroma = Chroma(payable(chromaAddr));

        string memory json = vm.readFile(MINT_DATA_PATH);
        uint256 total = _countRecords(json);

        console2.log("Minting", total, "tokens to", deployer);
        console2.log("Chroma", chromaAddr);

        for (uint256 batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
            uint256 batchEnd = batchStart + BATCH_SIZE;
            if (batchEnd > total) batchEnd = total;

            vm.startBroadcast(deployerPrivateKey);
            for (uint256 i = batchStart; i < batchEnd; ++i) {
                string memory index = vm.toString(i);
                uint256 tokenId = json.readUint(string.concat("$[", index, "].tokenId"));
                bytes memory pixels = json.readBytes(string.concat("$[", index, "].pixelsHex"));
                bytes memory traits = json.readBytes(string.concat("$[", index, "].traitsHex"));
                chroma.mint(deployer, tokenId, pixels, traits);

                uint256 minted = i + 1;
                if (minted % LOG_INTERVAL == 0 || minted == total) {
                    console2.log("Progress", minted, "/", total);
                }
            }
            vm.stopBroadcast();
        }

        console2.log("Done. totalSupply:", chroma.totalSupply());
    }

    function _countRecords(string memory json) internal view returns (uint256 count) {
        while (true) {
            string memory key = string.concat("$[", vm.toString(count), "].tokenId");
            if (!json.keyExists(key)) break;
            ++count;
        }
        if (count == 0) revert("mint-data.json is empty");
    }
}
