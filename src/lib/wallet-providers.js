/** Shared injected-wallet provider detection (used by wagmi config + connect modal). */

export function getMetaMaskProvider() {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isMetaMask && !provider.isTrust) ?? null;
  }
  return eth.isMetaMask && !eth.isTrust ? eth : null;
}

export function getTrustProvider() {
  if (typeof window === "undefined") return null;
  if (window.trustwallet?.ethereum) return window.trustwallet.ethereum;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isTrust) ?? null;
  }
  return eth.isTrust ? eth : null;
}

export function getPhantomProvider() {
  if (typeof window === "undefined") return null;
  return window.phantom?.ethereum ?? null;
}

export function getCoinbaseProvider() {
  if (typeof window === "undefined") return null;
  if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isCoinbaseWallet) ?? null;
  }
  return eth.isCoinbaseWallet ? eth : null;
}

export function getRainbowProvider() {
  if (typeof window === "undefined") return null;
  if (window.rainbow) return window.rainbow;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isRainbow) ?? null;
  }
  return eth.isRainbow ? eth : null;
}

export function getOKXProvider() {
  if (typeof window === "undefined") return null;
  if (window.okxwallet) return window.okxwallet;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isOKExWallet || provider.isOKX) ?? null;
  }
  return eth.isOKExWallet || eth.isOKX ? eth : null;
}

export function getRabbyProvider() {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.isRabby) return eth;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isRabby) ?? null;
  }
  return null;
}

export function getBraveProvider() {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.isBraveWallet) return eth;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isBraveWallet) ?? null;
  }
  return null;
}

/** Wallet ids that map 1:1 to injected connectors registered in wagmi config. */
export const INJECTED_WALLET_IDS = [
  "metaMask",
  "phantom",
  "trust",
  "coinbase",
  "rainbow",
  "okx",
  "rabby",
  "brave",
];

export const INJECTED_WALLETS = {
  metaMask: { name: "MetaMask", getProvider: getMetaMaskProvider },
  phantom: { name: "Phantom", getProvider: getPhantomProvider },
  trust: { name: "Trust Wallet", getProvider: getTrustProvider },
  coinbase: { name: "Coinbase Wallet", getProvider: getCoinbaseProvider },
  rainbow: { name: "Rainbow", getProvider: getRainbowProvider },
  okx: { name: "OKX Wallet", getProvider: getOKXProvider },
  rabby: { name: "Rabby", getProvider: getRabbyProvider },
  brave: { name: "Brave Wallet", getProvider: getBraveProvider },
};

export function detectWalletAvailability(projectId) {
  const availability = { walletConnect: false };
  for (const walletId of INJECTED_WALLET_IDS) {
    availability[walletId] = false;
  }
  if (typeof window === "undefined") return availability;

  for (const [walletId, { getProvider }] of Object.entries(INJECTED_WALLETS)) {
    availability[walletId] = Boolean(getProvider());
  }
  availability.walletConnect = Boolean(projectId);
  return availability;
}
