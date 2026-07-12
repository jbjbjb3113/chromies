// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice NOT-FINAL gas measurement for Model B batchInscribe (48 tokens).
///         Results feed reports/MODEL_B_DESIGN.md §10 cost model.
import {Test, stdJson} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {ChromaBatchProbe} from "../contracts/test/ChromaBatchProbe.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";

contract ModelBBatchInscribeGasTest is Test {
    using stdJson for string;

    uint256 internal constant BATCH_SIZE = 48;
    uint256 internal constant COLLECTION = 5150;

    string internal merkleJson;
    ChromaBatchProbe internal chroma;
    ChromaStorage internal storageContract;

    address internal holder;

    function setUp() public {
        holder = makeAddr("holder");
        string memory root = vm.projectRoot();
        merkleJson = vm.readFile(string.concat(root, "/chromies-engine/generated/gas_stress_merkle.json"));

        storageContract = new ChromaStorage(address(this), address(this));
        chroma = new ChromaBatchProbe(address(storageContract), address(this), address(this), 500);
        storageContract.setWriter(address(chroma));
        ChromaCanvasV2 canvas = new ChromaCanvasV2(address(chroma), address(storageContract), address(this));
        chroma.setCanvas(address(canvas));
    }

    function test_MeasureBatchInscribe48() public {
        bytes32[] memory leaves = new bytes32[](BATCH_SIZE);
        bytes[] memory pixelsArr = new bytes[](BATCH_SIZE);
        bytes[] memory traitsArr = new bytes[](BATCH_SIZE);

        for (uint256 i = 0; i < BATCH_SIZE; ++i) {
            uint256 tokenId = i + 1;
            uint256 sampleId = _sampleId(tokenId);
            bytes memory pixels = _mintPixels(sampleId);
            bytes memory traits = _mintTraits(sampleId);
            pixelsArr[i] = pixels;
            traitsArr[i] = traits;
            leaves[i] = keccak256(abi.encode(tokenId, pixels, traits));
        }

        bytes32 root = _merkleRoot(leaves);
        chroma.setRevealRoot(root);

        for (uint256 i = 0; i < BATCH_SIZE; ++i) {
            uint256 tokenId = i + 1;
            chroma.mint(holder, tokenId);
            vm.prank(holder);
            bytes32[] memory revealProof = _merkleProof(leaves, i);
            chroma.reveal(tokenId, pixelsArr[i], traitsArr[i], revealProof);
        }

        uint256[] memory tokenIds = _tokenIds(BATCH_SIZE);
        bytes32[][] memory inscribeProofs = new bytes32[][](BATCH_SIZE);
        for (uint256 i = 0; i < BATCH_SIZE; ++i) {
            inscribeProofs[i] = _merkleProof(leaves, i);
        }

        uint256 gasBefore = gasleft();
        chroma.batchInscribe(tokenIds, pixelsArr, traitsArr, inscribeProofs);
        uint256 batchGas = gasBefore - gasleft();

        uint256 perToken = batchGas / BATCH_SIZE;
        uint256 collectionTotal = perToken * COLLECTION;

        console2.log("GAS_MODEL_B batchInscribe48_total", batchGas);
        console2.log("GAS_MODEL_B batchInscribe48_per_token", perToken);
        console2.log("GAS_MODEL_B batchInscribe5150_extrapolated", collectionTotal);

        // Sanity: all 48 inscribed
        for (uint256 i = 1; i <= BATCH_SIZE; ++i) {
            assertTrue(storageContract.hasData(i));
            assertFalse(chroma.isLocked(i));
        }
    }

    function test_MeasureBatchInscribe48_IdempotentSkip() public {
        bytes32[] memory leaves = new bytes32[](BATCH_SIZE);
        bytes[] memory pixelsArr = new bytes[](BATCH_SIZE);
        bytes[] memory traitsArr = new bytes[](BATCH_SIZE);

        for (uint256 i = 0; i < BATCH_SIZE; ++i) {
            uint256 tokenId = i + 1;
            uint256 sampleId = _sampleId(tokenId);
            pixelsArr[i] = _mintPixels(sampleId);
            traitsArr[i] = _mintTraits(sampleId);
            leaves[i] = keccak256(abi.encode(tokenId, pixelsArr[i], traitsArr[i]));
        }

        bytes32 root = _merkleRoot(leaves);
        chroma.setRevealRoot(root);

        for (uint256 i = 0; i < BATCH_SIZE; ++i) {
            uint256 tokenId = i + 1;
            chroma.mint(holder, tokenId);
            vm.prank(holder);
            chroma.reveal(tokenId, pixelsArr[i], traitsArr[i], _merkleProof(leaves, i));
        }

        uint256[] memory tokenIds = _tokenIds(BATCH_SIZE);
        bytes32[][] memory proofs = new bytes32[][](BATCH_SIZE);
        for (uint256 i = 0; i < BATCH_SIZE; ++i) {
            proofs[i] = _merkleProof(leaves, i);
        }

        chroma.batchInscribe(tokenIds, pixelsArr, traitsArr, proofs);

        uint256 gasBefore = gasleft();
        chroma.batchInscribe(tokenIds, pixelsArr, traitsArr, proofs);
        uint256 skipGas = gasBefore - gasleft();

        console2.log("GAS_MODEL_B batchInscribe48_idempotent_skip_total", skipGas);
        console2.log("GAS_MODEL_B batchInscribe48_idempotent_skip_per_token", skipGas / BATCH_SIZE);
    }

    function _sampleId(uint256 tokenId) internal pure returns (uint256) {
        uint256[6] memory samples = [uint256(1), 2, 3, 4, 5, 6];
        return samples[(tokenId - 1) % 6];
    }

    function _tokenIds(uint256 n) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            ids[i] = i + 1;
        }
    }

    function _mintPixels(uint256 tokenId) internal view returns (bytes memory) {
        string memory key = string.concat(".mint_samples.", vm.toString(tokenId), ".pixels_hex");
        return vm.parseBytes(merkleJson.readString(key));
    }

    function _mintTraits(uint256 tokenId) internal view returns (bytes memory) {
        string memory key = string.concat(".mint_samples.", vm.toString(tokenId), ".traits_hex");
        return vm.parseBytes(merkleJson.readString(key));
    }

    function _merkleRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        uint256 n = leaves.length;
        if (n == 0) return bytes32(0);
        if (n == 1) return leaves[0];

        bytes32[] memory layer = leaves;
        while (layer.length > 1) {
            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);
            for (uint256 i = 0; i < nextLen; ++i) {
                bytes32 left = layer[i * 2];
                bytes32 right = i * 2 + 1 < layer.length ? layer[i * 2 + 1] : left;
                next[i] = _hashPair(left, right);
            }
            layer = next;
        }
        return layer[0];
    }

    function _merkleProof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory) {
        require(index < leaves.length, "index");
        bytes32[] memory proof;
        uint256 proofLen;
        bytes32[] memory layer = leaves;
        uint256 idx = index;

        while (layer.length > 1) {
            proofLen++;
            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);
            for (uint256 i = 0; i < nextLen; ++i) {
                bytes32 left = layer[i * 2];
                bytes32 right = i * 2 + 1 < layer.length ? layer[i * 2 + 1] : left;
                next[i] = _hashPair(left, right);
            }
            layer = next;
            idx /= 2;
        }

        proof = new bytes32[](proofLen);
        layer = leaves;
        idx = index;
        for (uint256 p = 0; p < proofLen; ++p) {
            uint256 sibling = idx ^ 1;
            if (sibling < layer.length) {
                proof[p] = layer[sibling];
            } else {
                proof[p] = layer[idx];
            }
            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);
            for (uint256 i = 0; i < nextLen; ++i) {
                bytes32 left = layer[i * 2];
                bytes32 right = i * 2 + 1 < layer.length ? layer[i * 2 + 1] : left;
                next[i] = _hashPair(left, right);
            }
            layer = next;
            idx /= 2;
        }
        return proof;
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }
}
