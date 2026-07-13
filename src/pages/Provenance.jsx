import React from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";

const BLOCKSCOUT_BASE = "https://robinhoodchain.blockscout.com";

// Deploy tx hash / block / timestamp pulled from the RE-DO broadcast artifacts +
// Blockscout (chromies-engine/reports/ROBINHOOD_COMMEMORATIVE_REDO.md and
// ROBINHOOD_MAINNET_DEPLOY.md). ChromaPaletteData was NOT redeployed for the RE-DO —
// it's the original 2026-07-11 deploy, reused as-is by the new renderer.
const CONTRACTS = [
  {
    name: "ChromiesCommemorative",
    address: "0x3C8C9615889762bDcF9647a3C86C74aFA498a158",
    deployTx: "0xb643ffc4eda3b446f1805fe6c475a6a20843bbc457e36771b039af7c8e26033c",
    block: "7,648,109",
    timestamp: "2026-07-12 08:06:12 UTC",
  },
  {
    name: "ChromaRendererRobinhood",
    address: "0x9C34Bd0c872983e33611f0cF1cF3C1C968516736",
    deployTx: "0xbe0944a96860542fc82fb7b6a5fac5800ec4416bdf0c4c05838e37d6a4cdc1b6",
    block: "7,648,113",
    timestamp: "2026-07-12 08:06:12 UTC",
  },
  {
    name: "ChromaPaletteData",
    address: "0xb3ad67d60C44E6db461f8957AF7a2f664c01275a",
    deployTx: "0xdea8573f0c52bb21f5671b271524d858ff7e2d772ffad5ef137a19373a76ed39",
    block: "7,233,967",
    timestamp: "2026-07-11 20:34:17 UTC",
  },
];

const MERKLE_ROOT = "0x73008f45bfe38ec43fd00c9fa3af0dab1d8d6f5acdca7f87af9937d0a2887abd";

function truncateHash(hash) {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export default function Provenance() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink px-6 pt-32 pb-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-block border border-ink/30 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
            Provenance Record
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Provenance Record — Chromies: Robinhood Chain Commemorative
          </h1>
        </div>
      </section>

      <section className="border-b border-ink bg-white px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <p className="text-base leading-relaxed text-ink/80">
            This is the first fully on-chain generative art collection on Robinhood Chain.
            Robinhood Chain mainnet launched July 2, 2026; this collection was deployed
            within the first two weeks of the chain's existence. It consists of 100 pieces,
            each a 64×64, 4bpp pixel-art image. There is no IPFS, no server, no off-chain
            image host of any kind — <code className="font-mono text-sm">tokenURI()</code>{" "}
            renders the full metadata JSON and the PNG image entirely from data stored in
            contract bytecode/storage, computed at call time.
          </p>
        </div>
      </section>

      <section className="border-b border-ink px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
            Receipts
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink text-xs uppercase tracking-widest text-ink/50">
                  <th className="py-2 pr-4 font-bold">Contract</th>
                  <th className="py-2 pr-4 font-bold">Address</th>
                  <th className="py-2 pr-4 font-bold">Deploy Tx</th>
                  <th className="py-2 pr-4 font-bold">Block</th>
                  <th className="py-2 font-bold">Timestamp (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {CONTRACTS.map((c) => (
                  <tr key={c.name} className="border-b border-ink/10 align-top">
                    <td className="py-3 pr-4 font-semibold">{c.name}</td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      <a
                        href={`${BLOCKSCOUT_BASE}/address/${c.address}?tab=contract`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-ink/30 hover:text-signal hover:decoration-signal"
                      >
                        {c.address}
                      </a>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      <a
                        href={`${BLOCKSCOUT_BASE}/tx/${c.deployTx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-ink/30 hover:text-signal hover:decoration-signal"
                      >
                        {truncateHash(c.deployTx)}
                      </a>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{c.block}</td>
                    <td className="py-3 font-mono text-xs">{c.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-ink/50">
            All three contracts are verified (source-matched) on Blockscout at the links
            above. ChromaPaletteData was deployed once and reused as-is for this
            collection's renderer — it was not redeployed alongside the other two.
          </p>
        </div>
      </section>

      <section className="border-b border-ink bg-white px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
            Dataset Integrity
          </h2>
          <p className="mt-4 font-mono text-xs break-all text-ink/80">{MERKLE_ROOT}</p>
          <p className="mt-4 text-sm leading-relaxed text-ink/70">
            The 100-piece dataset behind this collection is frozen and verifiable against
            the Merkle root above — every token's pixel and trait data was fixed before
            selection and seeding, and can be checked against this root independently of
            the live contract.
          </p>
        </div>
      </section>

      <section className="border-b border-ink px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
            Verify It Yourself
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink/70">
            Read <code className="font-mono text-xs">tokenURI</code> directly from the
            contract with{" "}
            <a
              href="https://book.getfoundry.sh/reference/cast/cast-call"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-ink/30 hover:text-signal hover:decoration-signal"
            >
              Foundry's <code className="font-mono text-xs">cast</code>
            </a>{" "}
            (or any RPC client):
          </p>
          <pre className="mt-4 overflow-x-auto border border-ink bg-ink px-4 py-4 text-xs text-white">
            <code>{`cast call 0x3C8C9615889762bDcF9647a3C86C74aFA498a158 \\
  "tokenURI(uint256)(string)" 1 \\
  --rpc-url https://rpc.mainnet.chain.robinhood.com`}</code>
          </pre>
          <p className="mt-4 text-sm leading-relaxed text-ink/70">
            The returned string is a base64 <code className="font-mono text-xs">data:</code>{" "}
            URI containing the full metadata JSON, with the image itself embedded as a
            second base64 <code className="font-mono text-xs">data:</code> URI inside it.
            Decoding both requires zero external dependencies — no gateway, no API key, no
            centralized lookup.
          </p>
        </div>
      </section>

      <section className="border-b border-ink bg-white px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
            Related
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link
                to="/launch-edition"
                className="underline decoration-ink/30 hover:text-signal hover:decoration-signal"
              >
                /launch-edition — mint page for this collection
              </Link>
            </li>
            <li>
              <Link
                to="/"
                className="underline decoration-ink/30 hover:text-signal hover:decoration-signal"
              >
                / — Chromies overview
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <div className="px-6 py-8 text-center text-xs text-ink/40">
        Published July 13, 2026.
      </div>

      <SiteFooter />
    </div>
  );
}
