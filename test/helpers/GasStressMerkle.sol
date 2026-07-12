// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Sorted-pair keccak merkle tree (matches merkletreejs + OpenZeppelin MerkleProof).
library GasStressMerkle {
    function leafAllowlist(address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(account));
    }

    function leafReveal(uint256 tokenId, bytes memory pixels, bytes memory traits) internal pure returns (bytes32) {
        return keccak256(abi.encode(tokenId, pixels, traits));
    }

    function buildAllowlistTree(uint256 leafCount)
        internal
        pure
        returns (bytes32 root, bytes32[] memory proofForIndex0)
    {
        bytes32[] memory leaves = new bytes32[](leafCount);
        for (uint256 i = 0; i < leafCount; ++i) {
            leaves[i] = leafAllowlist(address(uint160(0x1000 + i)));
        }
        return _buildTree(leaves, 0);
    }

    function buildRevealTree(uint256 leafCount, bytes memory pixels, bytes memory traits)
        internal
        pure
        returns (bytes32 root, bytes32[] memory proofForToken1)
    {
        bytes32[] memory leaves = new bytes32[](leafCount);
        for (uint256 i = 0; i < leafCount; ++i) {
            uint256 tokenId = i + 1;
            leaves[i] = leafReveal(tokenId, pixels, traits);
        }
        return _buildTree(leaves, 1);
    }

    function _buildTree(bytes32[] memory leaves, uint256 targetIndex)
        private
        pure
        returns (bytes32 root, bytes32[] memory proof)
    {
        require(leaves.length > 0, "empty tree");
        require(targetIndex < leaves.length, "bad index");

        bytes32[] memory level = _sortPairLevel(leaves);
        uint256[] memory indexPath = new uint256[](32);
        uint256 depth;
        uint256 idx = targetIndex;

        while (level.length > 1) {
            indexPath[depth] = idx;
            ++depth;
            idx = idx >> 1;
            level = _nextLevel(level);
        }
        root = level[0];

        proof = new bytes32[](depth);
        level = _sortPairLevel(leaves);
        idx = targetIndex;
        for (uint256 d = 0; d < depth; ++d) {
            uint256 sibling = idx ^ 1;
            if (sibling < level.length) {
                proof[d] = level[sibling];
            } else {
                proof[d] = level[idx];
            }
            idx = idx >> 1;
            level = _nextLevel(level);
        }
    }

    function _nextLevel(bytes32[] memory level) private pure returns (bytes32[] memory) {
        uint256 outLen = (level.length + 1) >> 1;
        bytes32[] memory next = new bytes32[](outLen);
        for (uint256 i = 0; i < outLen; ++i) {
            bytes32 left = level[i * 2];
            bytes32 right = i * 2 + 1 < level.length ? level[i * 2 + 1] : left;
            next[i] = _hashPair(left, right);
        }
        return next;
    }

    function _sortPairLevel(bytes32[] memory nodes) private pure returns (bytes32[] memory sorted) {
        sorted = new bytes32[](nodes.length);
        for (uint256 i = 0; i < nodes.length; ++i) {
            sorted[i] = nodes[i];
        }
        for (uint256 i = 0; i < sorted.length; ++i) {
            for (uint256 j = i + 1; j < sorted.length; ++j) {
                if (uint256(sorted[i]) > uint256(sorted[j])) {
                    bytes32 tmp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = tmp;
                }
            }
        }
    }

    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        if (uint256(a) > uint256(b)) {
            (a, b) = (b, a);
        }
        return keccak256(abi.encodePacked(a, b));
    }
}
