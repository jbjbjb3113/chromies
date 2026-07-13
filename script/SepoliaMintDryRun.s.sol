// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Chroma} from "../contracts/Chroma.sol";

/// @notice Task 4 DRY RUN — swap reveal root, mint/reveal/inscribe sample tokens, restore production root.
contract SepoliaMintDryRun is Script {
    using stdJson for string;

    string internal constant MANIFEST_PATH = "chromies-engine/generated/sepolia_mint_dry_run.json";

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerKey);
        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");

        string memory json = vm.readFile(MANIFEST_PATH);
        bytes32 dryRoot = vm.parseBytes32(json.readString(".merkle.root"));
        bytes32 productionRoot = vm.parseBytes32(json.readString(".productionRevealRoot"));
        uint256 count = json.readUint(".tokenCount");

        Chroma chroma = Chroma(payable(chromaAddress));

        vm.startBroadcast(deployerKey);

        chroma.setRevealRoot(dryRoot);
        console2.log("DRY RUN reveal root set:", vm.toString(dryRoot));

        for (uint256 i = 0; i < count; ++i) {
            string memory base = string.concat(".tokens[", vm.toString(i), "]");
            uint256 tokenId = json.readUint(string.concat(base, ".tokenId"));
            bytes memory pixels = json.readBytes(string.concat(base, ".pixelsHex"));
            bytes memory traits = json.readBytes(string.concat(base, ".traitsHex"));
            bytes32[] memory proof = _loadProof(json, tokenId);

            chroma.mint(deployer, tokenId);
            chroma.reveal(tokenId, pixels, traits, proof);
            chroma.inscribe(tokenId, pixels, traits, proof);
            console2.log("DRY RUN inscribed token:", tokenId);
        }

        chroma.setRevealRoot(productionRoot);
        console2.log("Production reveal root restored:", vm.toString(productionRoot));

        vm.stopBroadcast();
    }

    function _loadProof(string memory json, uint256 tokenId) internal view returns (bytes32[] memory proof) {
        uint256 len;
        while (true) {
            string memory key = string.concat(".merkle.proofs.", vm.toString(tokenId), "[", vm.toString(len), "]");
            if (!json.keyExists(key)) break;
            ++len;
        }
        require(len > 0, "missing proof");
        proof = new bytes32[](len);
        for (uint256 i = 0; i < len; ++i) {
            string memory key = string.concat(".merkle.proofs.", vm.toString(tokenId), "[", vm.toString(i), "]");
            proof[i] = vm.parseBytes32(json.readString(key));
        }
    }
}
