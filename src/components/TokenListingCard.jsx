import React, { useEffect, useId, useState } from "react";
import { formatTokenId } from "../lib/chromie-token.js";
import {
  LISTING_TRAIT_SLOTS,
  shortenAddress,
} from "../lib/robinhood-token-uri.js";
import {
  getChromiesCommemorativeAddress,
  robinhoodChain,
} from "../lib/robinhood-contract.js";
import { useRobinhoodTokenListing } from "../lib/useRobinhoodTokenListing.js";

const traitGridClass = "[grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]";
const PLACEHOLDER = "—";
const COLLECTION_NAME = "Chromies Commemorative";

const DESKTOP_SPRITE_STYLE = {
  imageRendering: "pixelated",
  width: "min(50vw, 90vh)",
  height: "min(50vw, 90vh)",
  maxWidth: "100%",
};

function useIsLargeScreen() {
  const query = "(min-width: 1024px)";
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return matches;
}

function Badge({ children }) {
  return (
    <span className="border border-ink/20 bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink/70">
      {children}
    </span>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="min-w-0 border border-ink/15 bg-paper px-2.5 py-2.5 sm:px-3 sm:py-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink/45 sm:text-[10px]">
        {label}
      </p>
      <p className="mt-1 truncate font-symtext text-base font-black tabular-nums text-ink sm:text-lg">
        {value}
      </p>
    </div>
  );
}

