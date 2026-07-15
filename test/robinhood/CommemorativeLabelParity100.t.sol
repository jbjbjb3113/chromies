// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaRendererRobinhood} from "../../contracts/robinhood/ChromaRendererRobinhood.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";

/// @notice Seeds all 100 commemorative payloads and exports ChromaRendererRobinhood
/// tokenURIs for offline Python verification (label parity + PNG byte identity).
contract CommemorativeLabelParity100Test is Test {
    ChromiesCommemorative internal token;
    ChromaRendererRobinhood internal renderer;
    ChromaPaletteData internal paletteData;
    address internal owner = address(this);

    string internal constant SEED_CALLDATA_PATH = "reports/robinhood/seed-calldata.json";
    string internal constant OUT_DIR = "reports/robinhood/label-parity-100";

    function setUp() public {
        token = new ChromiesCommemorative(owner);
        paletteData = new ChromaPaletteData();
        renderer = new ChromaRendererRobinhood(address(token), address(paletteData), owner);
        token.setRenderer(address(renderer));
        _seedAllBatches();
    }

    function _seedAllBatches() internal {
        string memory json = vm.readFile(SEED_CALLDATA_PATH);
        uint256 batchCount = vm.parseJsonUint(json, ".batchCount");
        for (uint256 i = 0; i < batchCount; ++i) {
            string memory idsKey = string.concat(".batches[", vm.toString(i), "].ids");
            string memory pixelsKey = string.concat(".batches[", vm.toString(i), "].pixelsHex");
            string memory traitsKey = string.concat(".batches[", vm.toString(i), "].traitsHex");
            uint256[] memory ids = vm.parseJsonUintArray(json, idsKey);
            bytes[] memory pixelsHex = vm.parseJsonBytesArray(json, pixelsKey);
            bytes[] memory traitsHex = vm.parseJsonBytesArray(json, traitsKey);
            token.seedPayloads(ids, pixelsHex, traitsHex);
        }
    }

    /// @dev Direct renderer reads (no ownership gate) — same path used pre-mint-open.
    function test_exportTokenUris_forPythonVerification() public {
        for (uint256 tokenId = 1; tokenId <= 100; ++tokenId) {
            string memory uri = renderer.tokenURI(tokenId);
            vm.writeFile(string.concat(OUT_DIR, "/uri-", vm.toString(tokenId), ".txt"), uri);
        }
    }
}
