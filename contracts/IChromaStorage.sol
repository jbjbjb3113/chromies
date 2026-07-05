// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaStorage {
    function writeTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traits) external;

    function hasData(uint256 tokenId) external view returns (bool);

    function getPixels(uint256 tokenId) external view returns (bytes memory);

    function getTraits(uint256 tokenId) external view returns (bytes memory);

    function rewritePixels(uint256 tokenId, bytes calldata pixels, uint16 newTotalPixels) external;

    function getTotalPixels(uint256 tokenId) external view returns (uint256);
}
