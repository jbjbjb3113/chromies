import React from "react";
import { Link, NavLink } from "react-router-dom";
import WalletButton from "./WalletButton.jsx";

export default function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-ink bg-paper/95 text-ink backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="font-symtext text-sm font-bold uppercase tracking-[0.15em] text-ink"
        >
          CHROMIES
        </Link>
        <div className="flex items-center gap-6">
          <NavLink
            to="/mint"
            className={({ isActive }) =>
              `text-xs uppercase tracking-widest transition-colors hover:text-signal ${
                isActive ? "text-signal" : "text-ink/70"
              }`
            }
          >
            Mint
          </NavLink>
          <NavLink
            to="/market"
            className={({ isActive }) =>
              `text-xs uppercase tracking-widest transition-colors hover:text-signal ${
                isActive ? "text-signal" : "text-ink/70"
              }`
            }
          >
            Action Point Market
          </NavLink>
          {/* Lab tab hidden for now — route still works at /lab */}
          <NavLink
            to="/faq"
            className={({ isActive }) =>
              `text-xs uppercase tracking-widest transition-colors hover:text-signal ${
                isActive ? "text-signal" : "text-ink/70"
              }`
            }
          >
            FAQ
          </NavLink>
          <NavLink
            to="/canvas"
            className={({ isActive }) =>
              `text-xs uppercase tracking-widest transition-colors hover:text-signal ${
                isActive ? "text-signal" : "text-ink/70"
              }`
            }
          >
            Canvas
          </NavLink>
          <WalletButton compact />
        </div>
      </div>
    </header>
  );
}
