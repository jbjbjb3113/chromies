# Chromies smart contracts

Generated from `contracts/` in the Chromies repo.
Solidity ^0.8.24 · Foundry · OpenZeppelin · Solady (SSTORE2)

## Contract index

- `IChromaStorage.sol`
- `IChromaRenderer.sol`
- `IChromaToken.sol`
- `IChromaCanvas.sol`
- `IChromaCanvasFinalize.sol`
- `IPixelCanvas.sol`
- `ChromaStorage.sol`
- `ChromaRendererSvgLib.sol`
- `ChromaRenderer.sol`
- `ChromaCanvas.sol`
- `ChromaCanvasV2.sol`
- `PixelMarketplace.sol`
- `Chroma.sol`

---

## IChromaStorage.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaStorage {
    function writeTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traits) external;

    function revealTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traits) external;

    function hasData(uint256 tokenId) external view returns (bool);

    function getPixels(uint256 tokenId) external view returns (bytes memory);

    function getTraits(uint256 tokenId) external view returns (bytes memory);

    function updateTrait(uint256 tokenId, uint256 traitIndex, uint8 value) external;

    function rewritePixels(uint256 tokenId, bytes calldata pixels, uint16 newTotalPixels) external;

    function getTotalPixels(uint256 tokenId) external view returns (uint256);
}
```

---

## IChromaRenderer.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaRenderer {
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
```

---

## IChromaToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IChromaToken is IERC721 {
    function isLocked(uint256 tokenId) external view returns (bool);

    function revealed(uint256 tokenId) external view returns (bool);

    function revealedTraits(uint256 tokenId) external view returns (bytes32);
}
```

---

## IChromaCanvas.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaCanvas {
    function getDiff(uint256 tokenId) external view returns (uint16[] memory pixelIndexes, uint8[] memory newColorIndexes);
    function level(uint256 tokenId) external view returns (uint256);
    /// @notice Lifetime-earn level: sqrt(totalApEarned / 50), uncapped. Separate from mutation tier.
    function getLevel(uint256 tokenId) external view returns (uint256);
    function totalApEarned(uint256 tokenId) external view returns (uint256);
    function getBurnCount(uint256 tokenId) external view returns (uint256);
    function isCustomized(uint256 tokenId) external view returns (bool);
    function getPixelsEdited(uint256 tokenId) external view returns (uint256);
    function getTotalPixels(uint256 tokenId) external view returns (uint256);
}
```

---

## IChromaCanvasFinalize.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaCanvasFinalize {
    function isCustomized(uint256 tokenId) external view returns (bool);

    function computeFinalPixels(uint256 tokenId) external view returns (bytes memory pixels, uint16 totalPixelCount);

    function clearDiffs(uint256 tokenId) external;
}
```

---

## IPixelCanvas.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPixelCanvas
/// @notice Shared interface for per-token Action Point (AP) systems.
///         Designed so both Chromies (ChromaCanvasV2) and Normies canvases can
///         implement it, and so external contracts (e.g. PixelMarketplace) can
///         operate against either collection without knowing its internals.
///
///         Core ideas:
///         - AP balances live on TOKENS, not wallets. AP follows the token on sale.
///         - `transferAP` is called by the owner of the source token.
///         - `operatorTransferAP` is called by an approved operator contract
///           (e.g. the marketplace) on behalf of a seller, enabling
///           non-custodial AP sales: AP stays in the seller token until the
///           moment of purchase.
interface IPixelCanvas {
    /// @notice Emitted whenever AP moves token-to-token (owner or operator initiated).
    event APTransferred(uint256 indexed fromTokenId, uint256 indexed toTokenId, uint256 amount);

    /// @notice Current spendable AP balance of a token.
    function actionPoints(uint256 tokenId) external view returns (uint256);

    /// @notice Lifetime AP spent by a token (drives level).
    function totalApSpent(uint256 tokenId) external view returns (uint256);

    /// @notice Token level: totalApSpent / 100 + 1.
    function level(uint256 tokenId) external view returns (uint256);

    /// @notice Owner of the underlying NFT. Named to avoid clashing with ERC721 ownerOf
    ///         when a canvas and token live in the same contract.
    function ownerOfToken(uint256 tokenId) external view returns (address);

    /// @notice Move AP between tokens. Caller MUST own `fromTokenId`.
    function transferAP(uint256 fromTokenId, uint256 toTokenId, uint256 amount) external;

    /// @notice Move AP between tokens on behalf of `fromOwner`. Caller MUST be an
    ///         operator approved by the canvas (e.g. the marketplace), and
    ///         `fromOwner` MUST own `fromTokenId` at call time.
    function operatorTransferAP(address fromOwner, uint256 fromTokenId, uint256 toTokenId, uint256 amount) external;
}
```

---

## ChromaStorage.sol

```solidity
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

    error InvalidTotalPixelsCount();



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

    // [15] Mutation tier: 0=Pristine, 1=Standard, 2=Drifted, 3=OffKilter

    // [16] Drift tier: 0=Pristine, 1=Standard, 2=Drifted, 3=OffKilter

    // [17] Total Pixels (uint16 high byte) — pipeline-computed non-zero nibble count

    // [18] Total Pixels (uint16 low byte)

    // [19-31] Reserved for future traits

    uint256 internal constant TRAITS_LENGTH = 32;

    address public writer;

    address public traitUpdater;



    mapping(uint256 tokenId => address) public pixelPointers;

    mapping(uint256 tokenId => bytes32) public traits;

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



    function revealTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traitBytes) external {

        if (msg.sender != writer) revert UnauthorizedWriter();

        if (pixels.length != PIXELS_LENGTH) revert InvalidPixelsLength();

        if (traitBytes.length != TRAITS_LENGTH) revert InvalidTraitsLength();

        if (pixelPointers[tokenId] == address(0)) revert TokenNotWritten();



        pixelPointers[tokenId] = SSTORE2.write(pixels);

        traits[tokenId] = bytes32(traitBytes);

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



    function updateTrait(uint256 tokenId, uint256 traitIndex, uint8 value) external override {

        if (msg.sender != traitUpdater) revert UnauthorizedTraitUpdater();

        if (traitIndex >= TRAITS_LENGTH) revert InvalidTraitIndex();

        if (pixelPointers[tokenId] == address(0)) revert TokenNotWritten();



        bytes memory traitBytes = abi.encodePacked(traits[tokenId]);

        traitBytes[traitIndex] = bytes1(value);

        traits[tokenId] = bytes32(traitBytes);

        totalPixels[tokenId] = _totalPixelsFromTraitsMemory(traitBytes);

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

    function _totalPixelsFromTraitsMemory(bytes memory traitBytes) internal pure returns (uint256 count) {

        count = (uint256(uint8(traitBytes[17])) << 8) | uint256(uint8(traitBytes[18]));

        if (count > 4096) revert InvalidTotalPixelsCount();

    }

}
```

---

