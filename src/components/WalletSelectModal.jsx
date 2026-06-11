import React, { useEffect, useMemo, useState } from "react";
import { useConnect, useConnectors } from "wagmi";
import { injected } from "wagmi/connectors";
import { projectId } from "../lib/wagmi.js";

const WALLET_BTN_CLASS =
  "flex w-full items-center gap-3 border border-ink bg-white px-4 py-3 text-left text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-ink/5 disabled:text-ink/35 disabled:hover:border-ink/20 disabled:hover:text-ink/35";

function MetaMaskIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <path fill="#E17726" d="M20.2 4.5 13.1 9.9l1.3-3.1 5.8-2.3Z" />
      <path fill="#E27625" d="M3.8 4.5l7 5.5-1.2-3.2L3.8 4.5Z" />
      <path fill="#E27625" d="M17.1 15.6 14.4 18.5l4.9 1.3 1.4-5.4-3.6 1.2Z" />
      <path fill="#E27625" d="M3.6 14.4 5 19.8l4.9-1.3-2.7-2.9-3.6-1.2Z" />
      <path fill="#E4761B" d="M8.5 11.8 9.8 13.8l4.6.2 1.3-2 1.3 2 4.6-.2 1.3-2-5.9-.3-5.9.3Z" />
      <path fill="#F6851B" d="M13.1 9.9 14.4 11.8h-5.9l1.3-1.9 5.9-.3 5.9.3 1.3 1.9-5.9-.3Z" />
    </svg>
  );
}

function PhantomIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#AB9FF2" />
      <path
        fill="#FFF"
        d="M17.2 9.8c0-.7-.6-1.2-1.2-1.2h-1.1c-.6 0-1.1.5-1.1 1.1v.1c0 .6.5 1.1 1.1 1.1h.1v1.8c0 .6-.5 1.1-1.1 1.1H8.2c-.6 0-1.1-.5-1.1-1.1v-1.8h.1c.6 0 1.1-.5 1.1-1.1v-.1c0-.6-.5-1.1-1.1-1.1H6.1c-.7 0-1.2.5-1.2 1.2v4.4c0 2.2 1.8 4 4 4h4.2c2.2 0 4-1.8 4-4V9.8Z"
      />
    </svg>
  );
}

function TrustIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#0500FF" />
      <path
        fill="#FFF"
        d="M12 5.5 7 8v4.2c0 3.1 2.1 5.9 5 6.8 2.9-.9 5-3.7 5-6.8V8l-5-2.5Z"
      />
    </svg>
  );
}

function CoinbaseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#0052FF" />
      <path
        fill="#FFF"
        d="M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm-2.2 5.8c0-.3.2-.5.5-.5h3.4c.3 0 .5.2.5.5v3.4c0 .3-.2.5-.5.5h-3.4a.5.5 0 0 1-.5-.5v-3.4Z"
      />
    </svg>
  );
}

function RainbowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#001E59" />
      <path fill="#FF4000" d="M5 19v-2a12 12 0 0 1 12 12h2v-2A14 14 0 0 0 5 13v6Z" transform="translate(0 -8)" />
      <path fill="#FFD641" d="M5 19v-2a8 8 0 0 1 8 8h2v-2A10 10 0 0 0 5 13v6Z" transform="translate(0 -4)" />
      <path fill="#01DA40" d="M5 19a4 4 0 0 1 4 4h2a6 6 0 0 0-6-6v2Z" />
      <circle cx="5.8" cy="18.2" r="1.6" fill="#01DA40" />
    </svg>
  );
}

function OKXIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#000" />
      <path
        fill="#FFF"
        d="M6 6h4v4H6V6Zm8 0h4v4h-4V6Zm-4 4h4v4h-4v-4Zm-4 4h4v4H6v-4Zm8 0h4v4h-4v-4Z"
      />
    </svg>
  );
}

function RabbyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#8697FF" />
      <path
        fill="#FFF"
        d="M17.5 11c-.8-2.6-3-4.5-5.7-4.9-.5-.1-.8.5-.4.8 1 .8 1.8 1.9 2.2 3.1l-3.1-1.5a4.5 4.5 0 0 0-5 .9l-.8.8c-.3.3-.1.8.3.8h2.3c-.6.7-.9 1.6-.9 2.5 0 .4.4.6.7.4l3.3-2 4.6 2.2c.7.3 1.5.3 2.1-.1.6-.4.7-1.2.4-2Z"
      />
    </svg>
  );
}

function BraveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#FFF" />
      <path
        fill="#FB542B"
        d="M18.5 8.1 17 5.8l-2-.3-3-.5-3 .5-2 .3-1.5 2.3.7 2.4-.4 1.6 2 6 1.6 1.4L12 21l2.6-1.5 1.6-1.4 2-6-.4-1.6.7-2.4Z"
      />
      <path fill="#FFF" d="m12 13.7-2.4 1.5 2.4 2 2.4-2-2.4-1.5Zm-2.7-4.4 2.7 1 2.7-1-1-1.3h-3.4l-1 1.3Z" />
    </svg>
  );
}

function LedgerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#000" />
      <path fill="#FFF" d="M7 10h3v4H7v-4Zm7 0h3v4h-3v-4ZM7 7h10v2H7V7Zm0 8h10v2H7v-2Z" />
    </svg>
  );
}

function WalletConnectIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#3B99FC" />
      <path
        fill="#FFF"
        d="M7.2 9.4c3.4-3.4 8.9-3.4 12.3 0l.4.4c.2.2.2.5 0 .7l-1.4 1.4c-.1.1-.3.1-.5 0l-.6-.6c-2.4-2.4-6.2-2.4-8.6 0l-.6.6c-.1.1-.4.1-.5 0L6.8 10.5c-.2-.2-.2-.5 0-.7l.4-.4Zm15.2 2.8 1.3 1.3c.2.2.2.5 0 .7l-5.7 5.7c-.2.2-.5.2-.7 0l-4-4c-.1-.1-.2-.1-.3 0l-4 4c-.2.2-.5.2-.7 0L.5 14.2c-.2-.2-.2-.5 0-.7l1.3-1.3c.2-.2.5-.2.7 0l4 4c.1.1.2.1.3 0l4-4c.2-.2.5-.2.7 0l4 4c.1.1.2.1.3 0l4-4c.2-.2.5-.2.7 0Z"
      />
    </svg>
  );
}

// Trust Wallet injects itself as window.ethereum and can hijack generic
// requests, so every wallet must resolve its own specific provider.
function getMetaMaskProvider() {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isMetaMask && !provider.isTrust) ?? null;
  }
  return eth.isMetaMask && !eth.isTrust ? eth : null;
}

function getTrustProvider() {
  if (typeof window === "undefined") return null;
  if (window.trustwallet?.ethereum) return window.trustwallet.ethereum;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isTrust) ?? null;
  }
  return eth.isTrust ? eth : null;
}

function getPhantomProvider() {
  if (typeof window === "undefined") return null;
  return window.phantom?.ethereum ?? null;
}

function getCoinbaseProvider() {
  if (typeof window === "undefined") return null;
  if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isCoinbaseWallet) ?? null;
  }
  return eth.isCoinbaseWallet ? eth : null;
}

function getRainbowProvider() {
  if (typeof window === "undefined") return null;
  if (window.rainbow) return window.rainbow;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isRainbow) ?? null;
  }
  return eth.isRainbow ? eth : null;
}

function getOKXProvider() {
  if (typeof window === "undefined") return null;
  if (window.okxwallet) return window.okxwallet;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isOKExWallet || provider.isOKX) ?? null;
  }
  return eth.isOKExWallet || eth.isOKX ? eth : null;
}

function getRabbyProvider() {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.isRabby) return eth;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isRabby) ?? null;
  }
  return null;
}

function getBraveProvider() {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.isBraveWallet) return eth;
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isBraveWallet) ?? null;
  }
  return null;
}

function detectWalletAvailability() {
  const availability = { walletConnect: false };
  for (const walletId of Object.keys(INJECTED_WALLETS)) {
    availability[walletId] = false;
  }
  if (typeof window === "undefined") return availability;

  for (const [walletId, { getProvider }] of Object.entries(INJECTED_WALLETS)) {
    availability[walletId] = Boolean(getProvider());
  }
  availability.walletConnect = Boolean(projectId);
  return availability;
}

const WALLET_OPTIONS = [
  {
    id: "metaMask",
    label: "MetaMask",
    icon: MetaMaskIcon,
    hint: "Browser extension",
    installUrl: "https://metamask.io",
    kind: "injected",
  },
  {
    id: "phantom",
    label: "Phantom",
    icon: PhantomIcon,
    hint: "Browser extension",
    installUrl: "https://phantom.app",
    kind: "injected",
  },
  {
    id: "trust",
    label: "Trust Wallet",
    icon: TrustIcon,
    hint: "Browser extension",
    installUrl: "https://trustwallet.com",
    kind: "injected",
  },
  {
    id: "coinbase",
    label: "Coinbase Wallet",
    icon: CoinbaseIcon,
    hint: "Browser extension",
    installUrl: "https://www.coinbase.com/wallet",
    kind: "injected",
  },
  {
    id: "rainbow",
    label: "Rainbow",
    icon: RainbowIcon,
    hint: "Browser extension",
    installUrl: "https://rainbow.me",
    kind: "injected",
  },
  {
    id: "okx",
    label: "OKX Wallet",
    icon: OKXIcon,
    hint: "Browser extension",
    installUrl: "https://www.okx.com/web3",
    kind: "injected",
  },
  {
    id: "rabby",
    label: "Rabby",
    icon: RabbyIcon,
    hint: "Browser extension",
    installUrl: "https://rabby.io",
    kind: "injected",
  },
  {
    id: "brave",
    label: "Brave Wallet",
    icon: BraveIcon,
    hint: "Built into Brave",
    installUrl: "https://brave.com/wallet",
    kind: "injected",
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: LedgerIcon,
    hint: "WalletConnect QR",
    installUrl: "https://www.ledger.com",
    kind: "walletConnect",
  },
  {
    id: "walletConnect",
    label: "Other / WalletConnect",
    icon: WalletConnectIcon,
    hint: "WalletConnect QR",
    kind: "walletConnect",
  },
];

