import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { projectId, wagmiConfig } from "./lib/wagmi.js";
import "./index.css";

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY?.trim();

if (import.meta.env.PROD) {
  console.info("[Chromies] build env:", {
    walletConnectProjectId: projectId ? `${projectId.slice(0, 8)}…` : "MISSING",
    alchemyKey: alchemyKey ? "set" : "MISSING",
  });
  if (!projectId) {
    console.warn(
      "[Chromies] VITE_WALLET_CONNECT_PROJECT_ID is not set — WalletConnect / Ledger QR will not work. Add it in Cloudflare Pages → Settings → Environment variables.",
    );
  }
  if (!alchemyKey) {
    console.warn(
      "[Chromies] VITE_ALCHEMY_KEY is not set — RPC will fall back to public endpoints. Add it in Cloudflare Pages build env for reliable reads.",
    );
  }
} else {
  console.log("WC ID:", projectId ?? "(not set)");
  console.log("Alchemy:", alchemyKey ? "set" : "(not set)");
}

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
