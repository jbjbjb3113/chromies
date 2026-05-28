# Chroma API + Ponder setup

## 1) Configure environment

Copy `.env.example` to `.env` and set:

- `CHROMA_ADDRESS` to your deployed `Chroma` ERC721 contract.
- `CHAIN_RPC_URL`/`PONDER_RPC_URL` to your chain RPC.
- `CHAIN_ID`/`PONDER_CHAIN_ID` to the same chain id.

## 2) Start indexer

```bash
npm run dev:ponder
```

This indexes `Transfer` events into:

- `token_owner` (current owner by tokenId)
- `transfer_event` (history/audit)

## 3) Start API

```bash
npm run dev:api
```

## Endpoints

- `GET /chroma/:id/pixels`
- `GET /chroma/:id/buffer`
- `GET /chroma/:id/palette`
- `GET /chroma/:id/traits`
- `GET /chroma/:id/image.svg`
- `GET /chroma/:id/image.png`
- `GET /chroma/:id/metadata`
- `GET /chroma/:id/owner`
- `GET /holders/:address`
- `GET /palettes`
- `GET /chroma/:id/canvas/diff`
- `GET /chroma/:id/canvas/info?user=0x...`
- `GET /history/:id`

## Notes

- Rate limit: 60 req/min/IP with standard headers.
- Errors are JSON: `{ "error": "message" }`.
- Ownership/holders come from Ponder SQL-over-HTTP.
- On-chain reads use viem.