const INJECTED_WALLETS = {
  metaMask: { name: "MetaMask", getProvider: getMetaMaskProvider },
  phantom: { name: "Phantom", getProvider: getPhantomProvider },
  trust: { name: "Trust Wallet", getProvider: getTrustProvider },
  coinbase: { name: "Coinbase Wallet", getProvider: getCoinbaseProvider },
  rainbow: { name: "Rainbow", getProvider: getRainbowProvider },
  okx: { name: "OKX Wallet", getProvider: getOKXProvider },
  rabby: { name: "Rabby", getProvider: getRabbyProvider },
  brave: { name: "Brave Wallet", getProvider: getBraveProvider },
};

function createInjectedConnector(walletId) {
  const { name, getProvider } = INJECTED_WALLETS[walletId];
  return injected({
    target() {
      const provider = getProvider();
      if (!provider) return undefined;
      return { id: walletId, name, provider };
    },
    shimDisconnect: true,
  });
}

export default function WalletSelectModal({
  open,
  onOpen,
  onClose,
  buttonClassName,
  connectButtonLabel = "Connect Wallet",
}) {
  const connectors = useConnectors();
  const { connect, isPending, error: connectError } = useConnect();
  const [availability, setAvailability] = useState(detectWalletAvailability);
  const [connectingWalletId, setConnectingWalletId] = useState(null);

  const walletConnectConnector = useMemo(
    () => connectors.find((connector) => connector.id === "walletConnect") ?? null,
    [connectors],
  );

  useEffect(() => {
    if (!open) return;
    setAvailability(detectWalletAvailability());
  }, [open]);

  const visibleOptions = useMemo(() => {
    return WALLET_OPTIONS.filter((option) => {
      // WalletConnect options need a projectId; keep ones with an install
      // page (Ledger) visible regardless so they never silently disappear.
      if (option.kind === "walletConnect") {
        return availability.walletConnect || Boolean(option.installUrl);
      }
      return true;
    });
  }, [availability.walletConnect]);

  const handleWalletSelect = (walletId) => {
    if (isPending) return;

    if (INJECTED_WALLETS[walletId]) {
      const provider = INJECTED_WALLETS[walletId].getProvider();
      if (provider) {
        setConnectingWalletId(walletId);
        connect(
          { connector: createInjectedConnector(walletId) },
          {
            onSuccess: () => {
              setConnectingWalletId(null);
              onClose();
            },
            onError: () => setConnectingWalletId(null),
          },
        );
      } else {
        const option = WALLET_OPTIONS.find((entry) => entry.id === walletId);
        if (option?.installUrl) {
          window.open(option.installUrl, "_blank", "noopener,noreferrer");
        }
      }
      return;
    }

    if (!walletConnectConnector) {
      const option = WALLET_OPTIONS.find((entry) => entry.id === walletId);
      if (option?.installUrl) {
        window.open(option.installUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setConnectingWalletId(walletId);
    connect(
      { connector: walletConnectConnector },
      {
        onSuccess: () => {
          setConnectingWalletId(null);
          onClose();
        },
        onError: () => setConnectingWalletId(null),
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={isPending}
        className={buttonClassName}
      >
        {isPending ? "Connecting…" : connectButtonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          role="presentation"
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-select-title"
            className="w-full max-w-sm border border-ink bg-paper p-6 shadow-none"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="wallet-select-title"
                  className="text-sm font-black uppercase tracking-[0.2em] text-ink"
                >
                  Connect Wallet
                </h2>
                <p className="mt-2 text-xs text-ink/60">
                  Choose a wallet to mint on Sepolia testnet.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close wallet picker"
                className="border border-ink px-2 py-1 text-xs font-bold uppercase tracking-wide text-ink/60 transition-colors hover:border-signal hover:text-signal"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {visibleOptions.map((option) => {
                const Icon = option.icon;
                const installed =
                  option.kind === "injected"
                    ? availability[option.id]
                    : availability.walletConnect;
                const connecting = connectingWalletId === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleWalletSelect(option.id)}
                    className={`${WALLET_BTN_CLASS} ${installed ? "" : "opacity-80"}`}
                  >
                    <Icon />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span>{option.label}</span>
                      <span className="text-[10px] font-semibold normal-case tracking-normal text-ink/50">
                        {installed
                          ? option.hint
                          : option.installUrl
                            ? "Install extension"
                            : "WalletConnect QR"}
                      </span>
                    </span>
                    {connecting && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-signal">
                        …
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {connectError && (
              <p className="mt-4 text-xs text-red-600">{connectError.message}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
