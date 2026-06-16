// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaCanvasFinalize {
    function isCustomized(uint256 tokenId) external view returns (bool);

    function computeFinalPixels(uint256 tokenId) external view returns (bytes memory pixels, uint16 totalPixelCount);

    function clearDiffs(uint256 tokenId) external;
}
