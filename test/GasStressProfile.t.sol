// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";
import {PixelMarketplace} from "../contracts/PixelMarketplace.sol";
import {TraitFixtures, WriterCaller} from "./Chroma.t.sol";
import {ChromaTestHelpers} from "./ChromaTestHelpers.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";

/// @notice Task 1 — transaction gas profile (measurement only).
contract GasStressProfileTest is Test, ChromaTestHelpers {
    using stdJson for string;

    Chroma internal chroma;
    ChromaStorage internal storageContract;
    ChromaCanvasV2 internal canvas;
    ChromaRenderer internal renderer;
    PixelMarketplace internal marketplace;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    string internal merkleJson;

    function setUp() public {
        string memory root = vm.projectRoot();
        merkleJson = vm.readFile(string.concat(root, "/chromies-engine/generated/gas_stress_merkle.json"));

        storageContract = new ChromaStorage(address(this), address(this));
        chroma = new Chroma(address(storageContract), address(this), address(this), 500);
        storageContract.setWriter(address(chroma));
        canvas = new ChromaCanvasV2(address(chroma), address(storageContract), address(this));
        chroma.setCanvas(address(canvas));
        marketplace = new PixelMarketplace();
        canvas.setOperatorApproval(address(marketplace), true);
    }

    function _ensureRenderer() internal {
        if (address(renderer) == address(0)) {
            (renderer,) = ChromaFixtures.deployRenderer(storageContract, address(this));
            chroma.setRenderer(address(renderer));
        }
    }

    function test_GasStress_WriteTransactionProfile() public {
        _profileMint();
        _profileReveal();
        _profileInscribe();
        _profileBurnAndCanvas();
        _profileMarketplace();
        _profileDeploymentSizes();
    }

    function _profileMint() internal {
        _setAllowlistMint(
            "mint_tier1_qty1_cold",
            Chroma.Phase.AllowlistOne,
            true,
            merkleJson.readString(".allowlist_tier1_production.root"),
            merkleJson.readAddress(".allowlist_tier1_production.wallet"),
            merkleJson.readBytes32Array(".allowlist_tier1_production.proof"),
            0.0025 ether,
            1
        );
        _setAllowlistMint(
            "mint_tier1_qty5_cold",
            Chroma.Phase.AllowlistOne,
            true,
            merkleJson.readString(".allowlist_tier1_production.root"),
            merkleJson.readAddress(".allowlist_tier1_production.wallet"),
            merkleJson.readBytes32Array(".allowlist_tier1_production.proof"),
            0.0025 ether * 5,
            5
        );
        _setAllowlistMint(
            "mint_tier1_qty1_warm",
            Chroma.Phase.AllowlistOne,
            false,
            merkleJson.readString(".allowlist_tier1_production.root"),
            merkleJson.readAddress(".allowlist_tier1_production.wallet"),
            merkleJson.readBytes32Array(".allowlist_tier1_production.proof"),
            0.0025 ether,
            1
        );

        _setAllowlistMint(
            "mint_tier2_prod_qty1",
            Chroma.Phase.AllowlistTwo,
            true,
            merkleJson.readString(".allowlist_tier2_production.root"),
            merkleJson.readAddress(".allowlist_tier2_production.wallet"),
            merkleJson.readBytes32Array(".allowlist_tier2_production.proof"),
            0.0035 ether,
            1
        );
        _setAllowlistMint(
            "mint_tier2_stress6946_qty1",
            Chroma.Phase.AllowlistTwo,
            true,
            merkleJson.readString(".allowlist_tier2_stress_6946.root"),
            merkleJson.readAddress(".allowlist_tier2_stress_6946.wallet"),
            merkleJson.readBytes32Array(".allowlist_tier2_stress_6946.proof"),
            0.0035 ether,
            1
        );
        _setAllowlistMint(
            "mint_tier2_stress6946_qty5",
            Chroma.Phase.AllowlistTwo,
            true,
            merkleJson.readString(".allowlist_tier2_stress_6946.root"),
            merkleJson.readAddress(".allowlist_tier2_stress_6946.wallet"),
            merkleJson.readBytes32Array(".allowlist_tier2_stress_6946.proof"),
            0.0035 ether * 5,
            5
        );

        chroma.setPhase(Chroma.Phase.Public);
        vm.deal(alice, 20 ether);
        vm.prank(alice);
        _recordGas("mint_public_qty1_cold", _gasPublicMint(1, 0.0045 ether));

        Chroma pub5 = _freshChroma();
        pub5.setPhase(Chroma.Phase.Public);
        vm.deal(alice, 20 ether);
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        pub5.mint{value: 0.0045 ether * 5}(5);
        _recordGas("mint_public_qty5", gasBefore - gasleft());

        Chroma pubWarm = _freshChroma();
        pubWarm.setPhase(Chroma.Phase.Public);
        vm.deal(alice, 20 ether);
        vm.prank(alice);
        pubWarm.mint{value: 0.0045 ether}(1);
        vm.prank(alice);
        gasBefore = gasleft();
        pubWarm.mint{value: 0.0045 ether}(1);
        _recordGas("mint_public_qty1_warm", gasBefore - gasleft());

        Chroma fresh = _freshChroma();
        fresh.setMerkleRootOne(_leaf(alice));
        fresh.setPhase(Chroma.Phase.AllowlistOne);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        fresh.mint{value: 0.0025 ether * 5}(_emptyProof(), 5);
        fresh.setPhase(Chroma.Phase.Public);
        vm.prank(alice);
        gasBefore = gasleft();
        fresh.mint{value: 0.0045 ether * 5}(5);
        _recordGas("mint_public_qty5_after_allowlist_rollover", gasBefore - gasleft());
    }

    function _profileReveal() internal {
        (Chroma c,) = _freshChromaFull();
        bytes32 root = vm.parseBytes32(merkleJson.readString(".reveal_production.root"));
        c.setRevealRoot(root);
        c.setPhase(Chroma.Phase.Public);
        vm.deal(alice, 20 ether);

        uint256 tid = 1;
        vm.prank(alice);
        c.mint{value: 0.0045 ether}(1);
        bytes memory pixels = _mintPixels(tid);
        bytes memory traits = _mintTraits(tid);
        bytes32[] memory proof = _revealProof(tid);

        vm.prank(alice);
        uint256 gasBefore = gasleft();
        c.reveal(tid, pixels, traits, proof);
        _recordGas("reveal_production_depth_single", gasBefore - gasleft());

        uint256 batchGas;
        for (uint256 t = 2; t <= 5; ++t) {
            vm.prank(alice);
            c.mint{value: 0.0045 ether}(1);
            pixels = _mintPixels(t);
            traits = _mintTraits(t);
            proof = _revealProof(t);
            vm.prank(alice);
            gasBefore = gasleft();
            c.reveal(t, pixels, traits, proof);
            batchGas += gasBefore - gasleft();
        }
        _recordGas("reveal_production_depth_batch5_total", batchGas);
        _recordGas("reveal_production_depth_batch5_per_tx", batchGas / 4);
    }

    function _profileInscribe() internal {
        (Chroma c,) = _freshChromaFull();
        bytes32 root = vm.parseBytes32(merkleJson.readString(".reveal_production.root"));
        c.setRevealRoot(root);
        c.setPhase(Chroma.Phase.Public);
        vm.deal(alice, 20 ether);

        uint256[5] memory sampleIds = [uint256(1), 2, 3, 4, 5];
        uint256 sum;
        uint256 minGas = type(uint256).max;
        uint256 maxGas;

        for (uint256 i = 0; i < 5; ++i) {
            uint256 tid = sampleIds[i];
            vm.prank(alice);
            c.mint{value: 0.0045 ether}(1);
            bytes memory pixels = _mintPixels(tid);
            bytes memory traits = _mintTraits(tid);
            bytes32[] memory proof = _revealProof(tid);
            vm.prank(alice);
            c.reveal(tid, pixels, traits, proof);
            vm.prank(alice);
            uint256 gasBefore = gasleft();
            c.inscribe(tid, pixels, traits, proof);
            uint256 used = gasBefore - gasleft();
            sum += used;
            if (used < minGas) minGas = used;
            if (used > maxGas) maxGas = used;
        }
        _recordGas("inscribe_min", minGas);
        _recordGas("inscribe_max", maxGas);
        _recordGas("inscribe_mean_5_samples", sum / 5);
    }

    function _profileBurnAndCanvas() internal {
        _ensureRenderer();
        (Chroma c, ChromaCanvasV2 cv) = _freshChromaFull();
        c.setRenderer(address(renderer));
        cv.setOperatorApproval(address(marketplace), true);
        vm.prank(alice);
        c.setApprovalForAll(address(cv), true);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(800);
        c.mint(alice, 1);
        c.mint(bob, 2);
        revealToken(c, alice, 1, pixels, traits);
        revealToken(c, bob, 2, pixels, traits);

        cv.earnAP(1, 500);
        bytes memory diff = _singlePixelDiff(100, 3);

        vm.prank(alice);
        uint256 gasBefore = gasleft();
        cv.applyDiff(1, diff);
        _recordGas("canvas_applyDiff_single_pixel", gasBefore - gasleft());

        vm.prank(alice);
        gasBefore = gasleft();
        cv.transferAP(1, 2, 50);
        _recordGas("canvas_transferAP", gasBefore - gasleft());

        c.mint(alice, 3);
        c.mint(alice, 4);
        revealToken(c, alice, 3, pixels, traits);
        revealToken(c, alice, 4, pixels, traits);
        bytes memory emptyDiff = bytes("");
        bytes32 salt = keccak256(abi.encodePacked("burn", uint256(3), uint256(4), emptyDiff));
        bytes32 commitment = keccak256(abi.encode(alice, uint256(3), uint256(4), emptyDiff, salt));
        vm.prank(alice);
        cv.submitCommit(commitment);
        vm.prank(alice);
        gasBefore = gasleft();
        cv.revealBurnAndApplyDiff(3, 4, salt, emptyDiff);
        _recordGas("canvas_revealBurnAndApplyDiff", gasBefore - gasleft());
    }

    function _profileMarketplace() internal {
        _ensureRenderer();
        (Chroma c, ChromaCanvasV2 cv) = _freshChromaFull();
        c.setRenderer(address(renderer));
        cv.setOperatorApproval(address(marketplace), true);
        vm.prank(alice);
        c.setApprovalForAll(address(cv), true);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(400);
        c.mint(alice, 1);
        revealToken(c, alice, 1, pixels, traits);
        cv.earnAP(1, 300);

        vm.prank(alice);
        uint256 gasBefore = gasleft();
        uint256 listingId = marketplace.list(address(cv), 1, 100, 0.1 ether);
        _recordGas("marketplace_list", gasBefore - gasleft());

        vm.deal(bob, 1 ether);
        c.mint(bob, 2);
        revealToken(c, bob, 2, pixels, traits);
        vm.prank(bob);
        gasBefore = gasleft();
        marketplace.buy{value: 0.1 ether}(listingId, 2);
        _recordGas("marketplace_buy", gasBefore - gasleft());

        c.mint(alice, 3);
        revealToken(c, alice, 3, pixels, traits);
        cv.earnAP(3, 200);
        vm.prank(alice);
        listingId = marketplace.list(address(cv), 3, 50, 0.05 ether);
        vm.prank(alice);
        gasBefore = gasleft();
        marketplace.cancel(listingId);
        _recordGas("marketplace_cancel", gasBefore - gasleft());
    }

    function _profileDeploymentSizes() internal {
        ChromaStorage s = new ChromaStorage(address(this), address(this));
        Chroma c = new Chroma(address(s), address(this), address(this), 500);
        ChromaCanvasV2 cv = new ChromaCanvasV2(address(c), address(s), address(this));
        (ChromaRenderer r, ChromaPaletteData p) = ChromaFixtures.deployRenderer(s, address(this));
        PixelMarketplace m = new PixelMarketplace();
        _recordGas("deploy_chromaStorage_runtime_bytes", address(s).code.length);
        _recordGas("deploy_chroma_runtime_bytes", address(c).code.length);
        _recordGas("deploy_canvas_runtime_bytes", address(cv).code.length);
        _recordGas("deploy_renderer_runtime_bytes", address(r).code.length);
        _recordGas("deploy_paletteData_runtime_bytes", address(p).code.length);
        _recordGas("deploy_marketplace_runtime_bytes", address(m).code.length);
    }

    function _recordGas(string memory key, uint256 value) internal {
        console2.log(string.concat("GAS_STRESS_TX ", key, " ", vm.toString(value)));
    }

    function _setAllowlistMint(
        string memory key,
        Chroma.Phase phase,
        bool cold,
        string memory rootHex,
        address wallet,
        bytes32[] memory proof,
        uint256 value,
        uint256 qty
    ) internal {
        Chroma fresh = _freshChroma();
        if (phase == Chroma.Phase.AllowlistOne) {
            fresh.setMerkleRootOne(vm.parseBytes32(rootHex));
        } else {
            fresh.setMerkleRootTwo(vm.parseBytes32(rootHex));
        }
        fresh.setPhase(phase);
        vm.deal(wallet, 20 ether);
        vm.startPrank(wallet);
        if (!cold) {
            fresh.mint{value: 0.0025 ether}(proof, 1);
        }
        uint256 gasBefore = gasleft();
        fresh.mint{value: value}(proof, qty);
        vm.stopPrank();
        _recordGas(key, gasBefore - gasleft());
    }

    function _gasPublicMint(uint256 qty, uint256 value) internal returns (uint256) {
        uint256 gasBefore = gasleft();
        chroma.mint{value: value}(qty);
        return gasBefore - gasleft();
    }

    function _freshChroma() internal returns (Chroma fresh) {
        ChromaStorage s = new ChromaStorage(address(this), address(this));
        fresh = new Chroma(address(s), address(this), address(this), 500);
        s.setWriter(address(fresh));
    }

    function _freshChromaFull() internal returns (Chroma fresh, ChromaCanvasV2 cv) {
        ChromaStorage s = new ChromaStorage(address(this), address(this));
        fresh = new Chroma(address(s), address(this), address(this), 500);
        s.setWriter(address(fresh));
        cv = new ChromaCanvasV2(address(fresh), address(s), address(this));
        fresh.setCanvas(address(cv));
    }

    function _leaf(address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(account));
    }

    function _emptyProof() internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](0);
    }

    function _mintPixels(uint256 tokenId) internal view returns (bytes memory) {
        string memory key = string.concat(".mint_samples.", vm.toString(tokenId), ".pixels_hex");
        return vm.parseBytes(merkleJson.readString(key));
    }

    function _mintTraits(uint256 tokenId) internal view returns (bytes memory) {
        string memory key = string.concat(".mint_samples.", vm.toString(tokenId), ".traits_hex");
        return vm.parseBytes(merkleJson.readString(key));
    }

    function _revealProof(uint256 tokenId) internal view returns (bytes32[] memory) {
        string memory key = string.concat(".mint_samples.", vm.toString(tokenId), ".proof");
        return merkleJson.readBytes32Array(key);
    }

    function _singlePixelDiff(uint256 flatIndex, uint8 colorIndex) internal pure returns (bytes memory) {
        bytes memory diff = new bytes(3);
        diff[0] = bytes1(uint8(flatIndex >> 8));
        diff[1] = bytes1(uint8(flatIndex));
        diff[2] = bytes1(colorIndex);
        return diff;
    }
}
