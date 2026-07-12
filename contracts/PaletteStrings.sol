// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PaletteStrings {
    bytes16 private constant _HEX = "0123456789abcdef";

    function toHex(bytes3 rgb) internal pure returns (string memory) {
        bytes memory str = new bytes(7);
        str[0] = "#";
        _writeHexByte(str, 1, uint8(rgb[0]));
        _writeHexByte(str, 3, uint8(rgb[1]));
        _writeHexByte(str, 5, uint8(rgb[2]));
        return string(str);
    }

    function _writeHexByte(bytes memory str, uint256 offset, uint8 value) private pure {
        str[offset] = _HEX[value >> 4];
        str[offset + 1] = _HEX[value & 0x0f];
    }
}