## ChromaRendererSvgLib.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

library ChromaRendererSvgLib {
    using Strings for uint256;

    uint256 internal constant GRID = 64;
    uint256 internal constant CELL = 16;
    uint256 internal constant MAX_RECTS = 4096;
    uint256 internal constant MAX_RECT_BYTES = 128;

    struct SvgRenderContext {
        uint256 tokenId;
        bytes pixels;
        string[16] palette;
        uint16[] diffIndexes;
        uint8[] diffColors;
        uint8 mutationTier;
    }

    function buildBody(SvgRenderContext memory ctx) internal pure returns (bytes memory) {
        bytes memory body = new bytes(MAX_RECTS * MAX_RECT_BYTES);
        uint256 written = _writeSvgBody(body, 0, ctx);
        assembly ("memory-safe") {
            mstore(body, written)
        }
        return body;
    }

    function wrapSvg(string memory background, bytes memory body) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><rect width="1024" height="1024" fill="',
                background,
                '"/>',
                body,
                "</svg>"
            )
        );
    }

    function _writeSvgBody(bytes memory body, uint256 offset, SvgRenderContext memory ctx)
        private
        pure
        returns (uint256)
    {
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint256 flatIndex = y * GRID + x;
                uint8 idx = _getCompositePixelIndex(ctx.pixels, x, y, ctx.diffIndexes, ctx.diffColors);
                if (ctx.mutationTier != 0) {
                    idx = _mutatePixelIndex(ctx.tokenId, flatIndex, idx, ctx.mutationTier);
                }

                uint256 run = 1;
                while (x + run < GRID) {
                    uint256 nextFlat = y * GRID + x + run;
                    uint8 nextIdx = _getCompositePixelIndex(ctx.pixels, x + run, y, ctx.diffIndexes, ctx.diffColors);
                    if (ctx.mutationTier != 0) {
                        nextIdx = _mutatePixelIndex(ctx.tokenId, nextFlat, nextIdx, ctx.mutationTier);
                    }
                    if (nextIdx != idx) break;
                    ++run;
                }

                if (idx != 0) {
                    offset = _appendRect(body, offset, x, y, run, ctx.palette[idx]);
                }
                x += run;
            }
        }
        return offset;
    }

    function _appendRect(
        bytes memory body,
        uint256 offset,
        uint256 x,
        uint256 y,
        uint256 run,
        string memory color
    ) private pure returns (uint256) {
        bytes memory rect = abi.encodePacked(
            '<rect x="',
            (x * CELL).toString(),
            '" y="',
            (y * CELL).toString(),
            '" width="',
            (run * CELL).toString(),
            '" height="16" fill="',
            color,
            '"/>'
        );
        _copyBytes(body, offset, rect);
        return offset + rect.length;
    }

    function _copyBytes(bytes memory dest, uint256 destOffset, bytes memory src) private pure {
        uint256 n = src.length;
        for (uint256 i = 0; i < n; ++i) {
            dest[destOffset + i] = src[i];
        }
    }

    function _getPixelIndex(bytes memory pixels, uint256 x, uint256 y) private pure returns (uint8) {
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
    ) private pure returns (uint8) {
        uint16 flatIndex = uint16(y * GRID + x);
        for (uint256 i = diffIndexes.length; i > 0; --i) {
            uint256 idx = i - 1;
            if (diffIndexes[idx] == flatIndex) return diffColors[idx];
        }
        return _getPixelIndex(pixels, x, y);
    }

    function _mutationSwapThreshold(uint8 tier) private pure returns (uint8) {
        if (tier == 1) return 5;
        if (tier == 2) return 10;
        if (tier == 3) return 20;
        return 0;
    }

    function _mutatePixelIndex(uint256 tokenId, uint256 pixelIndex, uint8 paletteIndex, uint8 tier)
        private
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
}
```

---

## ChromaRenderer.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChromaCanvas} from "./IChromaCanvas.sol";
import {IChromaStorage} from "./IChromaStorage.sol";
import {IChromaToken} from "./IChromaToken.sol";
import {ChromaRendererSvgLib} from "./ChromaRendererSvgLib.sol";

contract ChromaRenderer is Ownable {
    using Strings for uint256;

    IChromaStorage public immutable chromaStorage;
    IChromaCanvas public chromaCanvas;
    IChromaToken public chroma;

    constructor(address storageAddress, address initialOwner) Ownable(initialOwner) {
        chromaStorage = IChromaStorage(storageAddress);
    }

    function setCanvas(address canvasAddress) external onlyOwner {
        chromaCanvas = IChromaCanvas(canvasAddress);
    }

    function setChroma(address chromaAddress) external onlyOwner {
        chroma = IChromaToken(chromaAddress);
    }

    function renderSVG(uint256 tokenId) public view returns (string memory) {
        ChromaRendererSvgLib.SvgRenderContext memory ctx = _loadSvgContext(tokenId);
        bytes memory body = ChromaRendererSvgLib.buildBody(ctx);
        return ChromaRendererSvgLib.wrapSvg(ctx.palette[0], body);
    }

    function _loadSvgContext(uint256 tokenId)
        internal
        view
        returns (ChromaRendererSvgLib.SvgRenderContext memory ctx)
    {
        ctx.tokenId = tokenId;
        bytes memory traits = chromaStorage.getTraits(tokenId);
        ctx.pixels = chromaStorage.getPixels(tokenId);
        ctx.palette = _paletteForToken(traits);
        (ctx.diffIndexes, ctx.diffColors) = _getDiff(tokenId);
        ctx.mutationTier = uint8(traits[15]);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        bytes memory traits = chromaStorage.getTraits(tokenId);
        string memory svg = renderSVG(tokenId);
        bytes memory json = _encodeTokenJson(tokenId, traits, svg);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    function _encodeTokenJson(uint256 tokenId, bytes memory traits, string memory svg)
        internal
        view
        returns (bytes memory)
    {
        string memory image = string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));
        bytes memory coreTraits = abi.encodePacked(
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
            _jsonAttribute("Tattoo", _tattooLabel(uint8(traits[7])))
        );
        bytes memory faceTraits = abi.encodePacked(
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
            _jsonAttribute("Mutation", _mutationLabel(uint8(traits[15])))
        );

        return abi.encodePacked(
            '{"name":"Chroma #',
            tokenId.toString(),
            '","description":"Chroma is a fully on-chain 64x64 indexed-color NFT.","image":"',
            image,
            '","attributes":[',
            coreTraits,
            faceTraits,
            _levelAttribute(tokenId),
            _burnCountAttribute(tokenId),
            _customizedAttribute(tokenId),
            _pixelsEditedAttribute(tokenId),
            _totalPixelsAttribute(tokenId),
            _statusAttribute(tokenId),
            ']}'
        );
    }

    function _getDiff(uint256 tokenId) internal view returns (uint16[] memory diffIndexes, uint8[] memory diffColors) {
        if (address(chromaCanvas) == address(0)) return (new uint16[](0), new uint8[](0));
        return chromaCanvas.getDiff(tokenId);
    }

    function _statusAttribute(uint256 tokenId) internal view returns (string memory) {
        if (address(chroma) == address(0) || !chroma.isLocked(tokenId)) return "";
        return string(abi.encodePacked(",", _jsonAttribute("Status", "Inscribed")));
    }

    function _levelAttribute(uint256 tokenId) internal view returns (string memory) {
        uint256 levelValue = 0;
        if (address(chromaCanvas) != address(0)) {
            levelValue = chromaCanvas.getLevel(tokenId);
        }
        return string(abi.encodePacked(",", _jsonNumberAttribute("Level", levelValue)));
    }

    function _burnCountAttribute(uint256 tokenId) internal view returns (string memory) {
        uint256 burnValue = 0;
        if (address(chromaCanvas) != address(0)) {
            burnValue = chromaCanvas.getBurnCount(tokenId);
        }
        return string(abi.encodePacked(",", _jsonNumberAttribute("Burns Absorbed", burnValue)));
    }

    function _customizedAttribute(uint256 tokenId) internal view returns (string memory) {
        if (address(chromaCanvas) == address(0) || !chromaCanvas.isCustomized(tokenId)) return "";
        return string(abi.encodePacked(",", _jsonAttribute("Customized", "Yes")));
    }

    function _pixelsEditedAttribute(uint256 tokenId) internal view returns (string memory) {
        uint256 edited = 0;
        if (address(chromaCanvas) != address(0)) {
            edited = chromaCanvas.getPixelsEdited(tokenId);
        }
        if (edited == 0) return "";
        return string(abi.encodePacked(",", _jsonNumberAttribute("Pixels Edited", edited)));
    }

    function _totalPixelsAttribute(uint256 tokenId) internal view returns (string memory) {
        return string(abi.encodePacked(",", _jsonNumberAttribute("Total Pixels", chromaStorage.getTotalPixels(tokenId))));
    }

    function _jsonAttribute(string memory traitType, string memory value) internal pure returns (string memory) {
        return string(abi.encodePacked('{"trait_type":"', traitType, '","value":"', value, '"}'));
    }

    function _jsonNumberAttribute(string memory traitType, uint256 value) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '{"display_type":"number","trait_type":"', traitType, '","value":', value.toString(), "}"
            )
        );
    }

    function _paletteForToken(bytes memory traits) internal pure returns (string[16] memory palette) {
        return _paletteColors(uint8(traits[1]));
    }

    function _paletteColors(uint8 paletteId) internal pure returns (string[16] memory palette) {
        if (paletteId == 26) {
            return [
                "#e3e5e4", "#0e0d08", "#27261d", "#481213", "#403e31", "#61472f", "#535342", "#646451",
                "#76745b", "#7f7e7a", "#a0855a", "#858869", "#999c81", "#adb195", "#c2c4ba", "#c2c4ba"
            ];
        }
        if (paletteId == 27) {
            return [
                "#e8e0c8", "#3d2e00", "#5c4600", "#fff8e0", "#7a5c00", "#a07800", "#c49a00", "#d4aa00",
                "#e8c840", "#c49a00", "#5c4400", "#c8960a", "#ffd700", "#9a7400", "#b08800", "#e8c020"
            ];
        }
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
        if (value == 8) return "Zombie";
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
        if (value == 26) return "ZOMBIE";
        if (value == 27) return "GOLD";
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
```

