import React, { useState } from "react";
import { formatTokenId } from "../../lib/chromie-token.js";
import {
  LISTING_TRAIT_SLOTS,
  shortenAddress,
} from "../../lib/robinhood-token-uri.js";
import {
  getChromiesCommemorativeAddress,
  robinhoodChain,
} from "../../lib/robinhood-contract.js";
import ConversationPanel, { MicButton } from "./ConversationPanel.jsx";
import MistIdleSprite from "./MistIdleSprite.jsx";
import { MIST_BG } from "./constants.js";

const PLACEHOLDER = "—";
const COLLECTION_LABEL = "Chromies: Robinhood Chain Commemorative";
const traitGridClass = "[grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]";

const MOBILE_TABS = [
  { id: "details", label: "Details" },
  { id: "offers", label: "Offers" },
  { id: "listings", label: "Listings" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

function TraitCell({ label, value }) {
  return (
    <div className="border border-ink/15 bg-paper px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/45">{label}</p>
      <p className="mt-1 text-sm font-medium leading-snug text-ink">{value ?? PLACEHOLDER}</p>
    </div>
  );
}

function StubPanel({ children }) {
  return (
    <div className="px-4 py-8 text-center text-sm leading-relaxed text-ink/60">{children}</div>
  );
}

function MobileNavBar() {
  return (
    <nav className="flex shrink-0 items-center justify-between border-b border-ink/10 bg-paper px-3 py-3">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="flex h-10 w-10 items-center justify-center text-ink/70 transition hover:text-ink"
        aria-label="Go back"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center text-ink/45"
          aria-label="Favorite (stub)"
          disabled
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center text-ink/45"
          aria-label="More options (stub)"
          disabled
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

function MobileTitleBlock({ tokenId, personaName, owner, collectionHref }) {
  return (
    <header className="shrink-0 space-y-1.5 bg-paper px-4 pb-3 pt-4">
      <h1 className="font-symtext text-xl font-black tracking-tight text-ink">
        Chromie #{formatTokenId(tokenId)}
        {personaName ? <span className="text-ink/70"> — {personaName}</span> : null}
      </h1>
      {collectionHref ? (
        <a
          href={collectionHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink/70 underline decoration-ink/25 underline-offset-2"
        >
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center border border-ink/20 bg-ink/5 text-[9px] font-bold uppercase text-ink/50"
            aria-hidden
          >
            C
          </span>
          {COLLECTION_LABEL}
        </a>
      ) : (
        <p className="text-sm font-medium text-ink/70">{COLLECTION_LABEL}</p>
      )}
      <p className="text-sm text-ink/60">
        Owned by{" "}
        <a
          href={`${robinhoodChain.blockExplorers.default.url}/address/${owner}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-ink underline decoration-ink/25 underline-offset-2"
        >
          {shortenAddress(owner)}
        </a>
      </p>
    </header>
  );
}

function MobileTabBar({ activeTab, onTabChange }) {
  return (
    <div
      className="sticky top-0 z-20 shrink-0 border-b border-ink/10 bg-paper"
      role="tablist"
      aria-label="Listing sections"
    >
      <div className="flex overflow-x-auto">
        {MOBILE_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => onTabChange(id)}
            className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium uppercase tracking-widest transition ${
              activeTab === id
                ? "border-signal text-ink"
                : "border-transparent text-ink/45"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailsTabContent({ attributes, commemorativeAddress, owner }) {
  return (
    <div className="space-y-5 px-4 py-4">
      <div className={`grid gap-3 ${traitGridClass}`}>
        {LISTING_TRAIT_SLOTS.map(({ label, traitType }) => (
          <TraitCell
            key={traitType}
            label={label}
            value={
              attributes?.get(traitType) == null || attributes?.get(traitType) === ""
                ? PLACEHOLDER
                : String(attributes.get(traitType))
            }
          />
        ))}
      </div>

      <div className="border border-ink/15 bg-paper p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/45">
          Blockchain details
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-b border-ink/10 py-2">
            <dt className="text-ink/50">Chain</dt>
            <dd className="font-medium text-ink">Robinhood Chain (4663)</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ink/10 py-2">
            <dt className="text-ink/50">Token standard</dt>
            <dd className="font-medium text-ink">ERC-721</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ink/10 py-2">
            <dt className="text-ink/50">Rarity</dt>
            <dd className="font-medium text-ink">{PLACEHOLDER}</dd>
          </div>
          {commemorativeAddress ? (
            <div className="flex justify-between gap-4 border-b border-ink/10 py-2">
              <dt className="text-ink/50">Contract</dt>
              <dd className="font-mono text-xs text-ink">{shortenAddress(commemorativeAddress)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-ink/50">Owner</dt>
            <dd className="font-mono text-xs text-ink">{shortenAddress(owner)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function MobileStickyAction({
  listingTab,
  conversationTab,
  session,
}) {
  const showMic =
    listingTab === "agent" && conversationTab === "talk";

  if (listingTab === "agent" && conversationTab === "chat") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showMic ? (
        <div>
          {session.isSpeaking ? (
            <p className="mb-2 text-center text-xs uppercase tracking-widest text-signal">
              Mist is speaking
            </p>
          ) : null}
          <MicButton
            isConnecting={session.isConnecting}
            isMicActive={session.isMicActive}
            isHoldActive={session.isHoldActive}
            isOpenMic={session.isOpenMic}
            onTapToggle={session.toggleOpenMic}
            onHoldStart={session.startHoldToTalk}
            onHoldEnd={session.stopHoldToTalk}
          />
          <p className="mt-2 text-center text-xs text-ink/45">
            {session.isOpenMic && !session.isHoldActive
              ? "Open mic on — tap to mute, or hold to override"
              : "Tap to toggle open mic · Hold for push-to-talk"}
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed border border-ink/20 bg-ink/5 px-4 py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-ink/40"
        >
          Make offer
        </button>
      )}
    </div>
  );
}

/**
 * OpenSea-style mobile listing layout for /awaken-demo (viewport &lt; lg only).
 */
export default function AwakenDemoMobile({
  tokenId,
  personaName,
  listingState,
  session,
  conversationTab,
  onConversationTabChange,
  SpriteComponent = MistIdleSprite,
  spriteProps = null,
}) {
  const [listingTab, setListingTab] = useState("details");
  const { loading, error, listing, pngUrl } = listingState;
  const imageSrc = pngUrl;

  if (loading) {
    return (
      <div className="min-h-[100dvh] animate-pulse bg-paper" data-awaken-layout="mobile">
        <div className="h-14 bg-ink/5" />
        <div className="space-y-2 px-4 py-4">
          <div className="h-8 w-2/3 bg-ink/10" />
          <div className="h-4 w-1/2 bg-ink/5" />
        </div>
        <div className="px-4">
          <div className="aspect-square w-full bg-ink/10" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-signal/40 bg-white p-6 text-sm text-signal" data-awaken-layout="mobile">
        Could not load Chromie #{formatTokenId(tokenId)} listing: {error}
      </div>
    );
  }

  const commemorativeAddress = getChromiesCommemorativeAddress(robinhoodChain.id);
  const collectionHref = commemorativeAddress
    ? `${robinhoodChain.blockExplorers.default.url}/address/${commemorativeAddress}`
    : null;
  const attributes = listing?.attributes;
  const stickyVisible = !(listingTab === "agent" && conversationTab === "chat");
  const contentPadding = stickyVisible ? "pb-36" : "pb-4";

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-paper"
      style={{ backgroundColor: MIST_BG }}
      data-awaken-layout="mobile"
    >
      <MobileNavBar />
      <MobileTitleBlock
        tokenId={tokenId}
        personaName={personaName}
        owner={listing.owner}
        collectionHref={collectionHref}
      />

      <div className="w-full shrink-0 bg-[var(--chroma-bg)] px-4">
        <div className="aspect-square w-full">
          <SpriteComponent
            imageSrc={imageSrc}
            tokenId={tokenId}
            variant="mobile"
            {...spriteProps}
          />
        </div>
      </div>

      <MobileTabBar activeTab={listingTab} onTabChange={setListingTab} />

      <main className={`min-h-0 flex-1 ${contentPadding}`}>
        <div hidden={listingTab !== "details"}>
          <DetailsTabContent
            attributes={attributes}
            commemorativeAddress={commemorativeAddress}
            owner={listing.owner}
          />
        </div>

        <div hidden={listingTab !== "offers"}>
          <StubPanel>No offers on this token yet.</StubPanel>
        </div>

        <div hidden={listingTab !== "listings"}>
          <StubPanel>This token is not currently listed for sale.</StubPanel>
        </div>

        <div hidden={listingTab !== "activity"}>
          <StubPanel>No activity recorded for this token yet.</StubPanel>
        </div>

        {/* Agent panel stays mounted so Talk session survives tab switches */}
        <div
          hidden={listingTab !== "agent"}
          className="flex min-h-[min(70dvh,560px)] flex-col border-t border-ink/10 bg-paper"
        >
          <ConversationPanel
            {...session}
            tab={conversationTab}
            onTabChange={onConversationTabChange}
            avatarSrc={pngUrl}
            showTalkMic={false}
          />
        </div>
      </main>

      <MobileStickyAction
        listingTab={listingTab}
        conversationTab={conversationTab}
        session={session}
      />
    </div>
  );
}
