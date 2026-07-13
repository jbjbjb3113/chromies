# Chromies Launch Checklist

## Before Mainnet Deploy

### Contracts
- [ ] **`KNOWN_DRIFT.md` empty / `known_drift.json` `waived_palette_ids: []`** — no palette drift waivers ship to mainnet (see `chromies-engine/reports/KNOWN_DRIFT.md`)
- [ ] Redeploy Sepolia with level system (new contracts)
- [ ] Test level trait showing in tokenURI
- [ ] Informal contract review (ask Serc)
- [ ] Fresh holder snapshots (Normies + Brain Rots) close to mint date
- [ ] Regenerate merkle trees with fresh snapshot
- [ ] Regenerate mint data + reveal merkle after final trait additions

### Art Assets
- [ ] Agent assets (HEAD_Agent, NECK_Agent)
- [ ] Cat neck asset (NECK_Cat)
- [ ] Fat head variant
- [ ] New glasses styles
- [ ] New beard styles
- [ ] New shirt styles
- [ ] New earring styles

### Site
- [ ] Quantity selector on mint page (max 2 Tier1/2, max 3 Public)
- [ ] Disconnect/switch wallet button on mint page
- [ ] Landing page hero redesign complete
- [ ] Background removal on WebsiteForeground images
- [ ] Foreground scroll characters wired to landing page
- [ ] Mobile wallet QR tested end to end

### OpenSea
- [ ] Collection banner image
- [ ] Collection description
- [ ] Royalties verified (5%)
- [ ] Social links (Twitter/X, chromies.art)
- [ ] Import contract on mainnet

### Mainnet
- [ ] Deploy contracts to mainnet
- [ ] Update CHROMA_ADDRESS to mainnet
- [ ] Update site to point to mainnet contract
- [ ] Set phase to Tier 1 (AllowlistOne)
- [ ] Announce mint

### Infrastructure
- [x] Repo key handling hardened (`broadcast/` + `run-latest.json` gitignored; `.env.example` has `ALCHEMY_MAINNET_KEY` / `SEPOLIA_RPC_URL` slots — no keys in tracked files)
- [ ] Rotate Alchemy API key in dashboard (JB — old key may exist in local `.env` / `.env.local`; paste new key after rotation, before mainnet)
- [ ] Verify Alchemy free tier sufficient (300M CU/month — safe for mint event)
- [ ] Consider Alchemy Growth plan for mainnet analytics (optional)

## Post-Mint
- [ ] Pixel marketplace (chromies.art/market)
- [ ] Rarity site (rarity.chromies.art)
- [ ] Awaken Chromie event (ERC-8004)
- [ ] AI Auditor Agent
- [ ] Chromies API
- [ ] Zombie layer effect
- [ ] Normified mode canvas slider
