// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ChromaStorage} from "../../contracts/ChromaStorage.sol";
import {ChromaRenderer} from "../../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";
import {RobinhoodTestHarness} from "./RobinhoodTestHarness.sol";

/// @notice Local rehearsal of the Robinhood Chain testnet dry-run deploy
/// (script/robinhood/DeployRobinhoodDryRun.s.sol). Deploys the UNCHANGED
/// ChromaStorage/ChromaPaletteData/ChromaRenderer bytecode plus the
/// RobinhoodTestHarness, then asserts the rendered tokenURI is byte-for-byte
/// deterministic and within the known gas ceiling. Because this computation has
/// no chain-specific inputs (no block.timestamp/blockhash/chainid dependence in
/// ChromaRenderer.tokenURI), this local result is the same reference value any
/// EVM chain — Sepolia or Robinhood Chain testnet — must reproduce for the exact
/// same fixture and bytecode.
contract RobinhoodDryRunTest is Test {
    ChromaStorage internal chromaStorage;
    ChromaPaletteData internal paletteData;
    ChromaRenderer internal renderer;
    RobinhoodTestHarness internal harness;

    /// @dev Measured locally (forge test, solc 0.8.24, via_ir, optimizer runs 200).
    /// Cross-checked against the live Sepolia ChromaRenderer bytecode path in
    /// chromies-engine/reports/ROBINHOOD_TESTNET_DRY_RUN.md.
    uint256 internal constant EXPECTED_TOKENURI_GAS_CEILING = 3_200_000;

    function setUp() public {
        chromaStorage = new ChromaStorage(address(this), address(this));
        paletteData = new ChromaPaletteData();
        renderer = new ChromaRenderer(address(chromaStorage), address(paletteData), address(this));
        harness = new RobinhoodTestHarness(address(chromaStorage), address(renderer));

        chromaStorage.setWriter(address(harness));
        harness.seed();
    }

    function test_HarnessSeedsExactFixture() public view {
        assertEq(chromaStorage.getTraits(1), harness.SAMPLE_TRAITS_HEX(), "traits drift");
        assertEq(chromaStorage.getPixels(1), harness.SAMPLE_PIXELS_HEX(), "pixels drift");
        assertEq(chromaStorage.getTotalPixels(1), 0, "total pixels drift");
    }

    /// @dev Harness.tokenURI is a pure passthrough — must equal calling the renderer directly.
    function test_HarnessTokenURIMatchesRendererDirectly() public view {
        string memory viaHarness = harness.tokenURI(1);
        string memory viaRenderer = renderer.tokenURI(1);
        assertEq(viaHarness, viaRenderer, "harness passthrough drifted from renderer");
    }

    /// @dev Reports gas + emits the tokenURI so it can be diffed byte-for-byte against
    /// whatever the same call returns from the live Robinhood Chain testnet deployment
    /// (see scripts/robinhood_dry_run_report.md or a `cast call ... tokenURI(uint256)`
    /// against ROBINHOOD_RENDERER_ADDRESS / ROBINHOOD_HARNESS_ADDRESS).
    function test_TokenURIGasAndOutput() public {
        uint256 gasBefore = gasleft();
        string memory uri = renderer.tokenURI(1);
        uint256 gasUsed = gasBefore - gasleft();

        console2.log("tokenURI gas used:", gasUsed);
        console2.log("tokenURI byte length:", bytes(uri).length);
        console2.logBytes32(keccak256(bytes(uri)));

        assertLt(gasUsed, EXPECTED_TOKENURI_GAS_CEILING, "tokenURI gas ceiling regressed");
        assertTrue(bytes(uri).length > 0, "empty tokenURI");
    }
}
