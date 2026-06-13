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
    error UnauthorizedTraitUpdater();
    error InvalidTraitIndex();

    uint256 internal constant PIXELS_LENGTH = 2048;

    // Trait encoding (32 bytes):
    // [0]  Character: 0=HeroA_Male, 1=HeroA_Female, 2=Alien, 3=Cat, 4=Agent
    // [1]  Palette: 0=SIGNAL, 1=ACID, 2=CYAN, 3=GHOST, 4=BLOOD, 5=MOSS,
    //              6=SIGNAL_BLONDE, 7=SIGNAL_GREY, 8=SIGNAL_RED,
    //              9=ACID_BLONDE, 10=ACID_GREY, 11=ACID_RED,
    //              12=CYAN_BLONDE, 13=CYAN_GREY, 14=CYAN_RED,
    //              15=GHOST_BLONDE, 16=GHOST_GREY, 17=GHOST_RED,
    //              18=BLOOD_BLONDE, 19=BLOOD_GREY, 20=BLOOD_RED,
    //              21=MOSS_BLONDE, 22=MOSS_GREY, 23=MOSS_RED,
    //              24=CAT, 25=ALIEN
    // [2]  Hood: 0=None, 1=Classic
    // [3]  Shirt: 0=None, 1=Crew, 2=Tank, 3=Tank_Female
    // [4]  Body: 0=None, 1=Default, 2=Female, 3=Female_Tank, 4=Alien, 5=Tank
    // [5]  Bodytattoo: 0=None, 1=UnderArmour, 2=AkuHeart, 3=Pyramid, 4=Normies
    // [6]  Necklace: 0=None, 1=Male_Chain, 2=Female_Chain, 3=Female_Ornate,
    //               4=Female_Flower, 5=Female_UpsideDownCross, 6=Female_Opal
    // [7]  Tattoo: 0=None, 1=Signal, 2=Thug, 3=Marks, 4=Scar
    // [8]  Mask: 0=None
    // [9]  Beard: 0=None, 1=Full, 2=Goat
    // [10] Mustache: 0=None, 1=Thick
    // [11] Eyes: 0=Signal, 1=Alien
    // [12] Earrings: 0=None, 1=Stud
    // [13] Glasses: 0=None, 1=Shades, 2=Neo, 3=VR
    // [14] Hair: 0=None, 1=Mohawk, 2=Pompadour, 3=MrT, 4=Afro,
    //            5=Dreads, 6=Surfer, 7=FadeRight
    // [15] Mutation tier: 0=Pristine, 1=Standard, 2=Drifted, 3=OffKilter
    // [16] Drift tier: 0=Pristine, 1=Standard, 2=Drifted, 3=OffKilter
    // [17-31] Reserved for future traits
    uint256 internal constant TRAITS_LENGTH = 32;
    address public writer;
    address public traitUpdater;

    mapping(uint256 tokenId => address) public pixelPointers;
    mapping(uint256 tokenId => address) public traitPointers;
    mapping(uint256 tokenId => uint256 count) public totalPixels;

    constructor(address initialOwner, address initialWriter) Ownable(initialOwner) {
        writer = initialWriter;
    }

    function setWriter(address newWriter) external onlyOwner {
        writer = newWriter;
    }

    function setTraitUpdater(address newTraitUpdater) external onlyOwner {
        traitUpdater = newTraitUpdater;
    }

    function writeTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traits) external {
        if (msg.sender != writer) revert UnauthorizedWriter();
        if (pixels.length != PIXELS_LENGTH) revert InvalidPixelsLength();
        if (traits.length != TRAITS_LENGTH) revert InvalidTraitsLength();
        if (pixelPointers[tokenId] != address(0)) revert TokenAlreadyWritten();

        pixelPointers[tokenId] = SSTORE2.write(pixels);
        traitPointers[tokenId] = SSTORE2.write(traits);
        totalPixels[tokenId] = _countNonZeroPixels(pixels);
    }

    function getTotalPixels(uint256 tokenId) external view returns (uint256) {
        return totalPixels[tokenId];
    }

    function revealTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traits) external {
        if (msg.sender != writer) revert UnauthorizedWriter();
        if (pixels.length != PIXELS_LENGTH) revert InvalidPixelsLength();
        if (traits.length != TRAITS_LENGTH) revert InvalidTraitsLength();
        if (pixelPointers[tokenId] == address(0)) revert TokenNotWritten();

        pixelPointers[tokenId] = SSTORE2.write(pixels);
        traitPointers[tokenId] = SSTORE2.write(traits);
    }

    function hasData(uint256 tokenId) external view returns (bool) {
        return pixelPointers[tokenId] != address(0);
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

    function updateTrait(uint256 tokenId, uint256 traitIndex, uint8 value) external override {
        if (msg.sender != traitUpdater) revert UnauthorizedTraitUpdater();
        if (traitIndex >= TRAITS_LENGTH) revert InvalidTraitIndex();

        address pointer = traitPointers[tokenId];
        if (pointer == address(0)) revert TokenNotWritten();

        bytes memory traits = SSTORE2.read(pointer);
        traits[traitIndex] = bytes1(value);
        traitPointers[tokenId] = SSTORE2.write(traits);
    }

    function _countNonZeroPixels(bytes calldata pixels) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < 4096; ++i) {
            uint8 packed = uint8(pixels[i >> 1]);
            uint8 idx = (i & 1) == 0 ? packed >> 4 : packed & 0x0f;
            if (idx != 0) {
                ++count;
            }
        }
    }
}
