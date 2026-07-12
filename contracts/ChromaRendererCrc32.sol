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
