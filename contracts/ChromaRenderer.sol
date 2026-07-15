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
import {ChromaTraitLabels} from "./generated/ChromaTraitLabels.sol";

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
            _jsonAttribute("Character", ChromaTraitLabels.characterLabel(uint8(traits[0]))),
            ",",
            _jsonAttribute("Palette", paletteData.paletteName(uint8(traits[1]))),
            ",",
            _jsonAttribute("Hood", ChromaTraitLabels.hoodLabel(uint8(traits[2]))),
            ",",
            _jsonAttribute("Shirt", ChromaTraitLabels.shirtLabel(uint8(traits[3]))),
            ",",
            _jsonAttribute("Body", ChromaTraitLabels.bodyLabel(uint8(traits[4]))),
            ",",
            _jsonAttribute("Bodytattoo", ChromaTraitLabels.bodytattooLabel(uint8(traits[5]))),
            ",",
            _jsonAttribute("Necklace", ChromaTraitLabels.necklaceLabel(uint8(traits[6]))),
            ",",
            _jsonAttribute("Tattoo", ChromaTraitLabels.tattooLabel(uint8(traits[7])))
        );
        bytes memory faceTraits = abi.encodePacked(
            ",",
            _jsonAttribute("Beard", ChromaTraitLabels.beardLabel(uint8(traits[9]))),
            ",",
            _jsonAttribute("Mustache", ChromaTraitLabels.mustacheLabel(uint8(traits[10]))),
            ",",
            _jsonAttribute("Eyes", ChromaTraitLabels.eyesLabel(uint8(traits[11]))),
            ",",
            _jsonAttribute("Earrings", ChromaTraitLabels.earringsLabel(uint8(traits[12]))),
            ",",
            _jsonAttribute("Glasses", ChromaTraitLabels.glassesLabel(uint8(traits[13]))),
            ",",
            _jsonAttribute("Hair", ChromaTraitLabels.hairLabel(uint8(traits[14])))
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
}
