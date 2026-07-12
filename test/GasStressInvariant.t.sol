// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";

/// @notice Task 3 — hostile/limit + rollover compensating measure (measurement only).
contract GasStressInvariantTest is Test {
    Chroma internal chroma;
    ChromaStorage internal storageContract;

    uint256 internal constant BLOCK_GAS_LIMIT = 30_000_000;
    uint256 internal constant FRONTEND_MAX_BATCH = 5;

    address internal user = address(0xCAFE);

    function setUp() public {
        storageContract = new ChromaStorage(address(this), address(this));
        chroma = new Chroma(address(storageContract), address(this), address(this), 500);
        storageContract.setWriter(address(chroma));
        chroma.setMerkleRootOne(_leaf(user));
        chroma.setMerkleRootTwo(_leaf(user));
        vm.deal(user, 100 ether);
    }

    function test_GasStress_WriteLimitProfile() public {
        _measureBatchMintLimits();
        _measureRevealBlockHeadroom();
    }

    function _measureBatchMintLimits() internal {
        chroma.setPhase(Chroma.Phase.Public);
        vm.deal(user, 10 ether);
        vm.prank(user);
        uint256 gasBefore = gasleft();
        chroma.mint{value: 0.0045 ether * FRONTEND_MAX_BATCH}(FRONTEND_MAX_BATCH);
        uint256 gasUsed = gasBefore - gasleft();

        uint256 maxSafeBatch = BLOCK_GAS_LIMIT / gasUsed;
        assertGt(maxSafeBatch, FRONTEND_MAX_BATCH, "frontend batch exceeds safe block fraction");
        assertLt(gasUsed, BLOCK_GAS_LIMIT, "single max wallet mint exceeds block limit");

        _writeLimit("batch_mint_qty5_gas", gasUsed);
        _writeLimit("batch_mint_max_safe_in_block", maxSafeBatch);
        _writeLimit("frontend_batch_limit", FRONTEND_MAX_BATCH);
    }

    function _measureRevealBlockHeadroom() internal {
        Chroma revealChroma = _freshChroma();
        bytes32 root = keccak256("reveal-root");
        revealChroma.setRevealRoot(root);
        revealChroma.setPhase(Chroma.Phase.Public);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = new bytes(32);
        bytes32[] memory proof = new bytes32[](0);

        uint256 gasPerReveal;
        for (uint256 i = 0; i < 5; ++i) {
            vm.deal(user, 10 ether);
            vm.prank(user);
            revealChroma.mint{value: 0.0045 ether}(1);
            revealChroma.setRevealRoot(_leafReveal(i + 1, pixels, traits));
            vm.prank(user);
            uint256 gasBefore = gasleft();
            revealChroma.reveal(i + 1, pixels, traits, proof);
            gasPerReveal += gasBefore - gasleft();
        }
        gasPerReveal /= 5;
        uint256 maxSequentialInBlock = BLOCK_GAS_LIMIT / gasPerReveal;
        _writeLimit("reveal_single_tx_gas_avg5", gasPerReveal);
        _writeLimit("reveal_max_sequential_in_block", maxSequentialInBlock);
    }

    function _freshChroma() internal returns (Chroma fresh) {
        ChromaStorage s = new ChromaStorage(address(this), address(this));
        fresh = new Chroma(address(s), address(this), address(this), 500);
        s.setWriter(address(fresh));
        fresh.setMerkleRootOne(_leaf(user));
        fresh.setMerkleRootTwo(_leaf(user));
    }

    /// @dev Compensating measure for lost external review — rollover supply accounting.
    function testFuzz_RolloverSupplyAccounting(
        uint8 mintOne,
        uint8 mintTwo,
        uint8 mintPublic
    ) public {
        mintOne = uint8(bound(mintOne, 0, 5));
        mintTwo = uint8(bound(mintTwo, 0, 5));
        mintPublic = uint8(bound(mintPublic, 0, 5));

        bytes32[] memory proof = new bytes32[](0);
        chroma.setPhase(Chroma.Phase.AllowlistOne);
        if (mintOne > 0) {
            vm.prank(user);
            chroma.mint{value: 0.0025 ether * mintOne}(proof, mintOne);
        }
        assertEq(chroma.mintedAllowlistOne(), mintOne);
        assertEq(chroma.totalSupply(), mintOne);

        chroma.setPhase(Chroma.Phase.AllowlistTwo);
        if (mintTwo > 0) {
            vm.prank(user);
            chroma.mint{value: 0.0035 ether * mintTwo}(proof, mintTwo);
        }
        assertEq(chroma.mintedAllowlistTwo(), mintTwo);
        assertEq(chroma.totalSupply(), uint256(mintOne) + mintTwo);

        chroma.setPhase(Chroma.Phase.Public);
        if (mintPublic > 0) {
            vm.prank(user);
            chroma.mint{value: 0.0045 ether * mintPublic}(mintPublic);
        }
        assertEq(chroma.claimedPublic(user), mintPublic);
        assertEq(chroma.totalSupply(), uint256(mintOne) + mintTwo + mintPublic);

        // Unsold allowlist allocation must not reduce public availability (implicit rollover).
        uint256 communityCap = chroma.MAX_SUPPLY() - chroma.TEAM_RESERVE();
        assertLe(chroma.totalSupply(), communityCap);
    }

    function _writeLimit(string memory key, uint256 value) internal {
        console2.log(string.concat("GAS_STRESS_LIMIT ", key, " ", vm.toString(value)));
    }

    function _leaf(address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(account));
    }

    function _leafReveal(uint256 tokenId, bytes memory pixels, bytes memory traits) internal pure returns (bytes32) {
        return keccak256(abi.encode(tokenId, pixels, traits));
    }
}
