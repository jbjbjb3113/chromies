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

    error InvalidTotalPixelsCount();

    error ZeroAddress();



    uint256 internal constant PIXELS_LENGTH = 2048;



    // Trait encoding (32 bytes):

    // [0]  Character: 0=HeroA_Male, 1=HeroA_Female, 2=Alien, 3=Cat (retired), 4=Agent,
    //              5=SideProfile_Male, 6=SideProfile_Female, 7=Chubby_Male, 8=Zombie (live)

    // [1]  Palette: 0=SIGNAL, 1=ACID, 2=CYAN, 3=GHOST, 4=BLOOD, 5=MOSS,

    //              6=SIGNAL_BLONDE, 7=SIGNAL_GREY, 8=SIGNAL_RED,

    //              9=ACID_BLONDE, 10=ACID_GREY, 11=ACID_RED,

    //              12=CYAN_BLONDE, 13=CYAN_GREY, 14=CYAN_RED,

    //              15=GHOST_BLONDE, 16=GHOST_GREY, 17=GHOST_RED,

    //              18=BLOOD_BLONDE, 19=BLOOD_GREY, 20=BLOOD_RED,

    //              21=MOSS_BLONDE, 22=MOSS_GREY, 23=MOSS_RED,

    //              24=CAT, 25=ALIEN, 26=ZOMBIE

    // [2]  Hood: 0=None, 1=Classic

    // [3]  Shirt: 0=None, 1=Crew, 2=Tank, 3=Tank_Female

    // [4]  Body: 0=None, 1=Default, 2=Female, 3=Female_Tank, 4=Alien, 5=Tank, 6=Zombie

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

    // [15] BG color: 0x00 default, 0x01-0x08 per palette ruling (JB 2026-07-13,
    //      re-designated from mutation-era retired byte — see
    //      chromies-engine/reports/BG_COLOR_PALETTE_RULING.md)
    // [16] Retired / unused

    // [17] Total Pixels (uint16 high byte) — pipeline-computed non-zero nibble count

    // [18] Total Pixels (uint16 low byte)

    // [19-31] Reserved for future traits

    uint256 internal constant TRAITS_LENGTH = 32;

    address public writer;

    mapping(uint256 tokenId => address) public pixelPointers;

    mapping(uint256 tokenId => bytes32) public traits;

    mapping(uint256 tokenId => uint256 count) public totalPixels;



    constructor(address initialOwner, address initialWriter) Ownable(initialOwner) {
        if (initialWriter == address(0)) revert ZeroAddress();
        writer = initialWriter;
    }



    function setWriter(address newWriter) external onlyOwner {
        if (newWriter == address(0)) revert ZeroAddress();
        writer = newWriter;
    }



    function writeTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traitBytes) external {

        if (msg.sender != writer) revert UnauthorizedWriter();

        if (pixels.length != PIXELS_LENGTH) revert InvalidPixelsLength();

        if (traitBytes.length != TRAITS_LENGTH) revert InvalidTraitsLength();

        if (pixelPointers[tokenId] != address(0)) revert TokenAlreadyWritten();



        pixelPointers[tokenId] = SSTORE2.write(pixels);

        totalPixels[tokenId] = _totalPixelsFromTraits(traitBytes);

        traits[tokenId] = bytes32(traitBytes);

    }



    function getTotalPixels(uint256 tokenId) external view returns (uint256) {

        return totalPixels[tokenId];

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

        if (pixelPointers[tokenId] == address(0)) revert TokenNotWritten();

        return abi.encodePacked(traits[tokenId]);

    }



    /// @notice Replace on-chain pixels after canvas edits are baked in at inscribe time.

    /// @param newTotalPixels Non-zero nibble count supplied by canvas compositor (computeFinalPixels).

    function rewritePixels(uint256 tokenId, bytes calldata pixels, uint16 newTotalPixels) external {

        if (msg.sender != writer) revert UnauthorizedWriter();

        if (pixels.length != PIXELS_LENGTH) revert InvalidPixelsLength();

        if (pixelPointers[tokenId] == address(0)) revert TokenNotWritten();

        if (newTotalPixels > 4096) revert InvalidTotalPixelsCount();



        pixelPointers[tokenId] = SSTORE2.write(pixels);

        totalPixels[tokenId] = newTotalPixels;



        bytes memory traitBytes = abi.encodePacked(traits[tokenId]);

        traitBytes[17] = bytes1(uint8(newTotalPixels >> 8));

        traitBytes[18] = bytes1(uint8(newTotalPixels));

        traits[tokenId] = bytes32(traitBytes);

    }



    function _totalPixelsFromTraits(bytes calldata traitBytes) internal pure returns (uint256 count) {

        count = (uint256(uint8(traitBytes[17])) << 8) | uint256(uint8(traitBytes[18]));

        if (count > 4096) revert InvalidTotalPixelsCount();

    }

}