function TraitCell({ label, value }) {
  return (
    <div className="border border-ink/15 bg-paper px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/45">{label}</p>
      <p className="mt-1 text-sm font-medium leading-snug text-ink">{value ?? PLACEHOLDER}</p>
    </div>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-4 w-4 shrink-0 text-ink/45 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ControlledAccordion({ title, open, onToggle, sectionId, children }) {
  const panelId = useId();
  return (
    <div className="border-b border-ink/10">
      <button
        type="button"
        id={sectionId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
        className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-semibold text-ink transition hover:text-signal"
      >
        <span>{title}</span>
        <ChevronIcon open={open} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={sectionId}
        aria-hidden={!open}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pb-4 text-sm text-ink/70">{children}</div>
        </div>
      </div>
    </div>
  );
}

function StubParagraph({ children }) {
  return <p className="text-sm leading-relaxed text-ink/60">{children}</p>;
}

function formatTraitValue(value) {
  if (value == null || value === "") return PLACEHOLDER;
  return String(value);
}

function ListingSprite({ imageSrc, tokenId, variant, SpriteComponent = null, spriteProps = null }) {
  if (!imageSrc) return null;

  const Renderer = SpriteComponent;
  if (Renderer) {
    return (
      <Renderer
        imageSrc={imageSrc}
        tokenId={tokenId}
        variant={variant}
        {...spriteProps}
      />
    );
  }

  if (variant === "mobile") {
    return (
      <div className="flex w-full items-center justify-center bg-[var(--chroma-bg)]">
        <img
          src={imageSrc}
          alt={`Chromie #${formatTokenId(tokenId)} sprite`}
          width={64}
          height={64}
          className="pixelated aspect-square h-auto w-full max-w-none"
          style={{ imageRendering: "pixelated", maxHeight: "min(100vw, 70vh)" }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[min(100vw,70vh)] w-full items-center justify-center bg-[var(--chroma-bg)] lg:min-h-0 lg:h-screen">
      <img
        src={imageSrc}
        alt={`Chromie #${formatTokenId(tokenId)} sprite`}
        width={64}
        height={64}
        className="pixelated max-w-none"
        style={DESKTOP_SPRITE_STYLE}
        draggable={false}
      />
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div className="flex min-h-screen animate-pulse flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      <div className="aspect-square w-full bg-ink/10 lg:aspect-auto lg:h-screen lg:w-1/2" />
      <div className="space-y-4 bg-paper p-4 lg:h-screen lg:w-[min(560px,45%)] lg:overflow-y-auto lg:p-6">
        <div className="h-10 w-2/3 bg-ink/10" />
        <div className="h-6 w-1/2 bg-ink/5" />
        <div className="h-24 bg-ink/5" />
        <div className="h-11 bg-ink/10" />
        <div className="h-80 bg-ink/5" />
      </div>
    </div>
  );
}

/**
 * OpenSea-style two-panel listing layout for Robinhood commemorative Chromies.
 */
export default function TokenListingCard({
  tokenId,
  personaName,
  conversationFooter = null,
  spriteSrc = null,
  listingState = null,
  SpriteComponent = null,
  spriteProps = null,
  className = "",
}) {
  const isLargeScreen = useIsLargeScreen();
  const internalListing = useRobinhoodTokenListing(tokenId, { enabled: !listingState });
  const { loading, error, listing, pngUrl } = listingState ?? internalListing;
  const imageSrc = spriteSrc ?? pngUrl;
  const attributes = listing?.attributes;
  const [detailsTab, setDetailsTab] = useState("details");
  const [accordionDefaultsReady, setAccordionDefaultsReady] = useState(false);
  const [traitsOpen, setTraitsOpen] = useState(false);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [blockchainOpen, setBlockchainOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setTraitsOpen(false);
    setPriceHistoryOpen(false);
    setAboutOpen(false);
    setBlockchainOpen(isLargeScreen);
    setMoreOpen(false);
    setAccordionDefaultsReady(true);
  }, [isLargeScreen]);

  if (loading) {
    return <ListingSkeleton />;
  }

  if (error) {
    return (
      <div className={`border border-signal/40 bg-white p-6 text-sm text-signal ${className}`}>
        Could not load Chromie #{formatTokenId(tokenId)} listing: {error}
      </div>
    );
  }

  const commemorativeAddress = getChromiesCommemorativeAddress(robinhoodChain.id);
  const ownerHref = `${robinhoodChain.blockExplorers.default.url}/address/${listing.owner}`;
  const collectionHref = commemorativeAddress
    ? `${robinhoodChain.blockExplorers.default.url}/address/${commemorativeAddress}`
    : null;
  const traitCount = LISTING_TRAIT_SLOTS.length;

  const rightPanel = (
    <div className="flex flex-col bg-paper px-4 py-5 lg:px-6 lg:py-6">
      <header className="space-y-2">
        <h1 className="font-symtext text-2xl font-black tracking-tight text-ink sm:text-3xl">
          Chromie #{formatTokenId(tokenId)}
          {personaName ? <span className="text-ink/70"> — {personaName}</span> : null}
        </h1>
        {collectionHref ? (
          <a
            href={collectionHref}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-ink/70 underline decoration-ink/25 underline-offset-2 transition hover:text-signal"
          >
            {COLLECTION_NAME}
          </a>
        ) : (
          <p className="text-sm font-medium text-ink/70">{COLLECTION_NAME}</p>
        )}
        <p className="text-sm text-ink/60">
          Owned by{" "}
          <a
            href={ownerHref}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-ink underline decoration-ink/25 underline-offset-2 transition hover:text-signal"
          >
            {shortenAddress(listing.owner)}
          </a>
        </p>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge>ERC-721</Badge>
        <Badge>Robinhood Chain</Badge>
        <Badge>Token #{formatTokenId(tokenId)}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatCell label="Top offer" value={PLACEHOLDER} />
        <StatCell label="Collection floor" value={PLACEHOLDER} />
        <StatCell label="Rarity" value={PLACEHOLDER} />
        <StatCell label="Last sale" value={PLACEHOLDER} />
      </div>

      <button
        type="button"
        disabled
        className="mt-5 w-full cursor-not-allowed border border-ink/20 bg-ink/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-ink/40"
      >
        Make offer
      </button>

      <div className="mt-6 border-b border-ink/10">
        <div className="flex">
          <button
            type="button"
            onClick={() => setDetailsTab("details")}
            className={`flex-1 border-b-2 px-3 py-3 text-xs font-medium uppercase tracking-widest transition ${
              detailsTab === "details"
                ? "border-signal text-ink"
                : "border-transparent text-ink/45 hover:text-ink/70"
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setDetailsTab("orders")}
            className={`flex-1 border-b-2 px-3 py-3 text-xs font-medium uppercase tracking-widest transition ${
              detailsTab === "orders"
                ? "border-signal text-ink"
                : "border-transparent text-ink/45 hover:text-ink/70"
            }`}
          >
            Orders
          </button>
        </div>
      </div>

      {detailsTab === "details" ? (
        <div className="mt-2">
          {accordionDefaultsReady ? (
            <>
              <ControlledAccordion
                title={`Traits — ${traitCount}`}
                open={traitsOpen}
                onToggle={setTraitsOpen}
                sectionId="listing-traits"
              >
                <div className={`grid gap-3 ${traitGridClass}`}>
                  {LISTING_TRAIT_SLOTS.map(({ label, traitType }) => (
                    <TraitCell
                      key={traitType}
                      label={label}
                      value={formatTraitValue(attributes?.get(traitType))}
                    />
                  ))}
                </div>
              </ControlledAccordion>

              <ControlledAccordion
                title="Price history"
                open={priceHistoryOpen}
                onToggle={setPriceHistoryOpen}
                sectionId="listing-price-history"
              >
                <StubParagraph>No sales recorded for this token yet.</StubParagraph>
              </ControlledAccordion>

              <ControlledAccordion
                title="About"
                open={aboutOpen}
                onToggle={setAboutOpen}
                sectionId="listing-about"
              >
                <StubParagraph>
                  Chromie #{formatTokenId(tokenId)} is one of the canonical first 100 Chromies —
                  fully on-chain on Robinhood Chain. Metadata and image are served live from the
                  commemorative renderer contract.
                </StubParagraph>
              </ControlledAccordion>

              <ControlledAccordion
                title="Blockchain details"
                open={blockchainOpen}
                onToggle={setBlockchainOpen}
                sectionId="listing-blockchain"
              >
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4 border-b border-ink/10 py-2">
                    <dt className="text-ink/50">Chain</dt>
                    <dd className="font-medium text-ink">Robinhood Chain (4663)</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-ink/10 py-2">
                    <dt className="text-ink/50">Token standard</dt>
                    <dd className="font-medium text-ink">ERC-721</dd>
                  </div>
                  {commemorativeAddress ? (
                    <div className="flex justify-between gap-4 border-b border-ink/10 py-2">
                      <dt className="text-ink/50">Contract</dt>
                      <dd className="font-mono text-xs text-ink">{shortenAddress(commemorativeAddress)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-ink/50">Owner</dt>
                    <dd className="font-mono text-xs text-ink">{shortenAddress(listing.owner)}</dd>
                  </div>
                </dl>
              </ControlledAccordion>

              <ControlledAccordion
                title="More from this collection"
                open={moreOpen}
                onToggle={setMoreOpen}
                sectionId="listing-more"
              >
                <StubParagraph>
                  Only token #{formatTokenId(tokenId)} is featured in this demo. Additional
                  commemorative listings will appear here when the collection browser ships.
                </StubParagraph>
              </ControlledAccordion>
            </>
          ) : null}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-ink/50">
          No open orders for this token.
        </div>
      )}

      {conversationFooter ? (
        <div className="mt-6 border-t border-ink/10 pt-4">{conversationFooter}</div>
      ) : null}
    </div>
  );

  return (
    <div className={`flex min-h-screen flex-col bg-paper lg:h-screen lg:flex-row lg:overflow-hidden ${className}`}>
      <div className="w-full shrink-0 lg:h-screen lg:w-1/2 lg:overflow-hidden">
        <ListingSprite
          imageSrc={imageSrc}
          tokenId={tokenId}
          variant={isLargeScreen ? "desktop" : "mobile"}
          SpriteComponent={SpriteComponent}
          spriteProps={spriteProps}
        />
      </div>

      <div className="w-full lg:h-screen lg:w-[min(560px,45%)] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-ink/10">
        {rightPanel}
      </div>
    </div>
  );
}
