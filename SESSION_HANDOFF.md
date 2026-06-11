# Chromies Session Handoff

## Current Status
Contracts deployed on Sepolia, site live at chromies.art, mint page wired.

## Latest Sepolia Contracts
| Contract | Address |
|----------|---------|
| ChromaStorage | `0x7a347C8eBa0D2662679ef6B27234c446F44Ca1Dd` |
| Chroma | `0x16cE47A7e36053d6460347a22B9857729eb09C94` |
| ChromaCanvasV2 | `0x35BdcfA0Dc7bCfC813C6B4e7da3AB58D05a5e274` |
| ChromaRenderer | `0x3dCE3d1c8276F75A6133003617D2909818CD5BaE` |
| PixelMarketplace | `0xBE257661D9574E64B96416D901333BE75AFfC12c` |

## Merkle Roots
- Tier 1 (Normies): `0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39`
- Tier 2 (Brain Rots): `0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac`
- Reveal Root: `0x470a9c1fc5b8ae47d4e425b313351a7258770da69a3083644ee7493fb1d749c3`

## Recent Work (This Session)
- Added 42 shirt palette variants (6 base × 7 shirt colors) — slot 9 repurposed as shirt/hood color
- Shirt colors per family defined (SIGNAL: Red/Purple/Orange/Olive/Green/Gold/Blue)
- Pixel scatter effect added to mutation system (scatter/scatterRadius per tier)
- 4 new glasses variants: PiratePatch, 3DGlasses, DFrame, DFrameFilled
- Wallet selection modal added to mint page (MetaMask, Phantom, Trust, Ledger, Other)
- Level system live (totalApSpent/100 + 1, shown as numeric trait in tokenURI)
- 31/31 tests passing

## In Progress
- Shirt palette system just wired — gallery not yet run/reviewed
- Pixel scatter gallery not yet reviewed
- Beard slot 9 → slot 2 fix still needed in Aseprite (BEARD_Full, BEARD_Goat, MUSTACHE_Thick)
- bridge-mint-data.js PALETTE_BYTES now goes to index 67 (42 new shirt palette entries added)
- trait-breakdown.js decode table needs updating for new palette indices 26-67

## Next Steps
1. Run gallery, review shirt colors and scatter effect
2. Fix beard assets in Aseprite (replace #1c1c26 with #2a1518)
3. Add shirt/hood to mutableSlots in chromies-config.js (paletteFamilies: shirt/hood: [1,3,9])
4. Regenerate mint data + reveal merkle once assets finalized
5. Commit everything
6. Redeploy Sepolia with final trait set
7. Wire quantity selector on mint page
8. OpenSea collection setup
9. Mainnet deploy planning

## Art Pipeline Commands
```powershell
cd X:\Cursor\Homies\art-pipeline
node gallery.js --count 400
node bridge-mint-data.js --count 5150 --start 1
node generate-reveal-merkle.js
node trait-breakdown.js
```

## PowerShell Env Reload
```powershell
$env:PRIVATE_KEY = (Get-Content .env | Select-String "PRIVATE_KEY").ToString().Split("=",2)[1]
$env:SEPOLIA_RPC_URL = (Get-Content .env | Select-String "SEPOLIA_RPC_URL").ToString().Split("=",2)[1]
$env:CHROMA_ADDRESS = "0x16cE47A7e36053d6460347a22B9857729eb09C94"
$env:CANVAS_ADDRESS = "0x35BdcfA0Dc7bCfC813C6B4e7da3AB58D05a5e274"
$env:MARKETPLACE_ADDRESS = "0xBE257661D9574E64B96416D901333BE75AFfC12c"
```

## Foundry
`C:\Foundry\foundry_nightly_win32_amd64\forge.exe`

## Key Files
- `art-pipeline/chromies-config.js` — palettes, mutation, characters
- `art-pipeline/traits.json` — slot catalog with weights (68 palettes total)
- `art-pipeline/bridge-mint-data.js` — PALETTE_BYTES 0-67
- `contracts/Chroma.sol` — ERC721, mint, reveal, inscribe, lock
- `contracts/ChromaCanvas.sol` — AP economy, level system, canvas edits
- `contracts/ChromaRenderer.sol` — on-chain SVG with all traits including Level
- `src/lib/chroma-contract.js` — frontend contract config
- `CHECKLIST.md` — full launch checklist
