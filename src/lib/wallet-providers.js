/** Shared injected-wallet provider detection (used by wagmi config + connect modal). */

function getEthereum() {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

function findEthereumProvider(predicate) {
  const eth = getEthereum();
  if (!eth) return null;

  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    const match = eth.providers.find(predicate);
    if (match) return match;
  }

  return predicate(eth) ? eth : null;
}

export function getMetaMaskProvider() {
  return findEthereumProvider(
    (provider) =>
      Boolean(provider?.isMetaMask) &&
      !provider?.isTrust &&
      !provider?.isRabby &&
      !provider?.isBraveWallet,
  );
}

export function getTrustProvider() {
  if (typeof window === "undefined") return null;
  if (window.trustwallet?.ethereum) return window.trustwallet.ethereum;
  return findEthereumProvider((provider) => Boolean(provider?.isTrust));
}

export function getPhantomProvider() {
  if (typeof window === "undefined") return null;
  if (window.phantom?.ethereum) return window.phantom.ethereum;
  return findEthereumProvider((provider) => Boolean(provider?.isPhantom));
}

export function getCoinbaseProvider() {
  if (typeof window === "undefined") return null;
  if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
  return findEthereumProvider((provider) => Boolean(provider?.isCoinbaseWallet));
}

export function getRainbowProvider() {
  if (typeof window === "undefined") return null;
  if (window.rainbow) return window.rainbow;
  return findEthereumProvider((provider) => Boolean(provider?.isRainbow));
}

export function getOKXProvider() {
  if (typeof window === "undefined") return null;
  if (window.okxwallet) return window.okxwallet;
  return findEthereumProvider(
    (provider) => Boolean(provider?.isOKExWallet || provider?.isOKX),
  );
}

export function getRabbyProvider() {
  return findEthereumProvider((provider) => Boolean(provider?.isRabby));
}

export function getBraveProvider() {
  return findEthereumProvider((provider) => Boolean(provider?.isBraveWallet));
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

export function isWalletInstalled(walletId) {
  const wallet = INJECTED_WALLETS[walletId];
  if (!wallet) return false;
  return Boolean(wallet.getProvider());
}

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
