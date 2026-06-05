import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-ink-line bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-lg font-black tracking-tight text-white">
          CHROMIES
        </Link>
        <div className="flex items-center gap-6">
          <NavLink
            to="/mint"
            className={({ isActive }) =>
              `text-sm font-semibold transition-colors hover:text-signal ${
                isActive ? "text-signal" : "text-neutral-300"
              }`
            }
          >
            Mint
          </NavLink>
          <NavLink
            to="/lab"
            className={({ isActive }) =>
              `text-sm font-semibold transition-colors hover:text-signal ${
                isActive ? "text-signal" : "text-neutral-300"
              }`
            }
          >
            Lab
          </NavLink>
          <button
            type="button"
            className="border border-signal px-4 py-2 text-sm font-semibold text-signal transition-colors hover:bg-signal hover:text-ink"
          >
            Connect
          </button>
        </div>
      </div>
    </header>
  );
}
