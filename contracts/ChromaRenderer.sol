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
        uint8 mutationTier = uint8(traits[15]);

        bytes memory body;
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint256 flatIndex = y * GRID + x;
                uint8 idx = _getCompositePixelIndex(pixels, x, y, diffIndexes, diffColors);
                if (mutationTier != 0) {
                    idx = _mutatePixelIndex(tokenId, flatIndex, idx, mutationTier);
                }

                uint256 run = 1;
                while (x + run < GRID) {
                    uint256 nextFlat = y * GRID + x + run;
                    uint8 nextIdx = _getCompositePixelIndex(pixels, x + run, y, diffIndexes, diffColors);
                    if (mutationTier != 0) {
                        nextIdx = _mutatePixelIndex(tokenId, nextFlat, nextIdx, mutationTier);
                    }
                    if (nextIdx != idx) break;
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
        string memory svg = renderSVG(tokenId);
        string memory image = string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));

        bytes memory json = abi.encodePacked(
            '{"name":"Chroma #',
            tokenId.toString(),
            '","description":"Chroma is a fully on-chain 64x64 indexed-color NFT.","image":"',
            image,
            '","attributes":[',
            _jsonAttribute("Character", _characterLabel(uint8(traits[0]))),
            ",",
            _jsonAttribute("Palette", _paletteName(uint8(traits[1]))),
            ",",
            _jsonAttribute("Hood", _hoodLabel(uint8(traits[2]))),
            ",",
            _jsonAttribute("Shirt", _shirtLabel(uint8(traits[3]))),
            ",",
            _jsonAttribute("Body", _bodyLabel(uint8(traits[4]))),
            ",",
            _jsonAttribute("Bodytattoo", _bodytattooLabel(uint8(traits[5]))),
            ",",
            _jsonAttribute("Necklace", _necklaceLabel(uint8(traits[6]))),
            ",",
            _jsonAttribute("Tattoo", _tattooLabel(uint8(traits[7]))),
            ",",
            _jsonAttribute("Beard", _beardLabel(uint8(traits[9]))),
            ",",
            _jsonAttribute("Mustache", _mustacheLabel(uint8(traits[10]))),
            ",",
            _jsonAttribute("Eyes", _eyesLabel(uint8(traits[11]))),
            ",",
            _jsonAttribute("Earrings", _earringsLabel(uint8(traits[12]))),
            ",",
            _jsonAttribute("Glasses", _glassesLabel(uint8(traits[13]))),
            ",",
            _jsonAttribute("Hair", _hairLabel(uint8(traits[14]))),
            ",",
            _jsonAttribute("Mutation", _mutationLabel(uint8(traits[15]))),
            ']}'
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

    function _mutationSwapThreshold(uint8 tier) internal pure returns (uint8) {
        if (tier == 1) return 5;
        if (tier == 2) return 10;
        if (tier == 3) return 20;
        return 0;
    }

    function _mutatePixelIndex(uint256 tokenId, uint256 pixelIndex, uint8 paletteIndex, uint8 tier)
        internal
        pure
        returns (uint8)
    {
        if (tier == 0 || paletteIndex == 0) return paletteIndex;

        uint8 threshold = _mutationSwapThreshold(tier);
        if (threshold == 0) return paletteIndex;

        uint256 seed = uint256(keccak256(abi.encodePacked(tokenId, pixelIndex, "mutation")));
        if (seed % 100 >= threshold) return paletteIndex;

        if (paletteIndex >= 4 && paletteIndex <= 8) {
            uint256 familyPos = paletteIndex - 4;
            return uint8(4 + ((familyPos + seed) % 5));
        }
        if (paletteIndex >= 13 && paletteIndex <= 15) {
            uint256 familyPos = paletteIndex - 13;
            return uint8(13 + ((familyPos + seed) % 3));
        }
        return paletteIndex;
    }

    function _getDiff(uint256 tokenId) internal view returns (uint16[] memory diffIndexes, uint8[] memory diffColors) {
        if (address(chromaCanvas) == address(0)) return (new uint16[](0), new uint8[](0));
        return chromaCanvas.getDiff(tokenId);
    }

    function _jsonAttribute(string memory traitType, string memory value) internal pure returns (string memory) {
        return string(abi.encodePacked('{"trait_type":"', traitType, '","value":"', value, '"}'));
    }

    function _paletteForToken(bytes memory traits) internal pure returns (string[16] memory palette) {
        return _paletteColors(uint8(traits[1]));
    }

    function _paletteColors(uint8 paletteId) internal pure returns (string[16] memory palette) {
        uint8 id = paletteId % 26;
        if (id == 0) {
            return [
                "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0", "#4c270f", "#89532a", "#b2723f", "#d18b4d",
                "#df9c5e", "#1c1c26", "#1a0a14", "#a01856", "#ff2d8a", "#4d051b", "#9b2352", "#db5a91"
            ];
        }
        if (id == 1) {
            return [
                "#e3e5e4", "#0a1410", "#152620", "#e8f5d8", "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
                "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e", "#a8ff2d", "#1f3a14", "#52a01e", "#9be042"
            ];
        }
        if (id == 2) {
            return [
                "#e3e5e4", "#0a0e14", "#152028", "#d8eef5", "#1a1008", "#3a2818", "#5e4028", "#7a5538",
                "#9a704a", "#0e1a26", "#08141c", "#1e6088", "#2dd6ff", "#0d2a3a", "#1e6a90", "#4ec3e8"
            ];
        }
        if (id == 3) {
            return [
                "#e3e5e4", "#1f1a22", "#322a36", "#fafafa", "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
                "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a", "#c8a8ff", "#2a2030", "#6a5a8a", "#a8a0c8"
            ];
        }
        if (id == 4) {
            return [
                "#e3e5e4", "#100404", "#220808", "#f5d8d2", "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
                "#dc8e68", "#180806", "#0a0202", "#7a1818", "#ff3030", "#3a0606", "#8a1818", "#d83838"
            ];
        }
        if (id == 5) {
            return [
                "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8", "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
                "#bc8e5a", "#1c2618", "#0a1006", "#5a6820", "#a8b830", "#283018", "#5a6830", "#8a9848"
            ];
        }
        if (id == 6) {
            return [
                "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0", "#4c270f", "#89532a", "#b2723f", "#d18b4d",
                "#df9c5e", "#1c1c26", "#1a0a14", "#a01856", "#ff2d8a", "#3d2e00", "#8c6914", "#e8b84b"
            ];
        }
        if (id == 7) {
            return [
                "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0", "#4c270f", "#89532a", "#b2723f", "#d18b4d",
                "#df9c5e", "#1c1c26", "#1a0a14", "#a01856", "#ff2d8a", "#2a2a2a", "#707070", "#c0c0c0"
            ];
        }
        if (id == 8) {
            return [
                "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0", "#4c270f", "#89532a", "#b2723f", "#d18b4d",
                "#df9c5e", "#1c1c26", "#1a0a14", "#a01856", "#ff2d8a", "#3d0a00", "#8c2200", "#d94f1e"
            ];
        }
        if (id == 9) {
            return [
                "#e3e5e4", "#0a1410", "#152620", "#e8f5d8", "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
                "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e", "#a8ff2d", "#3d2e00", "#8c6914", "#e8b84b"
            ];
        }
        if (id == 10) {
            return [
                "#e3e5e4", "#0a1410", "#152620", "#e8f5d8", "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
                "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e", "#a8ff2d", "#2a2a2a", "#707070", "#c0c0c0"
            ];
        }
        if (id == 11) {
            return [
                "#e3e5e4", "#0a1410", "#152620", "#e8f5d8", "#3a2a1c", "#7a5a3e", "#b0876a", "#d4a890",
                "#e8c5a8", "#0f1a16", "#0d1c14", "#5a8a2e", "#a8ff2d", "#3d0a00", "#8c2200", "#d94f1e"
            ];
        }
        if (id == 12) {
            return [
                "#e3e5e4", "#0a0e14", "#152028", "#d8eef5", "#1a1008", "#3a2818", "#5e4028", "#7a5538",
                "#9a704a", "#0e1a26", "#08141c", "#1e6088", "#2dd6ff", "#3d2e00", "#8c6914", "#e8b84b"
            ];
        }
        if (id == 13) {
            return [
                "#e3e5e4", "#0a0e14", "#152028", "#d8eef5", "#1a1008", "#3a2818", "#5e4028", "#7a5538",
                "#9a704a", "#0e1a26", "#08141c", "#1e6088", "#2dd6ff", "#2a2a2a", "#707070", "#c0c0c0"
            ];
        }
        if (id == 14) {
            return [
                "#e3e5e4", "#0a0e14", "#152028", "#d8eef5", "#1a1008", "#3a2818", "#5e4028", "#7a5538",
                "#9a704a", "#0e1a26", "#08141c", "#1e6088", "#2dd6ff", "#3d0a00", "#8c2200", "#d94f1e"
            ];
        }
        if (id == 15) {
            return [
                "#e3e5e4", "#1f1a22", "#322a36", "#fafafa", "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
                "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a", "#c8a8ff", "#3d2e00", "#8c6914", "#e8b84b"
            ];
        }
        if (id == 16) {
            return [
                "#e3e5e4", "#1f1a22", "#322a36", "#fafafa", "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
                "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a", "#c8a8ff", "#2a2a2a", "#707070", "#c0c0c0"
            ];
        }
        if (id == 17) {
            return [
                "#e3e5e4", "#1f1a22", "#322a36", "#fafafa", "#5a4030", "#8a6a55", "#b89888", "#d4b8a8",
                "#e8d2c0", "#3d3445", "#1a1620", "#7d5a9a", "#c8a8ff", "#3d0a00", "#8c2200", "#d94f1e"
            ];
        }
        if (id == 18) {
            return [
                "#e3e5e4", "#100404", "#220808", "#f5d8d2", "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
                "#dc8e68", "#180806", "#0a0202", "#7a1818", "#ff3030", "#3d2e00", "#8c6914", "#e8b84b"
            ];
        }
        if (id == 19) {
            return [
                "#e3e5e4", "#100404", "#220808", "#f5d8d2", "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
                "#dc8e68", "#180806", "#0a0202", "#7a1818", "#ff3030", "#2a2a2a", "#707070", "#c0c0c0"
            ];
        }
        if (id == 20) {
            return [
                "#e3e5e4", "#100404", "#220808", "#f5d8d2", "#3a2a1c", "#6e3520", "#a05c3a", "#c47550",
                "#dc8e68", "#180806", "#0a0202", "#7a1818", "#ff3030", "#3d0a00", "#8c2200", "#d94f1e"
            ];
        }
        if (id == 21) {
            return [
                "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8", "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
                "#bc8e5a", "#1c2618", "#0a1006", "#5a6820", "#a8b830", "#3d2e00", "#8c6914", "#e8b84b"
            ];
        }
        if (id == 22) {
            return [
                "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8", "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
                "#bc8e5a", "#1c2618", "#0a1006", "#5a6820", "#a8b830", "#2a2a2a", "#707070", "#c0c0c0"
            ];
        }
        if (id == 23) {
            return [
                "#e3e5e4", "#0e1208", "#1c2515", "#ebe2c8", "#2a1c0a", "#553a20", "#8a6238", "#a87a4a",
                "#bc8e5a", "#1c2618", "#0a1006", "#5a6820", "#a8b830", "#3d0a00", "#8c2200", "#d94f1e"
            ];
        }
        if (id == 24) {
            return [
                "#e3e5e4", "#0f0c08", "#1e1a12", "#e8dfc8", "#1a1510", "#3d3428", "#6b5e4a", "#9a8a72",
                "#c8b89a", "#2a2218", "#0a0e08", "#4a7a20", "#8ac830", "#1a1510", "#4a3e2e", "#7a6a52"
            ];
        }

        return [
            "#e1e5e0", "#080704", "#1d1a05", "#c8c39b", "#2c280f", "#5e593d", "#877f51", "#9e9662",
            "#b8b17e", "#211e0c", "#131412", "#55523b", "#fdfbfb", "#383525", "#5d5840", "#b2ac78"
        ];
    }

    function _characterLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0 || value == 1) return "Human";
        if (value == 2) return "Alien";
        if (value == 3) return "Cat";
        if (value == 4) return "Agent";
        return "Human";
    }

    function _paletteName(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "SIGNAL";
        if (value == 1) return "ACID";
        if (value == 2) return "CYAN";
        if (value == 3) return "GHOST";
        if (value == 4) return "BLOOD";
        if (value == 5) return "MOSS";
        if (value == 6) return "SIGNAL_BLONDE";
        if (value == 7) return "SIGNAL_GREY";
        if (value == 8) return "SIGNAL_RED";
        if (value == 9) return "ACID_BLONDE";
        if (value == 10) return "ACID_GREY";
        if (value == 11) return "ACID_RED";
        if (value == 12) return "CYAN_BLONDE";
        if (value == 13) return "CYAN_GREY";
        if (value == 14) return "CYAN_RED";
        if (value == 15) return "GHOST_BLONDE";
        if (value == 16) return "GHOST_GREY";
        if (value == 17) return "GHOST_RED";
        if (value == 18) return "BLOOD_BLONDE";
        if (value == 19) return "BLOOD_GREY";
        if (value == 20) return "BLOOD_RED";
        if (value == 21) return "MOSS_BLONDE";
        if (value == 22) return "MOSS_GREY";
        if (value == 23) return "MOSS_RED";
        if (value == 24) return "CAT";
        if (value == 25) return "ALIEN";
        return "SIGNAL";
    }

    function _hoodLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Classic";
        return "None";
    }

    function _shirtLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Crew";
        if (value == 2) return "Tank";
        if (value == 3) return "Tank_Female";
        return "None";
    }

    function _bodyLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Default";
        if (value == 2) return "Female";
        if (value == 3) return "Female_Tank";
        if (value == 4) return "Alien";
        return "None";
    }

    function _bodytattooLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "UnderArmour";
        if (value == 2) return "AkuHeart";
        if (value == 3) return "Pyramid";
        if (value == 4) return "Normies";
        return "None";
    }

    function _necklaceLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Male_Chain";
        if (value == 2) return "Female_Chain";
        if (value == 3) return "Female_Ornate";
        if (value == 4) return "Female_Flower";
        if (value == 5) return "Female_UpsideDownCross";
        if (value == 6) return "Female_Opal";
        return "None";
    }

    function _tattooLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Signal";
        if (value == 2) return "Thug";
        if (value == 3) return "Marks";
        if (value == 4) return "Scar";
        return "None";
    }

    function _beardLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Full";
        if (value == 2) return "Goat";
        return "None";
    }

    function _mustacheLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Thick";
        return "None";
    }

    function _eyesLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "Signal";
        if (value == 1) return "Alien";
        return "Signal";
    }

    function _earringsLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Stud";
        return "None";
    }

    function _glassesLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Shades";
        if (value == 2) return "Neo";
        if (value == 3) return "VR";
        return "None";
    }

    function _hairLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "None";
        if (value == 1) return "Mohawk";
        if (value == 2) return "Pompadour";
        if (value == 3) return "MrT";
        if (value == 4) return "Afro";
        if (value == 5) return "Dreads";
        if (value == 6) return "Surfer";
        if (value == 7) return "FadeRight";
        return "None";
    }

    function _mutationLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0) return "Pristine";
        if (value == 1) return "Standard";
        if (value == 2) return "Drifted";
        if (value == 3) return "OffKilter";
        return "Standard";
    }
}