---

## ChromaCanvas.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChromaStorage} from "./IChromaStorage.sol";
import {IChromaToken} from "./IChromaToken.sol";

contract ChromaCanvas is Ownable {
    error NotTokenOwner();
    error InvalidDiffEncoding();
    error PixelIndexOutOfRange();
    error InsufficientActionPoints();
    error MissingCommit();
    error InvalidReveal();
    error InvalidMutationShift();
    error InvalidMutationTier();
    error InvalidTransfer();
    error TokenLocked();
    error NotInscribed();

    uint256 internal constant GRID_PIXELS = 4096;
    uint256 internal constant TRAIT_MUTATION_INDEX = 15;
    uint256 public constant ACTION_POINTS_PER_BURN = 100;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    struct PendingCommit {
        bytes32 commitment;
        bool exists;
    }

    struct CanvasEdit {
        uint16 pixelIndex;
        uint8 newColorIndex;
    }

    IChromaToken public immutable chroma;
    IChromaStorage public immutable chromaStorage;
    mapping(address user => uint256 points) public actionPoints;
    mapping(address user => PendingCommit) public pendingCommit;
    mapping(uint256 tokenId => CanvasEdit[]) internal tokenDiffs;
    mapping(uint256 tokenId => uint256 apSpent) public totalApSpent;

    event CommitSubmitted(address indexed user, bytes32 indexed commitment);
    event BurnRevealed(address indexed user, uint256 indexed burnedTokenId, uint256 actionPointsAwarded);
    event DiffApplied(address indexed user, uint256 indexed tokenId, uint256 entriesApplied);
    event MutationTierShifted(uint256 indexed tokenId, uint8 oldTier, uint8 newTier);
    event ActionPointsTransferred(address indexed from, address indexed to, uint256 amount);

    constructor(address chromaAddress, address storageAddress, address initialOwner) Ownable(initialOwner) {
        chroma = IChromaToken(chromaAddress);
        chromaStorage = IChromaStorage(storageAddress);
    }

    function submitCommit(bytes32 commitment) external {
        pendingCommit[msg.sender] = PendingCommit({commitment: commitment, exists: true});
        emit CommitSubmitted(msg.sender, commitment);
    }

    function revealBurnAndApplyDiff(uint256 tokenId, uint256 burnedTokenId, bytes32 salt, bytes calldata diffData) external {
        PendingCommit memory commit = pendingCommit[msg.sender];
        if (!commit.exists) revert MissingCommit();

        bytes32 revealHash = keccak256(abi.encode(msg.sender, tokenId, burnedTokenId, diffData, salt));
        if (revealHash != commit.commitment) revert InvalidReveal();
        delete pendingCommit[msg.sender];

        if (chroma.ownerOf(burnedTokenId) != msg.sender) revert NotTokenOwner();
        chroma.transferFrom(msg.sender, DEAD_ADDRESS, burnedTokenId);

        uint256 burnYield = _burnYield(burnedTokenId);
        actionPoints[msg.sender] += burnYield;
        emit BurnRevealed(msg.sender, burnedTokenId, burnYield);

        if (chroma.isLocked(tokenId)) revert TokenLocked();

        if (diffData.length > 0) {
            _applyDiff(tokenId, diffData, msg.sender);
        }
    }

    function applyDiff(uint256 tokenId, bytes calldata diffData) external {
        _applyDiff(tokenId, diffData, msg.sender);
    }

    function shiftMutationTier(uint256 tokenId, uint8 newTier) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (chroma.isLocked(tokenId)) revert TokenLocked();
        if (!chromaStorage.hasData(tokenId)) revert NotInscribed();
        if (newTier > 3) revert InvalidMutationTier();

        bytes memory traits = chromaStorage.getTraits(tokenId);
        uint8 currentTier = uint8(traits[TRAIT_MUTATION_INDEX]);
        uint256 cost = _mutationShiftCost(currentTier, newTier);
        if (actionPoints[msg.sender] < cost) revert InsufficientActionPoints();

        actionPoints[msg.sender] -= cost;
        totalApSpent[tokenId] += cost;
        chromaStorage.updateTrait(tokenId, TRAIT_MUTATION_INDEX, newTier);
        emit MutationTierShifted(tokenId, currentTier, newTier);
    }

    function level(uint256 tokenId) public view returns (uint256) {
        return totalApSpent[tokenId] / 100 + 1;
    }

    /// @dev V1 legacy canvas — earn-based level lives on ChromaCanvasV2.
    function getLevel(uint256) external pure returns (uint256) {
        return 0;
    }

    function totalApEarned(uint256) external pure returns (uint256) {
        return 0;
    }

    function transferActionPoints(address to, uint256 amount) external {
        if (to == address(0)) revert InvalidTransfer();
        if (actionPoints[msg.sender] < amount) revert InsufficientActionPoints();

        actionPoints[msg.sender] -= amount;
        actionPoints[to] += amount;
        emit ActionPointsTransferred(msg.sender, to, amount);
    }

    function getDiff(uint256 tokenId) external view returns (uint16[] memory pixelIndexes, uint8[] memory newColorIndexes) {
        CanvasEdit[] storage edits = tokenDiffs[tokenId];
        pixelIndexes = new uint16[](edits.length);
        newColorIndexes = new uint8[](edits.length);
        for (uint256 i = 0; i < edits.length; ++i) {
            pixelIndexes[i] = edits[i].pixelIndex;
            newColorIndexes[i] = edits[i].newColorIndex;
        }
    }

    function getBurnCount(uint256) external pure returns (uint256) {
        return 0;
    }

    function isCustomized(uint256) external pure returns (bool) {
        return false;
    }

    function getPixelsEdited(uint256) external pure returns (uint256) {
        return 0;
    }

    function getTotalPixels(uint256) external pure returns (uint256) {
        return 0;
    }

    function getCanvasInfo(address user, uint256 tokenId)
        external
        view
        returns (uint256 points, uint256 diffCount, bool customized, bool hasPendingCommit)
    {
        points = actionPoints[user];
        diffCount = tokenDiffs[tokenId].length;
        customized = diffCount > 0;
        hasPendingCommit = pendingCommit[user].exists;
    }

    function _burnYield(uint256 tokenId) internal view returns (uint256) {
        uint256 bonus = tokenDiffs[tokenId].length / 10;
        return ACTION_POINTS_PER_BURN + bonus;
    }

    function _mutationShiftCost(uint8 currentTier, uint8 newTier) internal pure returns (uint256) {
        if (newTier >= currentTier) revert InvalidMutationShift();
        if (currentTier == 3 && newTier == 2) return 500;
        if (currentTier == 2 && newTier == 1) return 1500;
        if (currentTier == 1 && newTier == 0) return 5000;
        revert InvalidMutationShift();
    }

    function _applyDiff(uint256 tokenId, bytes calldata diffData, address user) internal {
        if (chroma.isLocked(tokenId)) revert TokenLocked();
        if (diffData.length == 0 || diffData.length % 3 != 0) revert InvalidDiffEncoding();
        uint256 entryCount = diffData.length / 3;
        if (actionPoints[user] < entryCount) revert InsufficientActionPoints();

        for (uint256 i = 0; i < entryCount; ++i) {
            uint256 offset = i * 3;
            uint16 pixelIndex = (uint16(uint8(diffData[offset])) << 8) | uint16(uint8(diffData[offset + 1]));
            uint8 newColorIndex = uint8(diffData[offset + 2]);
            if (pixelIndex >= GRID_PIXELS) revert PixelIndexOutOfRange();
            if (newColorIndex > 15) revert InvalidDiffEncoding();
            tokenDiffs[tokenId].push(CanvasEdit({pixelIndex: pixelIndex, newColorIndex: newColorIndex}));
        }

        actionPoints[user] -= entryCount;
        totalApSpent[tokenId] += entryCount;
        emit DiffApplied(user, tokenId, entryCount);
    }
}
```

---

## ChromaCanvasV2.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IChromaStorage} from "./IChromaStorage.sol";
import {IChromaToken} from "./IChromaToken.sol";
import {IPixelCanvas} from "./IPixelCanvas.sol";
import {IChromaCanvasFinalize} from "./IChromaCanvasFinalize.sol";

/// @title ChromaCanvasV2 — DRAFT
/// @notice Refactor of ChromaCanvas with PER-TOKEN Action Points.
///         V1 held AP per wallet; V2 holds AP per token so AP travels with the
///         NFT on sale and can be traded token-to-token via PixelMarketplace.
///
///         Key differences vs V1:
///         - `actionPoints` is keyed by tokenId, not address.
///         - Burn yield is credited to a destination token (the kept token in
///           `revealBurnAndApplyDiff`), not the burner's wallet.
///         - Spending a token's AP (edits, tier shifts, `spendAP`) requires
///           owning that token.
///         - Implements IPixelCanvas: marketplace-driven transfers go through
///           `operatorTransferAP`, gated by owner-approved operator contracts.
contract ChromaCanvasV2 is Ownable, IPixelCanvas, IChromaCanvasFinalize {
    error NotTokenOwner();
    error NotApprovedOperator();
    error InvalidDiffEncoding();
    error PixelIndexOutOfRange();
    error InsufficientActionPoints();
    error MissingCommit();
    error InvalidReveal();
    error InvalidMutationShift();
    error InvalidMutationTier();
    error InvalidTransfer();
    error TokenLocked();
    error UnauthorizedChromaCaller();
    error NotInscribed();

    uint256 internal constant GRID_PIXELS = 4096;
    uint256 internal constant TRAIT_MUTATION_INDEX = 15;
    uint256 public constant TIER1_THRESHOLD = 1500;
    uint256 public constant TIER2_THRESHOLD = 2000;
    uint256 public constant TIER1_MIN_PERCENT = 1;
    uint256 public constant TIER2_MIN_PERCENT = 2;
    uint256 public constant TIER3_MIN_PERCENT = 3;
    uint256 public constant MAX_BURN_PERCENT = 4;
    /// @notice AP earned per level² unit in `getLevel()` (Level N requires N² × divisor lifetime AP).
    uint256 public constant LEVEL_AP_DIVISOR = 50;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    struct PendingCommit {
        bytes32 commitment;
        bool exists;
    }

    struct CanvasEdit {
        uint16 pixelIndex;
        uint8 newColorIndex;
    }

    IChromaToken public immutable chroma;
    IChromaStorage public immutable chromaStorage;

    /// @inheritdoc IPixelCanvas
    mapping(uint256 tokenId => uint256 points) public actionPoints;
    /// @inheritdoc IPixelCanvas
    mapping(uint256 tokenId => uint256 apSpent) public totalApSpent;
    /// @notice Lifetime AP ever earned per token (never decremented on spend or transfer).
    mapping(uint256 tokenId => uint256 earned) public totalApEarned;
    mapping(uint256 tokenId => uint256 count) public burnCount;
    mapping(uint256 tokenId => bool) public customized;
    mapping(uint256 tokenId => uint256) public pixelsEdited;

    mapping(address user => PendingCommit) public pendingCommit;
    mapping(uint256 tokenId => CanvasEdit[]) internal tokenDiffs;
    /// @notice Operator contracts (e.g. PixelMarketplace) allowed to move AP on sellers' behalf.
    mapping(address operator => bool approved) public approvedOperators;

    event CommitSubmitted(address indexed user, bytes32 indexed commitment);
    event BurnRevealed(address indexed user, uint256 indexed burnedTokenId, uint256 indexed creditedTokenId, uint256 actionPointsAwarded);
    event DiffApplied(address indexed user, uint256 indexed tokenId, uint256 entriesApplied);
    event MutationTierShifted(uint256 indexed tokenId, uint8 oldTier, uint8 newTier);
    event APEarned(uint256 indexed tokenId, uint256 amount);
    event APSpent(uint256 indexed tokenId, uint256 amount);
    event OperatorApprovalSet(address indexed operator, bool approved);

    constructor(address chromaAddress, address storageAddress, address initialOwner) Ownable(initialOwner) {
        chroma = IChromaToken(chromaAddress);
        chromaStorage = IChromaStorage(storageAddress);
    }

    // ========================================================================
    // IPixelCanvas
    // ========================================================================

    /// @inheritdoc IPixelCanvas
    function level(uint256 tokenId) public view returns (uint256) {
        return totalApSpent[tokenId] / 100 + 1;
    }

    /// @inheritdoc IPixelCanvas
    function ownerOfToken(uint256 tokenId) public view returns (address) {
        return chroma.ownerOf(tokenId);
    }

    /// @inheritdoc IPixelCanvas
    function transferAP(uint256 fromTokenId, uint256 toTokenId, uint256 amount) external {
        if (chroma.ownerOf(fromTokenId) != msg.sender) revert NotTokenOwner();
        _transferAP(fromTokenId, toTokenId, amount);
    }

    /// @inheritdoc IPixelCanvas
    function operatorTransferAP(address fromOwner, uint256 fromTokenId, uint256 toTokenId, uint256 amount) external {
        if (!approvedOperators[msg.sender]) revert NotApprovedOperator();
        if (chroma.ownerOf(fromTokenId) != fromOwner) revert NotTokenOwner();
        _transferAP(fromTokenId, toTokenId, amount);
    }

    // ========================================================================
    // AP economy
    // ========================================================================

    /// @notice Admin AP grant (promotions, migrations from V1 balances, etc).
    ///         Organic earning happens through the burn flow below.
    function earnAP(uint256 tokenId, uint256 amount) external onlyOwner {
        chroma.ownerOf(tokenId); // reverts for nonexistent token
        _earnAP(tokenId, amount);
    }

    /// @notice Spend a token's AP without an edit (levels the token up).
    ///         Caller must own the token.
    function spendAP(uint256 tokenId, uint256 amount) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _spendAP(tokenId, amount);
    }

    /// @notice Approve/revoke an operator contract (e.g. PixelMarketplace).
    function setOperatorApproval(address operator, bool approved) external onlyOwner {
        approvedOperators[operator] = approved;
        emit OperatorApprovalSet(operator, approved);
    }

    // ========================================================================
    // Burn + canvas flows (adapted from V1)
    // ========================================================================

    function submitCommit(bytes32 commitment) external {
        pendingCommit[msg.sender] = PendingCommit({commitment: commitment, exists: true});
        emit CommitSubmitted(msg.sender, commitment);
    }

    /// @notice Reveal a committed burn. Burn yield is credited to `tokenId`
    ///         (the kept token), then the optional diff is applied using that
    ///         token's AP. Caller must own both tokens.
    function revealBurnAndApplyDiff(uint256 tokenId, uint256 burnedTokenId, bytes32 salt, bytes calldata diffData) external {
        PendingCommit memory commit = pendingCommit[msg.sender];
        if (!commit.exists) revert MissingCommit();

        bytes32 revealHash = keccak256(abi.encode(msg.sender, tokenId, burnedTokenId, diffData, salt));
        if (revealHash != commit.commitment) revert InvalidReveal();
        delete pendingCommit[msg.sender];

        if (chroma.ownerOf(burnedTokenId) != msg.sender) revert NotTokenOwner();
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        chroma.transferFrom(msg.sender, DEAD_ADDRESS, burnedTokenId);

        uint256 burnYield = calculateBurnAP(burnedTokenId);
        _earnAP(tokenId, burnYield);
        burnCount[tokenId] += 1;
        emit BurnRevealed(msg.sender, burnedTokenId, tokenId, burnYield);

        if (chroma.isLocked(tokenId)) revert TokenLocked();

        if (diffData.length > 0) {
            _applyDiff(tokenId, diffData, msg.sender);
        }
    }

    /// @notice Apply pixel edits to a token, spending that token's own AP.
    ///         Caller must own the token.
    function applyDiff(uint256 tokenId, bytes calldata diffData) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _applyDiff(tokenId, diffData, msg.sender);
    }

    /// @notice Shift mutation tier toward Pristine, spending the token's own AP.
    ///         Requires on-chain inscription — pre-inscribe shifts would break the merkle leaf.
    function shiftMutationTier(uint256 tokenId, uint8 newTier) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (chroma.isLocked(tokenId)) revert TokenLocked();
        if (!chromaStorage.hasData(tokenId)) revert NotInscribed();
        if (newTier > 3) revert InvalidMutationTier();

        bytes memory traits = chromaStorage.getTraits(tokenId);
        uint8 currentTier = uint8(traits[TRAIT_MUTATION_INDEX]);
        uint256 cost = _mutationShiftCost(currentTier, newTier);

        _spendAP(tokenId, cost);
        chromaStorage.updateTrait(tokenId, TRAIT_MUTATION_INDEX, newTier);
        emit MutationTierShifted(tokenId, currentTier, newTier);
    }

    // ========================================================================
    // Views
    // ========================================================================

    function getDiff(uint256 tokenId) external view returns (uint16[] memory pixelIndexes, uint8[] memory newColorIndexes) {
        CanvasEdit[] storage edits = tokenDiffs[tokenId];
        pixelIndexes = new uint16[](edits.length);
        newColorIndexes = new uint8[](edits.length);
        for (uint256 i = 0; i < edits.length; ++i) {
            pixelIndexes[i] = edits[i].pixelIndex;
            newColorIndexes[i] = edits[i].newColorIndex;
        }
    }

    function getBurnCount(uint256 tokenId) external view returns (uint256) {
        return burnCount[tokenId];
    }

    function isCustomized(uint256 tokenId) external view returns (bool) {
        return customized[tokenId];
    }

    function getPixelsEdited(uint256 tokenId) external view returns (uint256) {
        return pixelsEdited[tokenId];
    }

    function getTotalPixels(uint256 tokenId) external view returns (uint256) {
        return chromaStorage.getTotalPixels(tokenId);
    }

    /// @notice Uncapped activity level from lifetime AP earned (sqrt curve, separate from mutation tier).
    function getLevel(uint256 tokenId) public view returns (uint256) {
        uint256 earned = totalApEarned[tokenId];
        if (earned == 0) return 0;
        return Math.sqrt(earned / LEVEL_AP_DIVISOR);
    }

    /// @notice Tiered burn yield from the sacrificed token's pixel count.
    ///         Uses on-chain storage when inscribed; otherwise revealedTraits snapshot.
    function calculateBurnAP(uint256 burnTokenId) public view returns (uint256) {
        uint256 pixels = _sacrificePixelCount(burnTokenId);
        if (pixels == 0) return 0;

        uint256 percent;
        if (pixels < TIER1_THRESHOLD) {
            percent = TIER1_MIN_PERCENT;
        } else if (pixels < TIER2_THRESHOLD) {
            percent = TIER2_MIN_PERCENT;
        } else {
            percent = TIER3_MIN_PERCENT;
        }

        uint256 ap = (pixels * percent) / 100;
        uint256 maxAp = (pixels * MAX_BURN_PERCENT) / 100;
        return ap > maxAp ? maxAp : ap;
    }

    function getCanvasInfo(address user, uint256 tokenId)
        external
        view
        returns (uint256 points, uint256 diffCount, bool tokenCustomized, bool hasPendingCommit)
    {
        points = actionPoints[tokenId];
        diffCount = tokenDiffs[tokenId].length;
        tokenCustomized = customized[tokenId];
        hasPendingCommit = pendingCommit[user].exists;
    }

    /// @inheritdoc IChromaCanvasFinalize
    function computeFinalPixels(uint256 tokenId) external view returns (bytes memory pixels, uint16 totalPixelCount) {
        pixels = chromaStorage.getPixels(tokenId);
        CanvasEdit[] storage edits = tokenDiffs[tokenId];
        for (uint256 i = 0; i < edits.length; ++i) {
            _setPackedPixel(pixels, edits[i].pixelIndex, edits[i].newColorIndex);
        }
        totalPixelCount = uint16(_countNonZeroPixels(pixels));
    }

    /// @inheritdoc IChromaCanvasFinalize
    function clearDiffs(uint256 tokenId) external {
        if (msg.sender != address(chroma)) revert UnauthorizedChromaCaller();
        delete tokenDiffs[tokenId];
    }

    // ========================================================================
    // Internals
    // ========================================================================

    function _sacrificePixelCount(uint256 burnTokenId) internal view returns (uint256) {
        if (chromaStorage.hasData(burnTokenId)) {
            return chromaStorage.getTotalPixels(burnTokenId);
        }
        if (!chroma.revealed(burnTokenId)) return 0;

        bytes32 traits = chroma.revealedTraits(burnTokenId);
        if (traits == bytes32(0)) return 0;

        return (uint256(uint8(traits[17])) << 8) | uint256(uint8(traits[18]));
    }

    function _earnAP(uint256 tokenId, uint256 amount) internal {
        actionPoints[tokenId] += amount;
        totalApEarned[tokenId] += amount;
        emit APEarned(tokenId, amount);
    }

    function _spendAP(uint256 tokenId, uint256 amount) internal {
        if (actionPoints[tokenId] < amount) revert InsufficientActionPoints();
        actionPoints[tokenId] -= amount;
        totalApSpent[tokenId] += amount;
        emit APSpent(tokenId, amount);
    }

    function _transferAP(uint256 fromTokenId, uint256 toTokenId, uint256 amount) internal {
        if (fromTokenId == toTokenId) revert InvalidTransfer();
        chroma.ownerOf(toTokenId); // reverts for nonexistent destination
        if (actionPoints[fromTokenId] < amount) revert InsufficientActionPoints();

        actionPoints[fromTokenId] -= amount;
        actionPoints[toTokenId] += amount;
        emit APTransferred(fromTokenId, toTokenId, amount);
    }

    function _mutationShiftCost(uint8 currentTier, uint8 newTier) internal pure returns (uint256) {
        if (newTier >= currentTier) revert InvalidMutationShift();
        if (currentTier == 3 && newTier == 2) return 500;
        if (currentTier == 2 && newTier == 1) return 1500;
        if (currentTier == 1 && newTier == 0) return 5000;
        revert InvalidMutationShift();
    }

    function _applyDiff(uint256 tokenId, bytes calldata diffData, address user) internal {
        if (chroma.isLocked(tokenId)) revert TokenLocked();
        if (diffData.length == 0 || diffData.length % 3 != 0) revert InvalidDiffEncoding();
        uint256 entryCount = diffData.length / 3;

        for (uint256 i = 0; i < entryCount; ++i) {
            uint256 offset = i * 3;
            uint16 pixelIndex = (uint16(uint8(diffData[offset])) << 8) | uint16(uint8(diffData[offset + 1]));
            uint8 newColorIndex = uint8(diffData[offset + 2]);
            if (pixelIndex >= GRID_PIXELS) revert PixelIndexOutOfRange();
            if (newColorIndex > 15) revert InvalidDiffEncoding();
            tokenDiffs[tokenId].push(CanvasEdit({pixelIndex: pixelIndex, newColorIndex: newColorIndex}));
        }

        if (entryCount > 0) {
            customized[tokenId] = true;
            pixelsEdited[tokenId] += entryCount;
        }

        _spendAP(tokenId, entryCount);
        emit DiffApplied(user, tokenId, entryCount);
    }

    function _setPackedPixel(bytes memory pixels, uint256 flatIndex, uint8 value) internal pure {
        uint256 byteIndex = flatIndex >> 1;
        uint8 current = uint8(pixels[byteIndex]);
        if ((flatIndex & 1) == 0) {
            pixels[byteIndex] = bytes1((current & 0x0f) | (value << 4));
        } else {
            pixels[byteIndex] = bytes1((current & 0xf0) | value);
        }
    }

    /// @dev Count loop lives on canvas bake path only (customized inscribe), not on reveal.
    function _countNonZeroPixels(bytes memory pixels) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < GRID_PIXELS; ++i) {
            uint8 packed = uint8(pixels[i >> 1]);
            uint8 idx = (i & 1) == 0 ? packed >> 4 : packed & 0x0f;
            if (idx != 0) {
                ++count;
            }
        }
    }
}
```

