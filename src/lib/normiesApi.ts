const BASE = "https://api.normies.art";

export type NormieCanvasInfo = {
  actionPoints: number;
  level: number;
  customized: boolean;
  delegate: string | null;
  delegateSetBy: string | null;
};

export type NormieOwnerInfo = {
  tokenId: number;
  owner: string;
};

export type HolderNormiesInfo = {
  address: string;
  tokenIds: number[];
};

export class NormiesApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NormiesApiError";
    this.status = status;
  }
}

async function normiesFetch(path: string, label: string): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`);
  } catch {
    throw new NormiesApiError(0, `${label}: network error`);
  }
}

export async function getNormieCanvasInfo(tokenId: number): Promise<NormieCanvasInfo> {
  const res = await normiesFetch(`/normie/${tokenId}/canvas/info`, `Normie ${tokenId} canvas/info`);
  if (!res.ok) throw new NormiesApiError(res.status, `Normie ${tokenId} canvas/info failed: ${res.status}`);
  return res.json();
}

export async function getNormieOwner(tokenId: number): Promise<NormieOwnerInfo> {
  const res = await normiesFetch(`/normie/${tokenId}/owner`, `Normie ${tokenId} owner`);
  if (!res.ok) throw new NormiesApiError(res.status, `Normie ${tokenId} owner failed: ${res.status}`);
  return res.json();
}

export function getNormieImageUrl(tokenId: number): string {
  return `${BASE}/normie/${tokenId}/image.svg`;
}

export async function getHolderNormies(address: string): Promise<HolderNormiesInfo> {
  const res = await normiesFetch(`/holders/${address}`, "Holder lookup");
  if (!res.ok) throw new NormiesApiError(res.status, `Holder lookup failed: ${res.status}`);
  return res.json();
}

/** User-facing message for panel error states — never throws. */
export function formatNormiesApiError(error: unknown, tokenId?: number): string {
  const idLabel = tokenId != null ? `Normie #${tokenId}` : "Normie";
  const status = error instanceof NormiesApiError ? error.status : null;

  if (status === 404) {
    return tokenId != null
      ? `${idLabel} not found — not minted or burned.`
      : "No Normies found for this wallet.";
  }
  if (status === 429) {
    return "Normies API rate limit — try again in a moment.";
  }
  if (status === 0) {
    return "Could not reach the Normies API. Check your connection.";
  }
  if (status != null) {
    return `${idLabel} lookup failed (HTTP ${status}).`;
  }
  return "Something went wrong loading Normies data.";
}
