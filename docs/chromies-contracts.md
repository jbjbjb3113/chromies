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
- `ChromaRendererCrc32.sol`
- `ChromaRendererPngLib.sol`
- `IChromaPaletteData.sol`
- `PaletteStrings.sol`

---

## IChromaStorage.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaStorage {
    function writeTokenData(uint256 tokenId, bytes calldata pixels, bytes calldata traits) external;

    function hasData(uint256 tokenId) external view returns (bool);

    function getPixels(uint256 tokenId) external view returns (bytes memory);

    function getTraits(uint256 tokenId) external view returns (bytes memory);

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
    /// @notice Lifetime-earn level: sqrt(totalApEarned / 50), uncapped.
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
```

---

## ChromaRendererSvgLib.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ChromaRendererSvgLib {
    uint256 internal constant GRID = 64;
    uint256 internal constant CELL = 16;
    uint256 internal constant PATH_OPEN_BYTES = 12; // <path fill="
    uint256 internal constant PATH_MID_BYTES = 5; // " d="
    uint256 internal constant PATH_SUFFIX_BYTES = 2; // "/>
    bytes internal constant SVG_PREFIX =
        bytes(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><path fill="'
        );
    bytes internal constant SVG_MID = bytes('" d="M0,0h1024v1024h-1024z"/>');
    bytes internal constant SVG_SUFFIX = bytes("</svg>");

    struct SvgRenderContext {
        uint256 tokenId;
        bytes pixels;
        string[16] palette;
        uint16[] diffIndexes;
        uint8[] diffColors;
    }

    struct RunRecord {
        uint8 x;
        uint8 y;
        uint8 run;
        uint8 color;
    }

    function buildBody(SvgRenderContext memory ctx) internal pure returns (bytes memory) {
        (uint256 runCount, uint256 bodySize) = _scanMeta(ctx);
        if (runCount == 0) {
            return new bytes(0);
        }
        RunRecord[] memory runs = new RunRecord[](runCount);
        _fillRuns(ctx, runs);
        bytes memory body = new bytes(bodySize);
        uint256 written = _writeBodyFromRuns(body, 0, ctx, runs, runCount);
        assembly ("memory-safe") {
            mstore(body, written)
        }
        return body;
    }

    function buildSvgBytes(SvgRenderContext memory ctx) internal pure returns (bytes memory) {
        (uint256 runCount, uint256 bodySize) = _scanMeta(ctx);
        bytes memory bg = bytes(ctx.palette[0]);
        uint256 totalSize = SVG_PREFIX.length + bg.length + SVG_MID.length + bodySize + SVG_SUFFIX.length;
        bytes memory svg = new bytes(totalSize);
        uint256 offset;
        offset = _copyBytes(svg, offset, SVG_PREFIX);
        offset = _copyBytes(svg, offset, bg);
        offset = _copyBytes(svg, offset, SVG_MID);
        if (runCount > 0) {
            RunRecord[] memory runs = new RunRecord[](runCount);
            _fillRuns(ctx, runs);
            offset = _writeBodyFromRuns(svg, offset, ctx, runs, runCount);
        }
        offset = _copyBytes(svg, offset, SVG_SUFFIX);
        assembly ("memory-safe") {
            mstore(svg, offset)
        }
        return svg;
    }

    function wrapSvg(string memory background, bytes memory body) internal pure returns (string memory) {
        bytes memory svg = abi.encodePacked(
            SVG_PREFIX,
            bytes(background),
            SVG_MID,
            body,
            SVG_SUFFIX
        );
        return string(svg);
    }

    function countRuns(SvgRenderContext memory ctx) internal pure returns (uint256 runCount) {
        (runCount,) = _scanMeta(ctx);
    }

    function _scanMeta(SvgRenderContext memory ctx)
        private
        pure
        returns (uint256 runCount, uint256 bodySize)
    {
        bool[16] memory seen;
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint8 idx = _getCompositePixelIndex(ctx.pixels, x, y, ctx.diffIndexes, ctx.diffColors);
                uint256 run = 1;
                while (x + run < GRID) {
                    uint8 nextIdx =
                        _getCompositePixelIndex(ctx.pixels, x + run, y, ctx.diffIndexes, ctx.diffColors);
                    if (nextIdx != idx) break;
                    ++run;
                }
                if (idx != 0) {
                    ++runCount;
                    seen[idx] = true;
                    bodySize += _measureRunBytes(uint256(x) * CELL, uint256(y) * CELL, run * CELL);
                }
                x += run;
            }
        }
        for (uint8 colorIdx = 1; colorIdx < 16; ++colorIdx) {
            if (!seen[colorIdx]) continue;
            bodySize += PATH_OPEN_BYTES + bytes(ctx.palette[colorIdx]).length + PATH_MID_BYTES + PATH_SUFFIX_BYTES;
        }
    }

    function _fillRuns(SvgRenderContext memory ctx, RunRecord[] memory runs) private pure {
        uint256 runCount;
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint8 idx = _getCompositePixelIndex(ctx.pixels, x, y, ctx.diffIndexes, ctx.diffColors);
                uint256 run = 1;
                while (x + run < GRID) {
                    uint8 nextIdx =
                        _getCompositePixelIndex(ctx.pixels, x + run, y, ctx.diffIndexes, ctx.diffColors);
                    if (nextIdx != idx) break;
                    ++run;
                }
                if (idx != 0) {
                    runs[runCount] = RunRecord(uint8(x), uint8(y), uint8(run), idx);
                    ++runCount;
                }
                x += run;
            }
        }
    }

    function _writeBodyFromRuns(
        bytes memory body,
        uint256 offset,
        SvgRenderContext memory ctx,
        RunRecord[] memory runs,
        uint256 runCount
    ) private pure returns (uint256) {
        bool[16] memory seen;
        for (uint256 i = 0; i < runCount; ++i) {
            seen[runs[i].color] = true;
        }
        for (uint8 colorIdx = 1; colorIdx < 16; ++colorIdx) {
            if (!seen[colorIdx]) continue;
            offset = _writeLiteral(body, offset, '<path fill="');
            offset = _writeString(body, offset, ctx.palette[colorIdx]);
            offset = _writeLiteral(body, offset, '" d="');
            for (uint256 i = 0; i < runCount; ++i) {
                if (runs[i].color != colorIdx) continue;
                offset = _writeRunPath(
                    body,
                    offset,
                    uint256(runs[i].x) * CELL,
                    uint256(runs[i].y) * CELL,
                    uint256(runs[i].run) * CELL
                );
            }
            offset = _writeLiteral(body, offset, '"/>');
        }
        return offset;
    }

    function _measureRunBytes(uint256 x, uint256 y, uint256 width) private pure returns (uint256) {
        return 1 + _decimalLength(x) + 1 + _decimalLength(y) + 1 + _decimalLength(width) + 5 + 1
            + _decimalLength(width) + 1;
    }

    function _writeRunPath(bytes memory body, uint256 offset, uint256 x, uint256 y, uint256 width)
        private
        pure
        returns (uint256)
    {
        offset = _writeChar(body, offset, "M");
        offset = _writeUint(body, offset, x);
        offset = _writeChar(body, offset, ",");
        offset = _writeUint(body, offset, y);
        offset = _writeChar(body, offset, "h");
        offset = _writeUint(body, offset, width);
        offset = _writeLiteral(body, offset, "v16h-");
        offset = _writeUint(body, offset, width);
        offset = _writeChar(body, offset, "z");
        return offset;
    }

    function _decimalLength(uint256 value) private pure returns (uint256) {
        if (value == 0) return 1;
        uint256 len;
        while (value != 0) {
            ++len;
            value /= 10;
        }
        return len;
    }

    function _writeUint(bytes memory body, uint256 offset, uint256 value) private pure returns (uint256) {
        if (value == 0) {
            body[offset] = 0x30;
            return offset + 1;
        }
        uint256 temp = value;
        uint256 len;
        while (temp != 0) {
            ++len;
            temp /= 10;
        }
        temp = value;
        uint256 end = offset + len;
        for (uint256 i = len; i > 0; --i) {
            body[offset + i - 1] = bytes1(uint8(48 + (temp % 10)));
            temp /= 10;
        }
        return end;
    }

    function _writeChar(bytes memory body, uint256 offset, bytes1 char) private pure returns (uint256) {
        body[offset] = char;
        return offset + 1;
    }

    function _writeLiteral(bytes memory body, uint256 offset, string memory literal) private pure returns (uint256) {
        bytes memory raw = bytes(literal);
        for (uint256 i = 0; i < raw.length; ++i) {
            body[offset + i] = raw[i];
        }
        return offset + raw.length;
    }

    function _writeString(bytes memory body, uint256 offset, string memory value) private pure returns (uint256) {
        bytes memory raw = bytes(value);
        for (uint256 i = 0; i < raw.length; ++i) {
            body[offset + i] = raw[i];
        }
        return offset + raw.length;
    }

    function _copyBytes(bytes memory dest, uint256 offset, bytes memory src) private pure returns (uint256) {
        for (uint256 i = 0; i < src.length; ++i) {
            dest[offset + i] = src[i];
        }
        return offset + src.length;
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
        if (diffIndexes.length > 0) {
            uint16 flatIndex = uint16(y * GRID + x);
            for (uint256 i = diffIndexes.length; i > 0; --i) {
                uint256 idx = i - 1;
                if (diffIndexes[idx] == flatIndex) return diffColors[idx];
            }
        }
        return _getPixelIndex(pixels, x, y);
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
import {IChromaPaletteData} from "./IChromaPaletteData.sol";
import {IChromaStorage} from "./IChromaStorage.sol";
import {IChromaToken} from "./IChromaToken.sol";
import {ChromaRendererPngLib} from "./ChromaRendererPngLib.sol";
import {ChromaRendererSvgLib} from "./ChromaRendererSvgLib.sol";

contract ChromaRenderer is Ownable {
    using Strings for uint256;

    /// @dev Universal collection background — renderer-level only (not payload / registry slot 0).
    string internal constant UNIVERSAL_BACKGROUND = "#e3e5e4";
    bytes3 internal constant UNIVERSAL_BACKGROUND_RGB = 0xE3E5E4;

    IChromaStorage public immutable chromaStorage;
    IChromaPaletteData public immutable paletteData;
    IChromaCanvas public chromaCanvas;
    IChromaToken public chroma;

    constructor(address storageAddress, address paletteDataAddress, address initialOwner) Ownable(initialOwner) {
        chromaStorage = IChromaStorage(storageAddress);
        paletteData = IChromaPaletteData(paletteDataAddress);
    }

    function setCanvas(address canvasAddress) external onlyOwner {
        chromaCanvas = IChromaCanvas(canvasAddress);
    }

    function setChroma(address chromaAddress) external onlyOwner {
        chroma = IChromaToken(chromaAddress);
    }

    /// @notice Secondary path renderer — used by `/chroma/:id/image.svg` API and dev tooling.
    function renderSVG(uint256 tokenId) public view returns (string memory) {
        bytes memory traits = chromaStorage.getTraits(tokenId);
        ChromaRendererSvgLib.SvgRenderContext memory ctx = _loadSvgContext(tokenId, traits);
        return string(ChromaRendererSvgLib.buildSvgBytes(ctx));
    }

    /// @notice Primary tokenURI image shell — SVG wrapper embedding indexed PNG (base64).
    function renderImageShell(uint256 tokenId) public view returns (string memory) {
        bytes memory traits = chromaStorage.getTraits(tokenId);
        return string(_buildImageShellBytes(tokenId, traits));
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        bytes memory traits = chromaStorage.getTraits(tokenId);
        bytes memory shell = _buildImageShellBytes(tokenId, traits);
        bytes memory json = _encodeTokenJson(tokenId, traits, shell);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    function _buildImageShellBytes(uint256 tokenId, bytes memory traits) internal view returns (bytes memory) {
        ChromaRendererPngLib.RenderContext memory ctx = _loadPngContext(tokenId, traits);
        bytes memory png = ChromaRendererPngLib.buildPng(ctx);
        return ChromaRendererPngLib.buildImageShellSvg(png);
    }

    function _loadPngContext(uint256 tokenId, bytes memory traits)
        internal
        view
        returns (ChromaRendererPngLib.RenderContext memory ctx)
    {
        ctx.pixels = chromaStorage.getPixels(tokenId);
        ctx.paletteRgb = ChromaRendererPngLib.paletteHexToRgb(_paletteForRender(traits));
        ctx.paletteRgb[0] = UNIVERSAL_BACKGROUND_RGB;
        (ctx.diffIndexes, ctx.diffColors) = _getDiff(tokenId);
    }

    function _loadSvgContext(uint256 tokenId, bytes memory traits)
        internal
        view
        returns (ChromaRendererSvgLib.SvgRenderContext memory ctx)
    {
        ctx.tokenId = tokenId;
        ctx.pixels = chromaStorage.getPixels(tokenId);
        ctx.palette = _paletteForRender(traits);
        (ctx.diffIndexes, ctx.diffColors) = _getDiff(tokenId);
    }

    /// @dev Measurement hook — PNG path artifacts + phase gas for profiling.
    function profileRenderParts(uint256 tokenId)
        external
        view
        returns (
            ChromaRendererPngLib.RenderContext memory ctx,
            bytes memory png,
            bytes memory shell,
            uint256 crcGas,
            ChromaRendererPngLib.PhaseGas memory phases
        )
    {
        bytes memory traits = chromaStorage.getTraits(tokenId);
        ctx = _loadPngContext(tokenId, traits);
        phases = ChromaRendererPngLib.profilePhases(ctx);
        crcGas = phases.crcRuntime;
        png = ChromaRendererPngLib.buildPng(ctx);
        shell = ChromaRendererPngLib.buildImageShellSvg(png);
    }

    function profileTokenJsonParts(uint256 tokenId, bytes memory shellBytes)
        external
        view
        returns (bytes memory traits, bytes memory json, string memory uri)
    {
        traits = chromaStorage.getTraits(tokenId);
        json = _encodeTokenJson(tokenId, traits, shellBytes);
        uri = string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    function _encodeTokenJson(uint256 tokenId, bytes memory traits, bytes memory shellBytes)
        internal
        view
        returns (bytes memory)
    {
        string memory image =
            string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(shellBytes)));
        bytes memory coreTraits = abi.encodePacked(
            _jsonAttribute("Character", _characterLabel(uint8(traits[0]))),
            ",",
            _jsonAttribute("Palette", paletteData.paletteName(uint8(traits[1]))),
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
            _jsonAttribute("Hair", _hairLabel(uint8(traits[14])))
        );

        return abi.encodePacked(
            '{"name":"',
            _tokenName(tokenId),
            '","description":"',
            _tokenDescription(),
            '","image":"',
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

    /// @dev ETH-collection name string, UNCHANGED. Override in a chain-specific
    /// subclass (e.g. Robinhood Chain deployment) rather than editing this default.
    function _tokenName(uint256 tokenId) internal view virtual returns (string memory) {
        return string(abi.encodePacked("Chroma #", tokenId.toString()));
    }

    /// @dev ETH-collection description string, UNCHANGED. Override in a chain-specific
    /// subclass (e.g. Robinhood Chain deployment) rather than editing this default.
    function _tokenDescription() internal view virtual returns (string memory) {
        return "Chroma is a fully on-chain 64x64 indexed-color NFT.";
    }

    function _getDiff(uint256 tokenId) internal view returns (uint16[] memory diffIndexes, uint8[] memory diffColors) {
        if (address(chromaCanvas) == address(0)) {
            return (new uint16[](0), new uint8[](0));
        }
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

    function _paletteForToken(bytes memory traits) internal view returns (string[16] memory palette) {
        return paletteData.paletteColors(uint8(traits[1]));
    }

    /// @dev Palette for raster output — slot 0 forced to universal background per collection ruling.
    function _paletteForRender(bytes memory traits) internal view returns (string[16] memory palette) {
        palette = _paletteForToken(traits);
        palette[0] = UNIVERSAL_BACKGROUND;
    }

    function _characterLabel(uint8 value) internal pure returns (string memory) {
        if (value == 0 || value == 1) return "Human";
        if (value == 2) return "Alien";
        if (value == 3) return "Cat";
        if (value == 4) return "Agent";
        if (value == 8) return "Zombie";
        return "Human";
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
    error InvalidTransfer();
    error TokenLocked();

    uint256 internal constant GRID_PIXELS = 4096;
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
    error InvalidTransfer();
    error TokenLocked();
    error UnauthorizedChromaCaller();

    uint256 internal constant GRID_PIXELS = 4096;
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
        // Intentionally discards return value; reverts if tokenId does not exist.
        chroma.ownerOf(tokenId);
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

    /// @notice Uncapped activity level from lifetime AP earned (sqrt curve).
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
        // Intentionally discards return value; reverts if destination token does not exist.
        chroma.ownerOf(toTokenId);
        if (actionPoints[fromTokenId] < amount) revert InsufficientActionPoints();

        actionPoints[fromTokenId] -= amount;
        actionPoints[toTokenId] += amount;
        emit APTransferred(fromTokenId, toTokenId, amount);
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
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IChromaRenderer} from "./IChromaRenderer.sol";
import {ChromaStorage} from "./ChromaStorage.sol";
import {IChromaCanvasFinalize} from "./IChromaCanvasFinalize.sol";

contract Chroma is ERC721, ERC2981, Ownable, ReentrancyGuard {
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
    error PhaseSupplyExceeded();

    uint256 public constant MAX_SUPPLY = 5150;
    uint256 public constant TEAM_RESERVE = 200;
    uint256 public constant MAX_MINT_ALLOWLIST_ONE = 2500;
    uint256 public constant MAX_MINT_ALLOWLIST_TWO = 1000;
    uint256 public constant MINT_PRICE = 0.0045 ether;
    uint256 public constant ALLOWLIST_ONE_PRICE = 0.0025 ether;
    uint256 public constant ALLOWLIST_TWO_PRICE = 0.0035 ether;
    uint256 public constant MAX_PER_WALLET_ONE = 5;
    uint256 public constant MAX_PER_WALLET_TWO = 5;
    uint256 public constant MAX_PER_WALLET_PUBLIC = 5;

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
    uint256 public mintedAllowlistOne;
    uint256 public mintedAllowlistTwo;
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
        ++_totalSupply;
        _safeMint(to, tokenId);
    }

    function mint(bytes32[] calldata proof, uint256 quantity) external payable nonReentrant {
        if (phase == Phase.AllowlistOne) {
            _mintAllowlistOne(proof, quantity);
        } else if (phase == Phase.AllowlistTwo) {
            _mintAllowlistTwo(proof, quantity);
        } else {
            revert WrongPhase();
        }
    }

    function mint(uint256 quantity) external payable nonReentrant {
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

        bytes32 leaf = keccak256(abi.encode(tokenId, pixels, traits));
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

        bytes32 leaf = keccak256(abi.encode(tokenId, pixels, traits));
        if (!MerkleProof.verify(proof, revealRoot, leaf)) revert InvalidMerkleProof();

        locked[tokenId] = true;
        chromaStorage.writeTokenData(tokenId, pixels, traits);
        delete revealedTraits[tokenId];
        _bakeCanvasEdits(tokenId);
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
        if (mintedAllowlistOne + quantity > MAX_MINT_ALLOWLIST_ONE) revert PhaseSupplyExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootOne)) revert InvalidMerkleProof();

        claimedOne[msg.sender] += quantity;
        mintedAllowlistOne += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintCommunity(msg.sender);
        }
    }

    function _mintAllowlistTwo(bytes32[] calldata proof, uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != ALLOWLIST_TWO_PRICE * quantity) revert InsufficientPayment();
        if (claimedTwo[msg.sender] + quantity > MAX_PER_WALLET_TWO) revert MaxPerWalletExceeded();
        if (mintedAllowlistTwo + quantity > MAX_MINT_ALLOWLIST_TWO) revert PhaseSupplyExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootTwo)) revert InvalidMerkleProof();

        claimedTwo[msg.sender] += quantity;
        mintedAllowlistTwo += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintCommunity(msg.sender);
        }
    }

    function _mintPublic(uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != MINT_PRICE * quantity) revert InsufficientPayment();
        if (claimedPublic[msg.sender] + quantity > MAX_PER_WALLET_PUBLIC) revert MaxPerWalletExceeded();

        claimedPublic[msg.sender] += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintCommunity(msg.sender);
        }
    }

    function _communityMintCap() internal pure returns (uint256) {
        return MAX_SUPPLY - TEAM_RESERVE;
    }

    function _mintCommunity(address to) internal {
        if (_totalSupply + 1 > _communityMintCap()) revert MaxSupplyReached();
        _mintPlaceholder(to);
    }

    function _mintPlaceholder(address to) internal {
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        uint256 tokenId = _totalSupply + 1;
        ++_totalSupply;
        _safeMint(to, tokenId);
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

## ChromaRendererCrc32.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Table-driven CRC32 + Adler32 for PNG zlib (Pass B.1 assembly path).
library ChromaRendererCrc32 {
    // CRC32 over "IHDR" + width=64 height=64 bitDepth=4 colorType=3
    // compression=0 filter=0 interlace=0. Derived by this script, not hand-pasted.
    uint32 internal constant CRC_IHDR = 0x58476ced;
    uint32 internal constant CRC_IEND = 0xae426082;

    function initTable(uint256 dest) internal pure {
        assembly ("memory-safe") {
            mstore(add(dest, 0), 0x0000000077073096ee0e612c990951ba076dc419706af48fe963a5359e6495a3)
            mstore(add(dest, 32), 0x0edb883279dcb8a4e0d5e91e97d2d98809b64c2b7eb17cbde7b82d0790bf1d91)
            mstore(add(dest, 64), 0x1db710646ab020f2f3b9714884be41de1adad47d6ddde4ebf4d4b55183d385c7)
            mstore(add(dest, 96), 0x136c9856646ba8c0fd62f97a8a65c9ec14015c4f63066cd9fa0f3d638d080df5)
            mstore(add(dest, 128), 0x3b6e20c84c69105ed56041e4a26771723c03e4d14b04d447d20d85fda50ab56b)
            mstore(add(dest, 160), 0x35b5a8fa42b2986cdbbbc9d6acbcf94032d86ce345df5c75dcd60dcfabd13d59)
            mstore(add(dest, 192), 0x26d930ac51de003ac8d75180bfd0611621b4f4b556b3c423cfba9599b8bda50f)
            mstore(add(dest, 224), 0x2802b89e5f058808c60cd9b2b10be9242f6f7c8758684c11c1611dabb6662d3d)
            mstore(add(dest, 256), 0x76dc419001db710698d220bcefd5102a71b1858906b6b51f9fbfe4a5e8b8d433)
            mstore(add(dest, 288), 0x7807c9a20f00f9349609a88ee10e98187f6a0dbb086d3d2d91646c97e6635c01)
            mstore(add(dest, 320), 0x6b6b51f41c6c6162856530d8f262004e6c0695ed1b01a57b8208f4c1f50fc457)
            mstore(add(dest, 352), 0x65b0d9c612b7e9508bbeb8eafcb9887c62dd1ddf15da2d498cd37cf3fbd44c65)
            mstore(add(dest, 384), 0x4db261583ab551cea3bc0074d4bb30e24adfa5413dd895d7a4d1c46dd3d6f4fb)
            mstore(add(dest, 416), 0x4369e96a346ed9fcad678846da60b8d044042d7333031de5aa0a4c5fdd0d7cc9)
            mstore(add(dest, 448), 0x5005713c270241aabe0b1010c90c20865768b525206f85b3b966d409ce61e49f)
            mstore(add(dest, 480), 0x5edef90e29d9c998b0d09822c7d7a8b459b33d172eb40d81b7bd5c3bc0ba6cad)
            mstore(add(dest, 512), 0xedb883209abfb3b603b6e20c74b1d29aead547399dd277af04db261573dc1683)
            mstore(add(dest, 544), 0xe3630b1294643b840d6d6a3e7a6a5aa8e40ecf0b9309ff9d0a00ae277d079eb1)
            mstore(add(dest, 576), 0xf00f93448708a3d21e01f2686906c2fef762575d806567cb196c36716e6b06e7)
            mstore(add(dest, 608), 0xfed41b7689d32be010da7a5a67dd4accf9b9df6f8ebeeff917b7be4360b08ed5)
            mstore(add(dest, 640), 0xd6d6a3e8a1d1937e38d8c2c44fdff252d1bb67f1a6bc57673fb506dd48b2364b)
            mstore(add(dest, 672), 0xd80d2bdaaf0a1b4c36034af641047a60df60efc3a867df55316e8eef4669be79)
            mstore(add(dest, 704), 0xcb61b38cbc66831a256fd2a05268e236cc0c7795bb0b4703220216b95505262f)
            mstore(add(dest, 736), 0xc5ba3bbeb2bd0b282bb45a925cb36a04c2d7ffa7b5d0cf312cd99e8b5bdeae1d)
            mstore(add(dest, 768), 0x9b64c2b0ec63f226756aa39c026d930a9c0906a9eb0e363f7207678505005713)
            mstore(add(dest, 800), 0x95bf4a82e2b87a147bb12bae0cb61b3892d28e9be5d5be0d7cdcefb70bdbdf21)
            mstore(add(dest, 832), 0x86d3d2d4f1d4e24268ddb3f81fda836e81be16cdf6b9265b6fb077e118b74777)
            mstore(add(dest, 864), 0x88085ae6ff0f6a7066063bca11010b5c8f659efff862ae69616bffd3166ccf45)
            mstore(add(dest, 896), 0xa00ae278d70dd2ee4e0483543903b3c2a7672661d06016f74969474d3e6e77db)
            mstore(add(dest, 928), 0xaed16a4ad9d65adc40df0b6637d83bf0a9bcae53debb9ec547b2cf7f30b5ffe9)
            mstore(add(dest, 960), 0xbdbdf21ccabac28a53b3933024b4a3a6bad03605cdd7069354de572923d967bf)
            mstore(add(dest, 992), 0xb3667a2ec4614ab85d681b022a6f2b94b40bbe37c30c8ea15a05df1b2d02ef8d)
        }
    }

    function allocTable() internal pure returns (uint256 table) {
        assembly ("memory-safe") {
            table := mload(0x40)
            mstore(0x40, add(table, 0x400))
        }
        initTable(table);
    }

    // initTable() packs 256 uint32 entries at 4-byte stride (8 entries per
    // 32-byte mstore above). mload(add(table, shl(2, b))) therefore returns a
    // 32-byte word whose HIGH 4 bytes are table[b] and whose low 28 bytes are
    // the next 7 packed entries -- every lookup below MUST shr(224, ...) that
    // mload result to isolate table[b]. Omitting the shr(224, ...) silently
    // corrupts every CRC32 this library computes -- see ROBINHOOD_RENDERER_BUG.md.
    //
    // Also note: the running `crc` register must stay a clean 32-bit value.
    // `not(0)` is 2**256-1 (all 256 bits set), NOT the 32-bit CRC32 seed
    // 0xffffffff -- using the former polluted every accumulation with garbage
    // in bits [32:255] that leaked into the low 32 bits via shr(8, crc) on
    // every iteration. Seed with the literal 0xffffffff instead, and mask the
    // final not(crc) back down to 32 bits before returning.

    function crc32(uint256 table, bytes memory data) internal pure returns (uint32 result) {
        assembly ("memory-safe") {
            let crc := 0xffffffff
            let ptr := add(data, 0x20)
            let end := add(ptr, mload(data))
            for {} lt(ptr, end) { ptr := add(ptr, 1) } {
                let b := xor(and(crc, 0xff), byte(0, mload(ptr)))
                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))
            }
            result := and(not(crc), 0xffffffff)
        }
    }

    function crc32Chunk(uint256 table, bytes4 chunkType, bytes memory data) internal pure returns (uint32 result) {
        assembly ("memory-safe") {
            let crc := 0xffffffff
            let t := chunkType
            for { let i := 0 } lt(i, 4) { i := add(i, 1) } {
                // chunkType is bytes4 (left-aligned: byte 0 is bits [255:248]).
                let b := xor(and(crc, 0xff), and(shr(sub(248, mul(8, i)), t), 0xff))
                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))
            }
            let ptr := add(data, 0x20)
            let end := add(ptr, mload(data))
            for {} lt(ptr, end) { ptr := add(ptr, 1) } {
                let b := xor(and(crc, 0xff), byte(0, mload(ptr)))
                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))
            }
            result := and(not(crc), 0xffffffff)
        }
    }

    /// @dev `chunkType` is intentionally UNUSED in the loop below -- every call
    /// site (ChromaRendererPngLib._writePlteChunk/_writeIdatChunk) passes memPtr
    /// pointing AT the chunk's 4 type bytes in memory with totalLen already
    /// covering type+data together (matching the PNG spec's CRC32(type||data)),
    /// so a separate type-mixing pass here would double-count the type bytes.
    /// The parameter is kept for call-site self-documentation / a future
    /// memPtr-past-type calling convention, but must not be mixed in here.
    function crc32ChunkMem(uint256 table, bytes4, uint256 memPtr, uint256 totalLen)
        internal
        pure
        returns (uint32 result)
    {
        assembly ("memory-safe") {
            let crc := 0xffffffff
            let end := add(memPtr, totalLen)
            for {} lt(memPtr, end) { memPtr := add(memPtr, 1) } {
                let b := xor(and(crc, 0xff), byte(0, mload(memPtr)))
                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))
            }
            result := and(not(crc), 0xffffffff)
        }
    }

    function adler32(bytes memory data) internal pure returns (uint32 result) {
        assembly ("memory-safe") {
            let a := 1
            let b := 0
            let k := 0
            let ptr := add(data, 0x20)
            let end := add(ptr, mload(data))
            for {} lt(ptr, end) { ptr := add(ptr, 1) } {
                a := add(a, byte(0, mload(ptr)))
                b := add(b, a)
                k := add(k, 1)
                if eq(k, 256) {
                    a := mod(a, 65521)
                    b := mod(b, 65521)
                    k := 0
                }
            }
            a := mod(a, 65521)
            b := mod(b, 65521)
            result := or(shl(16, b), a)
        }
    }
}
```

