// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaCanvas {
    function getDiff(uint256 tokenId) external view returns (uint16[] memory pixelIndexes, uint8[] memory newColorIndexes);
}
