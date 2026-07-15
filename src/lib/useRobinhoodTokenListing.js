import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import {
  fetchRobinhoodTokenListing,
  revokeRobinhoodPngUrl,
} from "./robinhood-token-uri.js";
import { robinhoodChain } from "./robinhood-contract.js";

export function useRobinhoodTokenListing(tokenId, { enabled = true } = {}) {
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });
  const [state, setState] = useState({
    loading: enabled,
    error: null,
    listing: null,
    pngUrl: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, listing: null, pngUrl: null });
      return undefined;
    }
    if (!publicClient) return undefined;

    let cancelled = false;
    let pngUrl = null;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const listing = await fetchRobinhoodTokenListing(publicClient, tokenId);
        pngUrl = listing.pngBlobUrl;
        if (!cancelled) {
          setState({ loading: false, error: null, listing, pngUrl });
        } else if (pngUrl) {
          revokeRobinhoodPngUrl(pngUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error?.message ?? "Failed to load token listing.",
            listing: null,
            pngUrl: null,
          });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (pngUrl) revokeRobinhoodPngUrl(pngUrl);
    };
  }, [publicClient, tokenId, enabled]);

  return state;
}