---

## ChromaRendererPngLib.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ChromaRendererCrc32} from "./ChromaRendererCrc32.sol";

/// @notice Indexed PNG (4bpp, PLTE, zlib STORED) + SVG shell for tokenURI image field.
library ChromaRendererPngLib {
    uint256 internal constant GRID = 64;
    uint256 internal constant FILTERED_ROW = 33;
    uint256 internal constant RAW_IDAT_LEN = GRID * FILTERED_ROW;
    uint256 internal constant IDAT_PAYLOAD_LEN = 2 + 5 + RAW_IDAT_LEN + 4;
    uint256 internal constant PNG_LEN = 8 + 25 + 60 + 12 + IDAT_PAYLOAD_LEN + 12;

    uint256 internal constant OFF_IHDR = 8;
    uint256 internal constant OFF_PLTE = 33;
    uint256 internal constant OFF_IDAT = 93;
    uint256 internal constant OFF_IDAT_TYPE = 97;
    uint256 internal constant OFF_IDAT_DATA = 101;
    uint256 internal constant OFF_IEND = 2228;

    bytes internal constant PNG_SIG = hex"89504e470d0a1a0a";
    // width=64 (0x40), height=64 (0x40), bitDepth=4, colorType=3 (indexed),
    // compression=0, filter=0, interlace=0. Height was previously hardcoded
    // to 0x00000000 instead of 0x00000040 -- see ROBINHOOD_RENDERER_BUG.md.
    bytes internal constant IHDR_DATA = hex"00000040000000400403000000";

    bytes internal constant SVG_SHELL_PREFIX =
        bytes(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" image-rendering="pixelated"><image width="1024" height="1024" href="data:image/png;base64,'
        );
    bytes internal constant SVG_SHELL_SUFFIX = bytes('"/></svg>');

    struct RenderContext {
        bytes pixels;
        bytes3[16] paletteRgb;
        uint16[] diffIndexes;
        uint8[] diffColors;
    }

    struct PhaseGas {
        uint256 pixelPack;
        uint256 plteBuild;
        uint256 adler;
        uint256 crcRuntime;
        uint256 zlibFrame;
        uint256 pngAssemble;
    }

    function buildPng(RenderContext memory ctx) internal pure returns (bytes memory png) {
        png = new bytes(PNG_LEN);
        uint256 table = ChromaRendererCrc32.allocTable();

        for (uint256 i = 0; i < 8; ++i) {
            png[i] = PNG_SIG[i];
        }
        _writeU32(png, OFF_IHDR, 13);
        _writeType(png, OFF_IHDR + 4, "IHDR");
        for (uint256 i = 0; i < 13; ++i) {
            png[OFF_IHDR + 8 + i] = IHDR_DATA[i];
        }
        _writeU32(png, OFF_IHDR + 21, ChromaRendererCrc32.CRC_IHDR);

        _writePlteChunk(png, ctx.paletteRgb, table);
        bytes memory raw = _buildFilteredImage(ctx);
        _writeIdatChunk(png, raw, table);

        _writeU32(png, OFF_IEND, 0);
        _writeType(png, OFF_IEND + 4, "IEND");
        _writeU32(png, OFF_IEND + 8, ChromaRendererCrc32.CRC_IEND);
        raw;
    }

    function buildImageShellSvg(bytes memory png) internal pure returns (bytes memory) {
        return abi.encodePacked(SVG_SHELL_PREFIX, Base64.encode(png), SVG_SHELL_SUFFIX);
    }

    function profileCrcGas(RenderContext memory ctx) internal view returns (uint256 gasUsed) {
        bytes memory plte = _plteBytes(ctx.paletteRgb);
        bytes memory raw = _buildFilteredImage(ctx);
        bytes memory idatBody = _idatBody(raw);
        uint256 table = ChromaRendererCrc32.allocTable();
        uint256 g = gasleft();
        ChromaRendererCrc32.crc32Chunk(table, "PLTE", plte);
        ChromaRendererCrc32.crc32Chunk(table, "IDAT", idatBody);
        gasUsed = g - gasleft();
        raw;
        idatBody;
    }

    function profilePhases(RenderContext memory ctx) internal view returns (PhaseGas memory g) {
        uint256 mark = gasleft();
        bytes memory raw = _buildFilteredImage(ctx);
        g.pixelPack = mark - gasleft();

        mark = gasleft();
        bytes memory plte = _plteBytes(ctx.paletteRgb);
        g.plteBuild = mark - gasleft();

        mark = gasleft();
        uint32 adler = ChromaRendererCrc32.adler32(raw);
        g.adler = mark - gasleft();

        mark = gasleft();
        bytes memory idatBody = _idatBodyWithAdler(raw, adler);
        g.zlibFrame = mark - gasleft();

        mark = gasleft();
        uint256 table = ChromaRendererCrc32.allocTable();
        ChromaRendererCrc32.crc32Chunk(table, "PLTE", plte);
        ChromaRendererCrc32.crc32Chunk(table, "IDAT", idatBody);
        g.crcRuntime = mark - gasleft();

        mark = gasleft();
        bytes memory png = buildPng(ctx);
        g.pngAssemble = mark - gasleft();
        png;
        plte;
        idatBody;
        adler;
        raw;
    }

    function extractPlteRgb(bytes memory png) internal pure returns (bytes3[16] memory out) {
        uint256 i = 8;
        while (i + 12 <= png.length) {
            uint256 len = _readU32(png, i);
            bytes4 typ = bytes4(_readU32Bytes(png, i + 4));
            if (typ == "PLTE") {
                require(len == 48, "bad PLTE");
                for (uint8 c = 0; c < 16; ++c) {
                    uint256 p = i + 8 + uint256(c) * 3;
                    out[c] = bytes3(_readU24(png, p));
                }
                return out;
            }
            i += 12 + len;
        }
        revert("PLTE missing");
    }

    function paletteHexToRgb(string[16] memory paletteHex) internal pure returns (bytes3[16] memory rgb) {
        for (uint8 i = 0; i < 16; ++i) {
            rgb[i] = _parseHexColor(paletteHex[i]);
        }
    }

    function _writePlteChunk(bytes memory png, bytes3[16] memory palette, uint256 table) private pure {
        _writeU32(png, OFF_PLTE, 48);
        _writeType(png, OFF_PLTE + 4, "PLTE");
        for (uint8 i = 0; i < 16; ++i) {
            uint24 v = uint24(palette[i]);
            uint256 p = OFF_PLTE + 8 + uint256(i) * 3;
            png[p] = bytes1(uint8(v >> 16));
            png[p + 1] = bytes1(uint8(v >> 8));
            png[p + 2] = bytes1(uint8(v));
        }
        uint256 base;
        assembly ("memory-safe") {
            base := add(png, 0x20)
        }
        uint32 crc = ChromaRendererCrc32.crc32ChunkMem(table, "PLTE", base + OFF_PLTE + 4, 52);
        _writeU32(png, OFF_PLTE + 56, crc);
    }

    function _writeIdatChunk(bytes memory png, bytes memory raw, uint256 table) private pure {
        _writeU32(png, OFF_IDAT, IDAT_PAYLOAD_LEN);
        _writeType(png, OFF_IDAT + 4, "IDAT");
        uint32 adler = ChromaRendererCrc32.adler32(raw);
        _writeZlibStored(png, OFF_IDAT_DATA, raw, adler);
        uint256 base;
        assembly ("memory-safe") {
            base := add(png, 0x20)
        }
        uint32 crc = ChromaRendererCrc32.crc32ChunkMem(table, "IDAT", base + OFF_IDAT_TYPE, 4 + IDAT_PAYLOAD_LEN);
        _writeU32(png, OFF_IDAT_DATA + IDAT_PAYLOAD_LEN, crc);
    }

    function _writeType(bytes memory buf, uint256 offset, bytes4 chunkType) private pure {
        buf[offset] = chunkType[0];
        buf[offset + 1] = chunkType[1];
        buf[offset + 2] = chunkType[2];
        buf[offset + 3] = chunkType[3];
    }

    function _writeZlibStored(bytes memory png, uint256 offset, bytes memory raw, uint32 adler) private pure {
        png[offset] = 0x78;
        png[offset + 1] = 0x01;
        png[offset + 2] = 0x01;
        png[offset + 3] = bytes1(uint8(RAW_IDAT_LEN & 0xff));
        png[offset + 4] = bytes1(uint8(RAW_IDAT_LEN >> 8));
        uint16 nlen = uint16(~uint16(RAW_IDAT_LEN));
        png[offset + 5] = bytes1(uint8(nlen & 0xff));
        png[offset + 6] = bytes1(uint8(nlen >> 8));
        assembly ("memory-safe") {
            let dest := add(add(png, 0x20), add(offset, 7))
            let src := add(raw, 0x20)
            let i := 0
            for {} lt(i, 2112) { i := add(i, 0x20) } {
                mstore(add(dest, i), mload(add(src, i)))
            }
        }
        uint256 tail = offset + 7 + RAW_IDAT_LEN;
        png[tail] = bytes1(uint8(adler >> 24));
        png[tail + 1] = bytes1(uint8(adler >> 16));
        png[tail + 2] = bytes1(uint8(adler >> 8));
        png[tail + 3] = bytes1(uint8(adler));
    }

    function _idatBody(bytes memory raw) private pure returns (bytes memory body) {
        uint32 adler = ChromaRendererCrc32.adler32(raw);
        return _idatBodyWithAdler(raw, adler);
    }

    function _idatBodyWithAdler(bytes memory raw, uint32 adler) private pure returns (bytes memory body) {
        body = new bytes(IDAT_PAYLOAD_LEN);
        _writeZlibStored(body, 0, raw, adler);
    }

    function _parseHexColor(string memory hexColor) private pure returns (bytes3) {
        bytes memory h = bytes(hexColor);
        require(h.length == 7 && h[0] == "#", "bad hex");
        uint8 r = (_hexNibble(h[1]) << 4) | _hexNibble(h[2]);
        uint8 g = (_hexNibble(h[3]) << 4) | _hexNibble(h[4]);
        uint8 b = (_hexNibble(h[5]) << 4) | _hexNibble(h[6]);
        return bytes3(uint24(r) << 16 | uint24(g) << 8 | uint24(b));
    }

    function _hexNibble(bytes1 c) private pure returns (uint8) {
        uint8 v = uint8(c);
        if (v >= 48 && v <= 57) return v - 48;
        if (v >= 97 && v <= 102) return v - 87;
        if (v >= 65 && v <= 70) return v - 55;
        revert("hex");
    }

    function _buildFilteredImage(RenderContext memory ctx) private pure returns (bytes memory raw) {
        raw = new bytes(RAW_IDAT_LEN);
        uint256 diffLen = ctx.diffIndexes.length;
        if (diffLen == 0) {
            for (uint256 y = 0; y < GRID; ++y) {
                uint256 rowStart = y * FILTERED_ROW;
                raw[rowStart] = 0x00;
                uint256 rowBase = y * GRID;
                for (uint256 x = 0; x < GRID; x += 2) {
                    uint256 flat = rowBase + x;
                    uint8 packed = uint8(ctx.pixels[flat >> 1]);
                    uint8 left = (flat & 1) == 0 ? packed >> 4 : packed & 0x0f;
                    uint8 rightPacked = uint8(ctx.pixels[(flat + 1) >> 1]);
                    uint8 right = ((flat + 1) & 1) == 0 ? rightPacked >> 4 : rightPacked & 0x0f;
                    raw[rowStart + 1 + (x >> 1)] = bytes1((left << 4) | (right & 0x0f));
                }
            }
            return raw;
        }
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 rowStart = y * FILTERED_ROW;
            raw[rowStart] = 0x00;
            for (uint256 x = 0; x < GRID; x += 2) {
                uint8 left = _getCompositePixelIndex(ctx, x, y);
                uint8 right = _getCompositePixelIndex(ctx, x + 1, y);
                raw[rowStart + 1 + (x >> 1)] = bytes1((left << 4) | (right & 0x0f));
            }
        }
    }

    function _plteBytes(bytes3[16] memory palette) private pure returns (bytes memory plte) {
        plte = new bytes(48);
        for (uint8 i = 0; i < 16; ++i) {
            uint24 v = uint24(palette[i]);
            uint256 p = uint256(i) * 3;
            plte[p] = bytes1(uint8(v >> 16));
            plte[p + 1] = bytes1(uint8(v >> 8));
            plte[p + 2] = bytes1(uint8(v));
        }
    }

    function _getCompositePixelIndex(RenderContext memory ctx, uint256 x, uint256 y)
        private
        pure
        returns (uint8)
    {
        if (ctx.diffIndexes.length > 0) {
            uint16 flatIndex = uint16(y * GRID + x);
            for (uint256 i = ctx.diffIndexes.length; i > 0; --i) {
                if (ctx.diffIndexes[i - 1] == flatIndex) return ctx.diffColors[i - 1];
            }
        }
        uint256 flat = y * GRID + x;
        uint8 packed = uint8(ctx.pixels[flat >> 1]);
        if ((flat & 1) == 0) return packed >> 4;
        return packed & 0x0f;
    }

    function _writeU32(bytes memory buf, uint256 offset, uint256 value) private pure {
        buf[offset] = bytes1(uint8(value >> 24));
        buf[offset + 1] = bytes1(uint8(value >> 16));
        buf[offset + 2] = bytes1(uint8(value >> 8));
        buf[offset + 3] = bytes1(uint8(value));
    }

    function _readU32(bytes memory buf, uint256 offset) private pure returns (uint256) {
        return (uint256(uint8(buf[offset])) << 24) | (uint256(uint8(buf[offset + 1])) << 16)
            | (uint256(uint8(buf[offset + 2])) << 8) | uint256(uint8(buf[offset + 3]));
    }

    function _readU32Bytes(bytes memory buf, uint256 offset) private pure returns (uint32) {
        return (uint32(uint8(buf[offset])) << 24) | (uint32(uint8(buf[offset + 1])) << 16)
            | (uint32(uint8(buf[offset + 2])) << 8) | uint32(uint8(buf[offset + 3]));
    }

    function _readU24(bytes memory buf, uint256 offset) private pure returns (uint24) {
        return (uint24(uint8(buf[offset])) << 16) | (uint24(uint8(buf[offset + 1])) << 8) | uint24(uint8(buf[offset + 2]));
    }
}
```

---

## IChromaPaletteData.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaPaletteData {
    function MAX_VALID_PALETTE_ID() external pure returns (uint8);

    function ERROR_PALETTE_ID() external pure returns (uint8);

    function paletteColors(uint8 paletteId) external pure returns (string[16] memory);

    function paletteName(uint8 paletteId) external pure returns (string memory);
}
```

---

## PaletteStrings.sol

```solidity
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
```

---

