// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";
import {WriterCaller} from "./Chroma.t.sol";

/// @notice Export on-chain renderImageShell output for Python raster parity checks.
contract ChromaRendererParityTest is Test {
    WriterCaller internal writer;
    ChromaStorage internal storageContract;
    ChromaRenderer internal renderer;

    function setUp() public {
        writer = new WriterCaller();
        storageContract = new ChromaStorage(address(this), address(writer));
        renderer = ChromaFixtures.deployRendererOnly(storageContract, address(this));
    }

    function test_ExportOnChainSvgFixtures() public {
        string memory root = vm.projectRoot();
        string memory inPath = string.concat(root, "/chromies-engine/generated/parity_fixtures.csv");
        string memory outDir = string.concat(root, "/chromies-engine/generated/onchain_svg");
        string memory data = vm.readFile(inPath);
        string[] memory lines = vm.split(data, "\n");

        uint256 exported;
        for (uint256 i = 0; i < lines.length; ++i) {
            if (bytes(lines[i]).length == 0) continue;
            if (_startsWith(lines[i], "token_id")) continue;

            (uint256 tokenId, string memory pixelsHex, string memory traitsHex) = _parseCsvLine(lines[i]);
            if (tokenId == 0 || bytes(pixelsHex).length == 0) continue;
            bytes memory pixels = vm.parseBytes(pixelsHex);
            bytes memory traits = vm.parseBytes(traitsHex);
            writer.write(storageContract, tokenId, pixels, traits);

            string memory shell = renderer.renderImageShell(tokenId);
            string memory outPath =
                string.concat(outDir, "/", vm.toString(tokenId), ".svg");
            vm.writeFile(outPath, shell);
            ++exported;
        }
        assertGt(exported, 0, "no fixtures exported");
    }

    function _startsWith(string memory value, string memory prefix) private pure returns (bool) {
        bytes memory v = bytes(value);
        bytes memory p = bytes(prefix);
        if (p.length > v.length) return false;
        for (uint256 i = 0; i < p.length; ++i) {
            if (v[i] != p[i]) return false;
        }
        return true;
    }

    function _parseCsvLine(string memory line)
        internal
        returns (uint256 tokenId, string memory pixelsHex, string memory traitsHex)
    {
        bytes memory raw = bytes(line);
        uint256 p0 = _indexOfByte(raw, bytes1(","), 0);
        uint256 p1 = _indexOfByte(raw, bytes1(","), p0 + 1);
        require(p0 != type(uint256).max && p1 != type(uint256).max, "bad csv");
        tokenId = vm.parseUint(string(_slice(raw, 0, p0)));
        pixelsHex = string(_slice(raw, p0 + 1, p1));
        traitsHex = string(_slice(raw, p1 + 1, raw.length));
        traitsHex = _trimCarriageReturn(traitsHex);
        pixelsHex = _trimCarriageReturn(pixelsHex);
    }

    function _trimCarriageReturn(string memory value) private pure returns (string memory) {
        bytes memory raw = bytes(value);
        if (raw.length > 0 && raw[raw.length - 1] == bytes1("\r")) {
            bytes memory out = new bytes(raw.length - 1);
            for (uint256 i = 0; i < out.length; ++i) {
                out[i] = raw[i];
            }
            return string(out);
        }
        return value;
    }

    function _indexOfByte(bytes memory data, bytes1 needle, uint256 from) private pure returns (uint256) {
        for (uint256 i = from; i < data.length; ++i) {
            if (data[i] == needle) return i;
        }
        return type(uint256).max;
    }

    function _slice(bytes memory data, uint256 start, uint256 end) private pure returns (bytes memory) {
        require(end >= start, "bad slice");
        bytes memory out = new bytes(end - start);
        for (uint256 i = 0; i < out.length; ++i) {
            out[i] = data[start + i];
        }
        return out;
    }
}
