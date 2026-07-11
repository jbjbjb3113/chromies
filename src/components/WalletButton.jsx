import React, { useState } from "react";
import {
  useAccount,
  useChainId,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { DEFAULT_CHAIN } from "../lib/chroma-contract.js";
import WalletSelectModal from "./WalletSelectModal.jsx";

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const defaultButtonClass =
  "border border-ink bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:border-ink/20 disabled:text-ink/40";

export default function WalletButton({
  className = "",
  compact = false,
  connectClassName = defaultButtonClass,
  requiredChain = DEFAULT_CHAIN,
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const onWrongNetwork = isConnected && chainId !== requiredChain.id;

  if (!isConnected) {
    return (
      <div className={className}>
        <WalletSelectModal
          open={walletModalOpen}
          onOpen={() => setWalletModalOpen(true)}
          onClose={() => setWalletModalOpen(false)}
          buttonClassName={connectClassName}
        />
      </div>
    );
  }

  if (onWrongNetwork) {
    const switchLabel = isSwitching ? "Switching…" : `Switch to ${requiredChain.name}`;

    if (compact) {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <button
            type="button"
            onClick={() => switchChain({ chainId: requiredChain.id })}
            disabled={isSwitching}
            className={connectClassName}
          >
            {switchLabel}
          </button>
        </div>
      );
    }

    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <span className="text-xs font-semibold text-red-600">
          Please switch to {requiredChain.name}
        </span>
        <button
          type="button"
          onClick={() => switchChain({ chainId: requiredChain.id })}
          disabled={isSwitching}
          className="border border-signal bg-signal px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition-colors hover:bg-transparent hover:text-signal disabled:cursor-not-allowed disabled:opacity-50"
        >
          {switchLabel}
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
