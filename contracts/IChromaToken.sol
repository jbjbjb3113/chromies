// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IChromaToken is IERC721 {
    function isLocked(uint256 tokenId) external view returns (bool);

    function revealed(uint256 tokenId) external view returns (bool);

    function revealedTraits(uint256 tokenId) external view returns (bytes32);
}
