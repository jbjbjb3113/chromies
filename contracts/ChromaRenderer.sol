// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChromaCanvas} from "./IChromaCanvas.sol";
import {IChromaStorage} from "./IChromaStorage.sol";

contract ChromaRenderer is Ownable {
    using Strings for uint256;

    IChromaStorage public immutable chromaStorage;
    IChromaCanvas public chromaCanvas;
    uint256 internal constant GRID = 64;
    uint256 internal constant CELL = 16;

    constructor(address storageAddress, address initialOwner) Ownable(initialOwner) {
        chromaStorage = IChromaStorage(storageAddress);
    }

    function setCanvas(address canvasAddress) external onlyOwner {
        chromaCanvas = IChromaCanvas(canvasAddress);
    }

    function renderSVG(uint256 tokenId) public view returns (string memory) {
        bytes memory pixels = chromaStorage.getPixels(tokenId);
        bytes memory traits = chromaStorage.getTraits(tokenId);
        string[16] memory palette = _paletteForToken(traits);
        (uint16[] memory diffIndexes, uint8[] memory diffColors) = _getDiff(tokenId);

        bytes memory body;
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint8 idx = _getCompositePixelIndex(pixels, x, y, diffIndexes, diffColors);
                uint256 run = 1;
                while (x + run < GRID && _getCompositePixelIndex(pixels, x + run, y, diffIndexes, diffColors) == idx) {
                    ++run;
                }

                if (idx != 0) {
                    body = abi.encodePacked(
                        body,
                        '<rect x="',
                        (x * CELL).toString(),
                        '" y="',
                        (y * CELL).toString(),
                        '" width="',
                        (run * CELL).toString(),
                        '" height="16" fill="',
                        palette[idx],
                        '"/>'
                    );
                }
                x += run;
            }
        }

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><rect width="1024" height="1024" fill="',
                palette[0],
                '"/>',
                body,
                "</svg>"
            )
        );
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        bytes memory traits = chromaStorage.getTraits(tokenId);
        string[16] memory palette = _paletteForToken(traits);
        string memory svg = renderSVG(tokenId);
        string memory image = string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));

        bytes memory json = abi.encodePacked(
            '{"name":"Chroma #',
            tokenId.toString(),
            '","description":"Chroma is a fully on-chain 64x64 indexed-color NFT.","image":"',
            image,
            '","attributes":[{"trait_type":"Type","value":"',
            _typeLabel(uint8(traits[0])),
            '"},{"trait_type":"Expression","value":"',
            _expressionLabel(uint8(traits[1])),
            '"},{"trait_type":"Headgear","value":"',
            _headgearLabel(uint8(traits[2])),
            '"},{"trait_type":"Eyewear","value":"',
            _eyewearLabel(uint8(traits[3])),
            '"},{"trait_type":"Palette","value":"',
            _paletteName(uint8(traits[4])),
            '"},{"trait_type":"Palette Color 0","value":"',
            palette[0],
            '"}]}'
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    function _getPixelIndex(bytes memory pixels, uint256 x, uint256 y) internal pure returns (uint8) {
        uint256 flatIndex = y * GRID + x;
        uint8 packed = uint8(pixels[flatIndex >> 1]);
        if ((flatIndex & 1) == 0) return packed >> 4;
        return packed & 0x0f;
    }

    function _getCompositePixelIndex(
        bytes memory pixels,
        uint256 x,
        uint256 y,
        uint16[] memory diffIndexes,
        uint8[] memory diffColors
    ) internal pure returns (uint8) {
        uint16 flatIndex = uint16(y * GRID + x);
        for (uint256 i = diffIndexes.length; i > 0; --i) {
            uint256 idx = i - 1;
            if (diffIndexes[idx] == flatIndex) return diffColors[idx];
        }
        return _getPixelIndex(pixels, x, y);
    }

    function _getDiff(uint256 tokenId) internal view returns (uint16[] memory diffIndexes, uint8[] memory diffColors) {
        if (address(chromaCanvas) == address(0)) return (new uint16[](0), new uint8[](0));
        return chromaCanvas.getDiff(tokenId);
    }

    function _paletteForToken(bytes memory traits) internal pure returns (string[16] memory palette) {
        return _paletteColors(uint8(traits[4]));
    }

    function _paletteColors(uint8 paletteId) internal pure returns (string[16] memory palette) {
        uint8 id = paletteId % 6;
        if (id == 0) {
            return [
                "#1a1014",
                "#2d161c",
                "#451d24",
                "#5e2730",
                "#7a3340",
                "#9c4050",
                "#c25062",
                "#e06478",
                "#f2879a",
                "#ffb0bd",
                "#ffd28f",
                "#ffac4a",
                "#ff7b2e",
                "#e8541d",
                "#a83515",
                "#5c1d0f"
            ];
        }
        if (id == 1) {
            return [
                "#08111c",
                "#0d1f33",
                "#13314d",
                "#1a456b",
                "#225d8c",
                "#2d7aad",
                "#3f9bcc",
                "#5cbce0",
                "#86d6ee",
                "#b8eefa",
                "#d4f6e8",
                "#8fe6c4",
                "#4fcf9c",
                "#1d9e75",
                "#0f6e56",
                "#063f33"
            ];
        }
        if (id == 2) {
            return [
                "#0f0a1a",
                "#1c1330",
                "#2c1c4a",
                "#3e2a66",
                "#523a84",
                "#6a4ca6",
                "#8463c4",
                "#a181df",
                "#c0a3f0",
                "#ddc8fb",
                "#f6d6ec",
                "#e89bc9",
                "#d4609f",
                "#a8447a",
                "#6f2a52",
                "#3a1530"
            ];
        }
        if (id == 3) {
            return [
                "#0a1108",
                "#142010",
                "#1f3318",
                "#2c4a20",
                "#3d662b",
                "#519136",
                "#6db742",
                "#8fd95a",
                "#bff07e",
                "#e4ffb0",
                "#fff0a8",
                "#f5c45e",
                "#d99432",
                "#a8651c",
                "#6e3e12",
                "#3a210a"
            ];
        }
        if (id == 4) {
            return [
                "#0a0a0b",
                "#161618",
                "#242427",
                "#343438",
                "#48494b",
                "#5f6063",
                "#787a7d",
                "#94969a",
                "#b1b3b7",
                "#cfd1d4",
                "#e3e5e4",
                "#f2f3f2",
                "#ff5470",
                "#3f9bcc",
                "#ffac4a",
                "#6db742"
            ];
        }

        return [
            "#1a0f1a",
            "#2e1730",
            "#4a2050",
            "#6a2c72",
            "#8c3a92",
            "#b14fae",
            "#d46bc4",
            "#ef8fd6",
            "#ffb8e6",
            "#ffe0f4",
            "#fff3cc",
            "#ffd96b",
            "#ffb03f",
            "#ff7a5c",
            "#e84d6b",
            "#8c2a4a"
        ];
    }

    function _typeLabel(uint8 value) internal pure returns (string memory) {
        uint8 i = value % 5;
        if (i == 0) return "Human";
        if (i == 1) return "Cat";
        if (i == 2) return "Alien";
        if (i == 3) return "Droid";
        return "Specter";
    }

    function _expressionLabel(uint8 value) internal pure returns (string memory) {
        uint8 i = value % 6;
        if (i == 0) return "Neutral";
        if (i == 1) return "Smile";
        if (i == 2) return "Serious";
        if (i == 3) return "Smug";
        if (i == 4) return "Surprised";
        return "Sleepy";
    }

    function _headgearLabel(uint8 value) internal pure returns (string memory) {
        uint8 i = value % 8;
        if (i == 0) return "None";
        if (i == 1) return "Cap";
        if (i == 2) return "Crown";
        if (i == 3) return "Halo";
        if (i == 4) return "Antenna";
        if (i == 5) return "Top Hat";
        if (i == 6) return "Visor";
        return "Beanie";
    }

    function _eyewearLabel(uint8 value) internal pure returns (string memory) {
        uint8 i = value % 6;
        if (i == 0) return "None";
        if (i == 1) return "Shades";
        if (i == 2) return "Round Glasses";
        if (i == 3) return "Visor";
        if (i == 4) return "Eyepatch";
        return "VR";
    }

    function _paletteName(uint8 value) internal pure returns (string memory) {
        uint8 i = value % 6;
        if (i == 0) return "Ember";
        if (i == 1) return "Tide";
        if (i == 2) return "Dusk";
        if (i == 3) return "Verdant";
        if (i == 4) return "Mono+";
        return "Candy";
    }
}
