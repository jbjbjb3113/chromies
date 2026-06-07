import React from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { injectedConnector } from "../lib/wagmi.js";
import { DEFAULT_CHAIN } from "../lib/chroma-contract.js";

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const defaultButtonClass =
  "border border-ink bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40";

export default function WalletButton({
  className = "",
  compact = false,
  connectClassName = defaultButtonClass,
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const onWrongNetwork = isConnected && chainId !== DEFAULT_CHAIN.id;

  if (!isConnected) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => connect({ connector: injectedConnector })}
          disabled={isConnecting}
          className={connectClassName}
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {connectError && (
          <p className="mt-2 text-xs text-red-600">{connectError.message}</p>
        )}
      </div>
    );
  }

  if (onWrongNetwork) {
    if (compact) {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <button
            type="button"
            onClick={() => switchChain({ chainId: DEFAULT_CHAIN.id })}
            disabled={isSwitching}
            className={connectClassName}
          >
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      );
    }

    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <span className="text-xs font-semibold text-red-600">
          Please switch to Sepolia testnet
        </span>
        <button
          type="button"
          onClick={() => switchChain({ chainId: DEFAULT_CHAIN.id })}
          disabled={isSwitching}
          className="border border-signal bg-signal px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSwitching ? "Switching…" : "Switch to Sepolia"}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs font-semibold tabular-nums text-ink/80">
        {shortenAddress(address)}
      </span>
      <button type="button" onClick={() => disconnect()} className={defaultButtonClass}>
        Disconnect
      </button>
    </div>
  );
}
