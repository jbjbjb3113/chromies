// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";

/// @notice Seeds a specific batch (by index) from reports/robinhood/seed-calldata.json into
/// an already-deployed ChromiesCommemorative testnet contract. Used by the RH testnet smoke
/// test to seed only batches 0-1 (20 of the 100 commemorative payloads) — NOT the full set —
/// to conserve testnet ETH/gas per the smoke-test spec.
///
/// Usage:
///   TOKEN_ADDRESS=0x... BATCH_INDEX=0 forge script \
///     script/robinhood/SeedCommemorativeTestnet.s.sol \
///     --rpc-url robinhood_testnet --broadcast --gas-estimate-multiplier 400
contract SeedCommemorativeTestnetScript is Script {
    string internal constant SEED_CALLDATA_PATH = "reports/robinhood/seed-calldata.json";

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");
        uint256 batchIndex = vm.envUint("BATCH_INDEX");

        ChromiesCommemorative token = ChromiesCommemorative(payable(tokenAddress));

        string memory json = vm.readFile(SEED_CALLDATA_PATH);
        string memory idsKey = string.concat(".batches[", vm.toString(batchIndex), "].ids");
        string memory pixelsKey = string.concat(".batches[", vm.toString(batchIndex), "].pixelsHex");
        string memory traitsKey = string.concat(".batches[", vm.toString(batchIndex), "].traitsHex");

        uint256[] memory ids = vm.parseJsonUintArray(json, idsKey);
        bytes[] memory pixelsHex = vm.parseJsonBytesArray(json, pixelsKey);
        bytes[] memory traitsHex = vm.parseJsonBytesArray(json, traitsKey);

        console2.log("Seeding batch", batchIndex, "into", tokenAddress);
        console2.log("Token count in batch:", ids.length);

        vm.startBroadcast(deployerPrivateKey);
        token.seedPayloads(ids, pixelsHex, traitsHex);
        vm.stopBroadcast();

        console2.log("Batch", batchIndex, "seeded successfully.");
    }
}