---

## PixelMarketplace.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPixelCanvas} from "./IPixelCanvas.sol";

/// @title PixelMarketplace
/// @notice Minimal, non-custodial marketplace for per-token Action Points.
///         Works with any contract implementing IPixelCanvas (Chromies, Normies).
///
///         Flow:
///         1. Seller lists AP held by their token at an ETH price.
///            AP is NOT escrowed — it stays in the seller token.
///         2. Buyer calls `buy` with a destination token they own and exact ETH.
///            AP moves seller-token -> buyer-token via `operatorTransferAP`
///            (this contract must be an approved operator on the canvas).
///         3. ETH is forwarded to the seller in the same transaction.
///
///         Because listings are non-custodial, a listing can go stale (seller
///         spent/transferred the AP, or sold the token). `buy` re-validates
///         ownership and balance at purchase time and reverts if stale.
contract PixelMarketplace is ReentrancyGuard {
    error NotTokenOwner();
    error NotSeller();
    error ListingNotFound();
    error WrongPayment();
    error ZeroAmount();
    error ZeroPrice();
    error StaleListing();
    error EthTransferFailed();

    struct Listing {
        address seller;     // listing creator; must still own sellerTokenId at buy time
        address canvas;     // IPixelCanvas implementation
        uint256 tokenId;    // token holding the AP for sale
        uint256 amount;     // AP amount for sale
        uint256 price;      // total price in wei for the full amount
    }

    uint256 public nextListingId = 1;
    mapping(uint256 listingId => Listing) public listings;

    event APListed(
        uint256 indexed listingId,
        address indexed canvas,
        uint256 indexed tokenId,
        address seller,
        uint256 amount,
        uint256 price
    );
    event APSold(
        uint256 indexed listingId,
        address indexed canvas,
        uint256 indexed buyerTokenId,
        address buyer,
        uint256 sellerTokenId,
        uint256 amount,
        uint256 price
    );
    event APListingCancelled(uint256 indexed listingId);

    /// @notice List `amount` AP from `tokenId` for `price` wei total.
    /// @dev Non-custodial: only validates ownership + balance now; re-checked at buy.
    function list(address canvas, uint256 tokenId, uint256 amount, uint256 price)
        external
        returns (uint256 listingId)
    {
        if (amount == 0) revert ZeroAmount();
        if (price == 0) revert ZeroPrice();
        if (IPixelCanvas(canvas).ownerOfToken(tokenId) != msg.sender) revert NotTokenOwner();
        if (IPixelCanvas(canvas).actionPoints(tokenId) < amount) revert StaleListing();

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            canvas: canvas,
            tokenId: tokenId,
            amount: amount,
            price: price
        });

        emit APListed(listingId, canvas, tokenId, msg.sender, amount, price);
    }

    /// @notice Cancel a listing. Only the seller may cancel.
    function cancel(uint256 listingId) external {
        Listing memory listing = listings[listingId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (listing.seller != msg.sender) revert NotSeller();

        delete listings[listingId];
        emit APListingCancelled(listingId);
    }

    /// @notice Buy a listing, landing the AP in `buyerTokenId` (must be owned by caller).
    function buy(uint256 listingId, uint256 buyerTokenId) external payable nonReentrant {
        Listing memory listing = listings[listingId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (msg.value != listing.price) revert WrongPayment();

        IPixelCanvas canvas = IPixelCanvas(listing.canvas);
        if (canvas.ownerOfToken(buyerTokenId) != msg.sender) revert NotTokenOwner();

        // Re-validate the non-custodial listing at purchase time.
        if (canvas.ownerOfToken(listing.tokenId) != listing.seller) revert StaleListing();
        if (canvas.actionPoints(listing.tokenId) < listing.amount) revert StaleListing();

        // Effects before interactions.
        delete listings[listingId];

        canvas.operatorTransferAP(listing.seller, listing.tokenId, buyerTokenId, listing.amount);

        (bool ok,) = listing.seller.call{value: msg.value}("");
        if (!ok) revert EthTransferFailed();

        emit APSold(
            listingId,
            listing.canvas,
            buyerTokenId,
            msg.sender,
            listing.tokenId,
            listing.amount,
            listing.price
        );
    }
}
```

---

## Chroma.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IChromaRenderer} from "./IChromaRenderer.sol";
import {ChromaStorage} from "./ChromaStorage.sol";
import {IChromaCanvasFinalize} from "./IChromaCanvasFinalize.sol";

contract Chroma is ERC721, ERC2981, Ownable {
    using Strings for uint256;

    enum Phase {
        Closed,
        AllowlistOne,
        AllowlistTwo,
        Public,
        Revealed
    }

    error RendererNotSet();
    error MaxSupplyReached();
    error InsufficientPayment();
    error WithdrawFailed();
    error WrongPhase();
    error InvalidMerkleProof();
    error MaxPerWalletExceeded();
    error InvalidQuantity();
    error AlreadyRevealed();
    error NotTokenOwner();
    error AlreadyLocked();
    error NotRevealed();
    error InvalidTokenId();
    error InvalidPayload();
    error AlreadyInscribed();
    error RevealedBaseURINotSet();

    uint256 public constant MAX_SUPPLY = 5150;
    uint256 public constant MINT_PRICE = 0.006 ether;
    uint256 public constant ALLOWLIST_ONE_PRICE = 0.003 ether;
    uint256 public constant ALLOWLIST_TWO_PRICE = 0.005 ether;
    uint256 public constant MAX_PER_WALLET_ONE = 2;

    uint256 internal constant PIXELS_LENGTH = 2048;
    uint256 internal constant TRAITS_LENGTH = 32;

    Phase public phase = Phase.Closed;
    bytes32 public merkleRootOne;
    bytes32 public merkleRootTwo;
    bytes32 public revealRoot;
    string public revealedBaseURI;

    mapping(address => uint256) public claimedOne;
    mapping(address => uint256) public claimedTwo;
    mapping(address => uint256) public claimedPublic;
    mapping(uint256 => bool) public revealed;
    mapping(uint256 => bool) public locked;
    mapping(uint256 => bytes32) public revealedTraits;

    event TokenRevealed(uint256 indexed tokenId);
    event TokenInscribed(uint256 indexed tokenId);
    event TokenLocked(uint256 indexed tokenId);

    ChromaStorage public immutable chromaStorage;
    IChromaRenderer public renderer;
    IChromaCanvasFinalize public canvas;
    uint256 private _totalSupply;

    constructor(
        address storageAddress,
        address initialOwner,
        address royaltyReceiver,
        uint96 royaltyFeeNumerator
    ) ERC721("Chromies", "CHROMIE") Ownable(initialOwner) {
        chromaStorage = ChromaStorage(storageAddress);
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    receive() external payable {}

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Owner mint — placeholder only; same reveal/inscribe path as public mints.
    function mint(address to, uint256 tokenId) external onlyOwner {
        if (tokenId != _totalSupply + 1) revert InvalidTokenId();
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        _safeMint(to, tokenId);
        ++_totalSupply;
    }

    function mint(bytes32[] calldata proof, uint256 quantity) external payable {
        if (phase == Phase.AllowlistOne) {
            _mintAllowlistOne(proof, quantity);
        } else if (phase == Phase.AllowlistTwo) {
            _mintAllowlistTwo(proof, quantity);
        } else {
            revert WrongPhase();
        }
    }

    function mint(uint256 quantity) external payable {
        if (phase != Phase.Public) revert WrongPhase();
        _mintPublic(quantity);
    }

    /// @notice Cheap reveal — merkle verify + revealed flag + traits snapshot. No SSTORE2 write.
    function reveal(uint256 tokenId, bytes calldata pixels, bytes calldata traits, bytes32[] calldata proof)
        external
    {
        _requireOwned(tokenId);
        if (revealed[tokenId]) revert AlreadyRevealed();
        if (pixels.length != PIXELS_LENGTH || traits.length != TRAITS_LENGTH) revert InvalidPayload();

        bytes32 leaf = keccak256(abi.encodePacked(tokenId, pixels, traits));
        if (!MerkleProof.verify(proof, revealRoot, leaf)) revert InvalidMerkleProof();

        revealed[tokenId] = true;
        revealedTraits[tokenId] = bytes32(traits);
        emit TokenRevealed(tokenId);
    }

    /// @notice Expensive permanence — SSTORE2 pixel write, canvas bake, and permanent lock.
    function inscribe(uint256 tokenId, bytes calldata pixels, bytes calldata traits, bytes32[] calldata proof)
        external
    {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (locked[tokenId]) revert AlreadyLocked();
        if (!revealed[tokenId]) revert NotRevealed();
        if (chromaStorage.hasData(tokenId)) revert AlreadyInscribed();
        if (pixels.length != PIXELS_LENGTH || traits.length != TRAITS_LENGTH) revert InvalidPayload();

        bytes32 leaf = keccak256(abi.encodePacked(tokenId, pixels, traits));
        if (!MerkleProof.verify(proof, revealRoot, leaf)) revert InvalidMerkleProof();

        chromaStorage.writeTokenData(tokenId, pixels, traits);
        delete revealedTraits[tokenId];
        _bakeCanvasEdits(tokenId);
        locked[tokenId] = true;
        emit TokenInscribed(tokenId);
        emit TokenLocked(tokenId);
    }

    function isLocked(uint256 tokenId) external view returns (bool) {
        return locked[tokenId];
    }

    function setPhase(Phase _phase) external onlyOwner {
        phase = _phase;
    }

    function setMerkleRootOne(bytes32 root) external onlyOwner {
        merkleRootOne = root;
    }

    function setMerkleRootTwo(bytes32 root) external onlyOwner {
        merkleRootTwo = root;
    }

    function setRevealRoot(bytes32 root) external onlyOwner {
        revealRoot = root;
    }

    function setRevealedBaseURI(string calldata uri) external onlyOwner {
        revealedBaseURI = uri;
    }

    /// @notice Testing helper — clears a wallet's per-phase mint counts.
    function resetClaimed(address wallet) external onlyOwner {
        claimedPublic[wallet] = 0;
        claimedOne[wallet] = 0;
        claimedTwo[wallet] = 0;
    }

    function withdraw() external onlyOwner {
        (bool ok,) = payable(owner()).call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    function setRenderer(address rendererAddress) external onlyOwner {
        renderer = IChromaRenderer(rendererAddress);
    }

    function setCanvas(address canvasAddress) external onlyOwner {
        canvas = IChromaCanvasFinalize(canvasAddress);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!revealed[tokenId]) {
            return _unrevealedURI(tokenId);
        }
        if (!chromaStorage.hasData(tokenId)) {
            return _revealedOffChainURI(tokenId);
        }
        if (address(renderer) == address(0)) revert RendererNotSet();
        return renderer.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _mintAllowlistOne(bytes32[] calldata proof, uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != ALLOWLIST_ONE_PRICE * quantity) revert InsufficientPayment();
        if (claimedOne[msg.sender] + quantity > MAX_PER_WALLET_ONE) revert MaxPerWalletExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootOne)) revert InvalidMerkleProof();

        claimedOne[msg.sender] += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintPlaceholder(msg.sender);
        }
    }

    function _mintAllowlistTwo(bytes32[] calldata proof, uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != ALLOWLIST_TWO_PRICE * quantity) revert InsufficientPayment();
        if (claimedTwo[msg.sender] + quantity > 2) revert MaxPerWalletExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootTwo)) revert InvalidMerkleProof();

        claimedTwo[msg.sender] += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintPlaceholder(msg.sender);
        }
    }

    function _mintPublic(uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != MINT_PRICE * quantity) revert InsufficientPayment();
        if (claimedPublic[msg.sender] + quantity > 3) revert MaxPerWalletExceeded();

        claimedPublic[msg.sender] += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintPlaceholder(msg.sender);
        }
    }

    function _mintPlaceholder(address to) internal {
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        uint256 tokenId = _totalSupply + 1;
        _safeMint(to, tokenId);
        ++_totalSupply;
    }

    function _verifyAllowlist(address account, bytes32[] calldata proof, bytes32 root) internal pure returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(account));
        return MerkleProof.verify(proof, root, leaf);
    }

    function _bakeCanvasEdits(uint256 tokenId) internal {
        if (address(canvas) == address(0)) return;
        if (!canvas.isCustomized(tokenId)) return;

        bytes memory pixels;
        uint16 totalPixelCount;
        (pixels, totalPixelCount) = canvas.computeFinalPixels(tokenId);
        chromaStorage.rewritePixels(tokenId, pixels, totalPixelCount);
        canvas.clearDiffs(tokenId);
    }

    function _revealedOffChainURI(uint256 tokenId) internal view returns (string memory) {
        if (bytes(revealedBaseURI).length == 0) revert RevealedBaseURINotSet();
        return string(abi.encodePacked(revealedBaseURI, tokenId.toString(), ".json"));
    }

    function _unrevealedURI(uint256 tokenId) internal pure returns (string memory) {
        string[5] memory images = [
            "https://chromies.art/RevealImage.png",
            "https://chromies.art/RevealImage_B.png",
            "https://chromies.art/RevealImage_C.png",
            "https://chromies.art/RevealImage_D.png",
            "https://chromies.art/RevealImage_E.png"
        ];
        string memory image = images[tokenId % 5];
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(
                    bytes(
                        string(
                            abi.encodePacked(
                                '{"name":"Chromie #',
                                Strings.toString(tokenId),
                                ' (Unrevealed)",',
                                '"description":"Awaiting reveal.",',
                                '"image":"',
                                image,
                                '"}'
                            )
                        )
                    )
                )
            )
        );
    }
}
```

---

