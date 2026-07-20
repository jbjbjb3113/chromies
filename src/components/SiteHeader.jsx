import React from "react";
import { Link, NavLink } from "react-router-dom";
import WalletButton from "./WalletButton.jsx";
import SpectrumWordmark from "./SpectrumWordmark.jsx";

export default function SiteHeader() {
  const navLinkClass = ({ isActive }) =>
    `shrink-0 text-xs uppercase tracking-widest transition-colors hover:text-signal ${
      isActive ? "text-signal" : "text-ink/70"
    }`;

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-ink bg-paper/95 text-ink backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="shrink-0">
          <SpectrumWordmark
            text="CHROMIES"
            className="font-symtext text-sm font-bold uppercase tracking-[0.15em]"
          />
        </Link>
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <nav
            className="min-w-0 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:whitespace-normal"
          >
            <div className="flex items-center gap-6 pr-1 sm:pr-0">
              <NavLink to="/launch-edition" className={navLinkClass}>
                Chain Launch
              </NavLink>
              <NavLink to="/faq" className={navLinkClass}>
                FAQ
              </NavLink>
              <NavLink to="/provenance" className={navLinkClass}>
                Provenance
              </NavLink>
              <NavLink to="/canvas" className={navLinkClass}>
                Canvas
              </NavLink>
              {/* Hidden from nav (routes still work): Mint coming-soon, Market, My Chromies, Inscribe, Burn, Lab */}
            </div>
          </nav>
          <WalletButton compact />
        </div>
      </div>
    </header>
  );
}
