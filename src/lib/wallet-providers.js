/** Shared injected-wallet provider detection (used by wagmi config + connect modal). */

const METAMASK_RDNS = ["io.metamask", "io.metamask.mobile"];

/** Flags set by wallets that spoof isMetaMask — aligned with @wagmi/core injected targetMap. */
const METAMASK_SPOOFER_FLAGS = [
  "isApexWallet",
  "isAvalanche",
  "isBitKeep",
  "isBlockWallet",
  "isCoinbaseWallet",
  "isKuCoinWallet",
  "isMathWallet",
  "isOkxWallet",
  "isOKExWallet",
  "isOneInchIOSWallet",
  "isOneInchAndroidWallet",
  "isOpera",
  "isPhantom",
  "isPortal",
  "isRabby",
  "isTokenPocket",
  "isTokenary",
  "isTrust",
  "isUniswapWallet",
  "isZerion",
];

const eip6963ProvidersByRdns = new Map();

function initEip6963Discovery() {
  if (typeof window === "undefined") return;
  if (window.__homiesEip6963Init) return;
  window.__homiesEip6963Init = true;

  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = event.detail;
    const rdns = detail?.info?.rdns;
    const provider = detail?.provider;
    if (rdns && provider) {
      eip6963ProvidersByRdns.set(rdns, provider);
    }
  });

  refreshEip6963Discovery();
}

/** Re-request EIP-6963 announcements (e.g. when the connect modal opens). */
export function refreshEip6963Discovery() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function getEip6963Provider(rdnsValues) {
  for (const rdns of rdnsValues) {
    const provider = eip6963ProvidersByRdns.get(rdns);
    if (provider) return provider;
  }
  return null;
}

initEip6963Discovery();

function getEthereum() {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

function summarizeProvider(provider) {
  if (!provider) return null;
  const flags = {};
  for (const flag of [
    ...METAMASK_SPOOFER_FLAGS,
    "isMetaMask",
    "isBraveWallet",
    "isRainbow",
  ]) {
    if (provider[flag]) flags[flag] = true;
  }
  return flags;
}

function isRealMetaMaskProvider(provider) {
  if (!provider?.isMetaMask) return false;
  // Brave mimics MetaMask unless it exposes MetaMask-style internals.
  if (provider.isBraveWallet && !provider._events && !provider._state) {
    return false;
  }
  for (const flag of METAMASK_SPOOFER_FLAGS) {
    if (provider[flag]) return false;
  }
  return true;
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
  const from6963 = getEip6963Provider(METAMASK_RDNS);
  if (from6963) return from6963;

  return findEthereumProvider(isRealMetaMaskProvider);
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

  refreshEip6963Discovery();

  for (const [walletId, { getProvider }] of Object.entries(INJECTED_WALLETS)) {
    availability[walletId] = Boolean(getProvider());
  }
  availability.walletConnect = Boolean(projectId);
  return availability;
}

/** Dev-only: log provider state when MetaMask detection is ambiguous. */
export function debugMetaMaskProviderDetection() {
  if (typeof window === "undefined") return;

  const eth = getEthereum();
  const providers = Array.isArray(eth?.providers) ? eth.providers : [];
  const eip6963 = Object.fromEntries(
    [...eip6963ProvidersByRdns.entries()].map(([rdns]) => [rdns, true]),
  );

  console.group("[Homies] MetaMask provider detection");
  console.log("window.ethereum flags:", summarizeProvider(eth));
  console.log(
    "window.ethereum.providers:",
    providers.length
      ? providers.map((provider, index) => ({
          index,
          flags: summarizeProvider(provider),
        }))
      : "(none — singular window.ethereum only)",
  );
  console.log("EIP-6963 rdns cache:", eip6963);
  console.log("getMetaMaskProvider() result:", Boolean(getMetaMaskProvider()));
  console.log("isWalletInstalled('metaMask'):", isWalletInstalled("metaMask"));
  console.groupEnd();
}
