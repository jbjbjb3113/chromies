import React from "react";

const LINKS = [
  { label: "Twitter / X", href: "#" },
  { label: "Discord", href: "#" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-ink-line bg-ink">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <span className="text-sm font-extrabold tracking-tight text-white">
          chromies<span className="text-signal">.art</span>
        </span>
        <nav className="flex items-center gap-6">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-neutral-400 transition-colors hover:text-signal"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <span className="text-xs text-neutral-600">
          © {new Date().getFullYear()} CHROMIES
        </span>
      </div>
    </footer>
  );
}
