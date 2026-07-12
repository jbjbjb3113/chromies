// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaPaletteData {
    function MAX_VALID_PALETTE_ID() external pure returns (uint8);

    function ERROR_PALETTE_ID() external pure returns (uint8);

    function paletteColors(uint8 paletteId) external pure returns (string[16] memory);

    function paletteName(uint8 paletteId) external pure returns (string memory);
}
