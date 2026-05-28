import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import { createClient, eq } from "@ponder/client";
import { createPublicClient, getAddress, Hex, http } from "viem";
import * as ponderSchema from "../ponder.schema";
import { chromaAbi, chromaCanvasAbi, chromaRendererAbi, chromaStorageAbi } from "../abis/Chroma";
import { decodeTraits, PALETTES } from "./palettes";

const app = express();
app.disable("x-powered-by");

const apiPort = Number(process.env.API_PORT ?? 8080);
const rpcUrl = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
const chainId = Number(process.env.CHAIN_ID ?? 31337);
const chromaAddress = process.env.CHROMA_ADDRESS as `0x${string}` | undefined;
const canvasAddress = process.env.CANVAS_ADDRESS as `0x${string}` | undefined;
const ponderSqlUrl = process.env.PONDER_SQL_URL ?? "http://127.0.0.1:42069/sql";

if (!chromaAddress) throw new Error("Missing CHROMA_ADDRESS in environment.");
const chromaContractAddress = chromaAddress;

const publicClient = createPublicClient({
  transport: http(rpcUrl),
  chain: {
    id: chainId,
    name: "chroma",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  },
});

const ponderClient = createClient(ponderSqlUrl, { schema: ponderSchema });

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

function fail(res: express.Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

function tokenIdFromParam(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Invalid token id.");
  return BigInt(value);
}

function requireCanvasAddress(): `0x${string}` {
  if (!canvasAddress) throw new Error("Canvas not configured.");
  return canvasAddress;
}

function unpack4bppToHexNibbles(bufferHex: `0x${string}`): string {
  const packed = Buffer.from(bufferHex.slice(2), "hex");
  if (packed.length !== 2048) throw new Error("Invalid packed pixel buffer length.");

  const out = Buffer.allocUnsafe(4096);
  const hexChars = "0123456789ABCDEF";
  for (let i = 0; i < packed.length; i++) {
    const b = packed[i]!;
    out[i * 2] = hexChars.charCodeAt((b >> 4) & 0x0f);
    out[i * 2 + 1] = hexChars.charCodeAt(b & 0x0f);
  }
  return out.toString("ascii");
}

async function resolveStorageAddress() {
  return publicClient.readContract({
    address: chromaContractAddress,
    abi: chromaAbi,
    functionName: "chromaStorage",
  });
}

async function resolveRendererAddress() {
  return publicClient.readContract({
    address: chromaContractAddress,
    abi: chromaAbi,
    functionName: "renderer",
  });
}

app.get("/palettes", (_req, res) => {
  res.json(PALETTES);
});

app.get("/chroma/:id/buffer", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const storageAddress = await resolveStorageAddress();
    const pixels = await publicClient.readContract({
      address: storageAddress,
      abi: chromaStorageAbi,
      functionName: "getPixels",
      args: [tokenId],
    });
    res.json({ tokenId: tokenId.toString(), buffer: pixels });
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/pixels", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const storageAddress = await resolveStorageAddress();
    const pixels = await publicClient.readContract({
      address: storageAddress,
      abi: chromaStorageAbi,
      functionName: "getPixels",
      args: [tokenId],
    });
    res.json({ tokenId: tokenId.toString(), pixels: unpack4bppToHexNibbles(pixels) });
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/traits", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const storageAddress = await resolveStorageAddress();
    const rawTraits = await publicClient.readContract({
      address: storageAddress,
      abi: chromaStorageAbi,
      functionName: "getTraits",
      args: [tokenId],
    });

    const decoded = decodeTraits(rawTraits);
    res.json({
      tokenId: tokenId.toString(),
      raw: rawTraits,
      decoded,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/palette", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const storageAddress = await resolveStorageAddress();
    const rawTraits = await publicClient.readContract({
      address: storageAddress,
      abi: chromaStorageAbi,
      functionName: "getTraits",
      args: [tokenId],
    });
    const decoded = decodeTraits(rawTraits);
    const palette = PALETTES.find((p) => p.id === decoded.paletteId)!;
    res.json(palette);
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/image.svg", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const rendererAddress = await resolveRendererAddress();
    const svg = await publicClient.readContract({
      address: rendererAddress,
      abi: chromaRendererAbi,
      functionName: "renderSVG",
      args: [tokenId],
    });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.send(svg);
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/image.png", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const rendererAddress = await resolveRendererAddress();
    const svg = await publicClient.readContract({
      address: rendererAddress,
      abi: chromaRendererAbi,
      functionName: "renderSVG",
      args: [tokenId],
    });

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/metadata", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const uri = await publicClient.readContract({
      address: chromaContractAddress,
      abi: chromaAbi,
      functionName: "tokenURI",
      args: [tokenId],
    });

    const prefix = "data:application/json;base64,";
    if (!uri.startsWith(prefix)) return fail(res, 500, "Invalid tokenURI format.");
    const json = Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
    res.json(JSON.parse(json));
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/owner", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const row = await ponderClient.db.query.tokenOwner.findFirst({
      where: eq(ponderSchema.tokenOwner.tokenId, tokenId),
    });

    if (!row) return fail(res, 404, "Owner not found for token.");
    res.json({
      tokenId: tokenId.toString(),
      owner: row.owner,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/holders/:address", async (req, res, next) => {
  try {
    const ownerAddress = getAddress(req.params.address);
    const rows = await ponderClient.db.query.tokenOwner.findMany({
      where: eq(ponderSchema.tokenOwner.owner, ownerAddress as Hex),
      orderBy: (tokenOwner, { asc }) => asc(tokenOwner.tokenId),
    });

    res.json({
      owner: ownerAddress,
      tokenIds: rows.map((r) => r.tokenId.toString()),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/canvas/diff", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const canvas = requireCanvasAddress();
    const [pixelIndexes, newColorIndexes] = await publicClient.readContract({
      address: canvas,
      abi: chromaCanvasAbi,
      functionName: "getDiff",
      args: [tokenId],
    });

    const diff = pixelIndexes.map((pixelIndex, i) => ({
      pixelIndex: Number(pixelIndex),
      x: Number(pixelIndex) % 64,
      y: Math.floor(Number(pixelIndex) / 64),
      newColorIndex: Number(newColorIndexes[i]!),
    }));

    res.json({ tokenId: tokenId.toString(), diff });
  } catch (error) {
    next(error);
  }
});

app.get("/chroma/:id/canvas/info", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const user = req.query.user ? getAddress(String(req.query.user)) : "0x0000000000000000000000000000000000000000";
    const canvas = requireCanvasAddress();

    const [points, diffCount, customized, hasPendingCommit] = await publicClient.readContract({
      address: canvas,
      abi: chromaCanvasAbi,
      functionName: "getCanvasInfo",
      args: [user, tokenId],
    });

    res.json({
      tokenId: tokenId.toString(),
      user,
      actionPoints: points.toString(),
      diffCount: diffCount.toString(),
      customized,
      hasPendingCommit,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/history/:id", async (req, res, next) => {
  try {
    const tokenId = tokenIdFromParam(req.params.id);
    const canvas = requireCanvasAddress();

    const canvasLogs = await publicClient.getLogs({
      address: canvas,
      event: chromaCanvasAbi[4],
      args: { tokenId },
      fromBlock: 0n,
      toBlock: "latest",
    });

    const transfers = await ponderClient.db.query.transferEvent.findMany({
      where: eq(ponderSchema.transferEvent.tokenId, tokenId),
      orderBy: (transferEvent, { asc }) => asc(transferEvent.timestamp),
    });

    res.json({
      tokenId: tokenId.toString(),
      transfers: transfers.map((t) => ({
        from: t.from,
        to: t.to,
        timestamp: t.timestamp,
        blockNumber: t.blockNumber.toString(),
      })),
      canvas: canvasLogs.map((log) => ({
        blockNumber: log.blockNumber?.toString() ?? null,
        txHash: log.transactionHash ?? null,
        user: log.args.user,
        entriesApplied: log.args.entriesApplied?.toString() ?? "0",
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error && err.message === "Invalid token id.") {
    return fail(res, 400, err.message);
  }
  if (err instanceof Error && err.message === "Canvas not configured.") {
    return fail(res, 400, err.message);
  }

  if (err instanceof Error && /revert|execution reverted|TokenNotWritten|ERC721NonexistentToken/.test(err.message)) {
    return fail(res, 404, "Resource not found.");
  }

  if (err instanceof SyntaxError) return fail(res, 500, "Invalid metadata JSON.");

  console.error(`[${req.method}] ${req.path}`, err);
  return fail(res, 500, "Internal server error.");
});

app.listen(apiPort, () => {
  console.log(`Chroma API listening on http://localhost:${apiPort}`);
});
