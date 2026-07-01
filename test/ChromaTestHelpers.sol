// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Chroma} from "../contracts/Chroma.sol";

abstract contract ChromaTestHelpers is Test {
    function setRevealRootFor(
        Chroma chroma,
        uint256 tokenId,
        bytes memory pixels,
        bytes memory traits
    ) internal {
        bytes32 leaf = keccak256(abi.encode(tokenId, pixels, traits));
        chroma.setRevealRoot(leaf);
    }

    function emptyProof() internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](0);
    }

    function revealToken(
        Chroma chroma,
        address caller,
        uint256 tokenId,
        bytes memory pixels,
        bytes memory traits
    ) internal {
        setRevealRootFor(chroma, tokenId, pixels, traits);
        vm.prank(caller);
        chroma.reveal(tokenId, pixels, traits, emptyProof());
    }

    function inscribeToken(
        Chroma chroma,
        address caller,
        uint256 tokenId,
        bytes memory pixels,
        bytes memory traits
    ) internal {
        setRevealRootFor(chroma, tokenId, pixels, traits);
        if (!chroma.revealed(tokenId)) {
            vm.prank(caller);
            chroma.reveal(tokenId, pixels, traits, emptyProof());
        }
        vm.prank(caller);
        chroma.inscribe(tokenId, pixels, traits, emptyProof());
    }

    function mintRevealInscribe(
        Chroma chroma,
        address to,
        uint256 tokenId,
        bytes memory pixels,
        bytes memory traits
    ) internal {
        chroma.mint(to, tokenId);
        inscribeToken(chroma, to, tokenId, pixels, traits);
    }
}
