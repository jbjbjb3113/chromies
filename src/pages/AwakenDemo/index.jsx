import React, { useState } from "react";
import AwakenDemoMobile from "./AwakenDemoMobile.jsx";
import ConversationPanel from "./ConversationPanel.jsx";
import MistIdleSprite from "./MistIdleSprite.jsx";
import TokenListingCard from "../../components/TokenListingCard.jsx";
import { useIsLargeScreen } from "../../hooks/useIsLargeScreen.js";
import { useRobinhoodTokenListing } from "../../lib/useRobinhoodTokenListing.js";
import {
  CONVERSATION_PANEL_HEIGHT,
  MIST_BG,
  MIST_NAME,
  TOKEN_ID,
} from "./constants.js";
import { useElevenAgentSession } from "./useElevenAgentSession.js";

export default function AwakenDemo() {
  const [conversationTab, setConversationTab] = useState("chat");
  const isLargeScreen = useIsLargeScreen();
  const session = useElevenAgentSession();
  const listingState = useRobinhoodTokenListing(TOKEN_ID);

  const spriteProps = {
    mouthLevel: session.mouthLevel,
    isSpeaking: session.isSpeaking,
    isSpeechSession: session.isSpeechSession,
  };

  if (!isLargeScreen) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: MIST_BG }}>
        <AwakenDemoMobile
          tokenId={TOKEN_ID}
          personaName={MIST_NAME}
          listingState={listingState}
          session={session}
          conversationTab={conversationTab}
          onConversationTabChange={setConversationTab}
          SpriteComponent={MistIdleSprite}
          spriteProps={spriteProps}
        />
      </div>
    );
  }

  const conversationFooter = (
    <div
      className="flex min-h-0 w-full flex-col overflow-hidden border border-ink/10 bg-paper"
      style={{ height: CONVERSATION_PANEL_HEIGHT }}
    >
      <ConversationPanel
        {...session}
        tab={conversationTab}
        onTabChange={setConversationTab}
        avatarSrc={listingState.pngUrl}
      />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: MIST_BG }} data-awaken-layout="desktop">
      <TokenListingCard
        tokenId={TOKEN_ID}
        personaName={MIST_NAME}
        conversationFooter={conversationFooter}
        listingState={listingState}
        SpriteComponent={MistIdleSprite}
        spriteProps={spriteProps}
      />
    </div>
  );
}
