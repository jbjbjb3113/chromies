// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaCanvas {
    function getDiff(uint256 tokenId) external view returns (uint16[] memory pixelIndexes, uint8[] memory newColorIndexes);
    function level(uint256 tokenId) external view returns (uint256);
    /// @notice Lifetime-earn level: sqrt(totalApEarned / 50), uncapped.
    function getLevel(uint256 tokenId) external view returns (uint256);
    function totalApEarned(uint256 tokenId) external view returns (uint256);
    function getBurnCount(uint256 tokenId) external view returns (uint256);
    function isCustomized(uint256 tokenId) external view returns (bool);
    function getPixelsEdited(uint256 tokenId) external view returns (uint256);
    function getTotalPixels(uint256 tokenId) external view returns (uint256);
}
