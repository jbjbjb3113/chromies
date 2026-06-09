import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConnect, useConnectors } from "wagmi";
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

function detectInjectedAvailability() {
  if (typeof window === "undefined") {
    return { metaMask: false, phantom: false, walletConnect: false };
  }

  const eth = window.ethereum;
  let metaMask = false;
  if (eth?.providers?.length) {
    metaMask = eth.providers.some((provider) => provider.isMetaMask);
  } else {
    metaMask = Boolean(eth?.isMetaMask);
  }

  return {
    metaMask,
    phantom: Boolean(window.phantom?.ethereum),
    walletConnect: Boolean(projectId),
  };
}

const WALLET_OPTIONS = [
  {
    id: "metaMask",
    label: "MetaMask",
    connectorIds: ["metaMask", "io.metamask", "metaMaskSDK"],
    icon: MetaMaskIcon,
    availabilityKey: "metaMask",
    hint: "Browser extension",
    hideWhenUnavailable: false,
  },
  {
    id: "phantom",
    label: "Phantom",
    connectorIds: ["phantom"],
    icon: PhantomIcon,
    availabilityKey: "phantom",
    hint: "Browser extension",
    hideWhenUnavailable: false,
  },
  {
    id: "trust",
    label: "Trust Wallet",
    connectorIds: ["walletConnect"],
    icon: TrustIcon,
    availabilityKey: "walletConnect",
    hint: "WalletConnect QR",
    hideWhenUnavailable: true,
  },
  {
    id: "ledger",
    label: "Ledger",
    connectorIds: ["walletConnect"],
    icon: LedgerIcon,
    availabilityKey: "walletConnect",
    hint: "WalletConnect QR",
    hideWhenUnavailable: true,
  },
  {
    id: "walletConnect",
    label: "Other / WalletConnect",
    connectorIds: ["walletConnect"],
    icon: WalletConnectIcon,
    availabilityKey: "walletConnect",
    hint: "WalletConnect QR",
    hideWhenUnavailable: true,
  },
];

export default function WalletSelectModal({
  open,
  onOpen,
  onClose,
  buttonClassName,
  connectButtonLabel = "Connect Wallet",
}) {
  const connectors = useConnectors();
  const { connect, isPending, error: connectError, variables } = useConnect();
  const [availability, setAvailability] = useState(detectInjectedAvailability);

  useEffect(() => {
    if (!open) return;
    setAvailability(detectInjectedAvailability());
  }, [open]);

  const resolveConnector = useCallback(
    (option) => {
      for (const connectorId of option.connectorIds) {
        const match = connectors.find((connector) => connector.id === connectorId);
        if (match) return match;
      }
      return null;
    },
    [connectors],
  );

  const options = useMemo(() => {
    return WALLET_OPTIONS.map((option) => {
      const connector = resolveConnector(option);
      const available = Boolean(connector && availability[option.availabilityKey]);
      const connecting = isPending && variables?.connector?.id === connector?.id;
      return { ...option, connector, available, connecting };
    }).filter((option) => option.available || !option.hideWhenUnavailable);
  }, [availability, isPending, resolveConnector, variables?.connector?.id]);

  const handleConnect = (option) => {
    if (!option.available || !option.connector || isPending) return;
    connect({ connector: option.connector }, { onSuccess: () => onClose() });
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
              {options.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!option.available || isPending}
                    onClick={() => handleConnect(option)}
                    className={`${WALLET_BTN_CLASS} ${
                      option.available ? "" : "opacity-45"
                    }`}
                  >
                    <Icon />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span>{option.label}</span>
                      <span className="text-[10px] font-semibold normal-case tracking-normal text-ink/50">
                        {option.available ? option.hint : "Not detected"}
                      </span>
                    </span>
                    {option.connecting && (
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
