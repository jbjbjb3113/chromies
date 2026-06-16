# Chromies Session Handoff

## Current Status
Contracts deployed on Sepolia, site live at chromies.art, mint page wired.

## Latest Sepolia Contracts
| Contract | Address |
|----------|---------|
| ChromaStorage | `0x78ee267c09be83eee64050e21ecc2ffe8296ae38` |
| Chroma | `0xba4c3797a18958877f895b69ca4a67b914949f5d` |
| ChromaCanvasV2 | `0x731c47cceabc4bfbddd4621e0167580dd2614e05` |
| ChromaRenderer | `0x5b92421d7a440a72388869403934436fe7eee6e6` |
| PixelMarketplace | `0x5aa3f3836013fb2c3d7261d885f78a8bdc42123d` |

## Merkle Roots
- Tier 1 (Normies): `0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39`
- Tier 2 (Brain Rots): `0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac`
- Reveal Root: `0x8ac55bc03bceefcbf5c389513f695101d2b27504c3ef02486c2a45f9557c7d54`

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
$env:CHROMA_ADDRESS = "0xba4c3797a18958877f895b69ca4a67b914949f5d"
$env:CHROMA_STORAGE_ADDRESS = "0x78ee267c09be83eee64050e21ecc2ffe8296ae38"
$env:CANVAS_ADDRESS = "0x731c47cceabc4bfbddd4621e0167580dd2614e05"
$env:CHROMA_RENDERER_ADDRESS = "0x5b92421d7a440a72388869403934436fe7eee6e6"
$env:MARKETPLACE_ADDRESS = "0x5aa3f3836013fb2c3d7261d885f78a8bdc42123d"
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
