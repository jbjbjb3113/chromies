// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChromaStorage} from "./IChromaStorage.sol";

contract ChromaStorage is IChromaStorage, Ownable {
    error UnauthorizedWriter();
    error InvalidPixelsLength();
    error InvalidTraitsLength();
    error TokenAlreadyWritten();
    error TokenNotWritten();

    uint256 internal constant PIXELS_LENGTH = 2048;
    uint256 internal constant TRAITS_LENGTH = 5;
    address public writer;

    mapping(uint256 tokenId => address) public pixelPointers;
    mapping(uint256 tokenId => address) public traitPointers;

    constructor(address initialOwner, address initialWriter) Ownable(initialOwner) {
        writer = initialWriter;
    }

    function setWriter(address newWriter) external onlyOwner {
        writer = newWriter;
    }

    function writeTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traits) external {
        if (msg.sender != writer) revert UnauthorizedWriter();
        if (pixels.length != PIXELS_LENGTH) revert InvalidPixelsLength();
        if (traits.length != TRAITS_LENGTH) revert InvalidTraitsLength();
        if (pixelPointers[tokenId] != address(0)) revert TokenAlreadyWritten();

        pixelPointers[tokenId] = SSTORE2.write(pixels);
        traitPointers[tokenId] = SSTORE2.write(traits);
    }

    function getPixels(uint256 tokenId) external view override returns (bytes memory) {
        address pointer = pixelPointers[tokenId];
        if (pointer == address(0)) revert TokenNotWritten();
        return SSTORE2.read(pointer);
    }

    function getTraits(uint256 tokenId) external view override returns (bytes memory) {
        address pointer = traitPointers[tokenId];
        if (pointer == address(0)) revert TokenNotWritten();
        return SSTORE2.read(pointer);
    }
}
