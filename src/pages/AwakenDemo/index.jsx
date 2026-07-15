import React, { useState } from "react";
import AccessGate from "./AccessGate.jsx";
import ConversationPanel from "./ConversationPanel.jsx";
import MistIdleSprite from "./MistIdleSprite.jsx";
import TokenListingCard from "../../components/TokenListingCard.jsx";
import { useRobinhoodTokenListing } from "../../lib/useRobinhoodTokenListing.js";
import {
  CONVERSATION_PANEL_HEIGHT,
  MIST_BG,
  MIST_NAME,
  SESSION_UNLOCK_KEY,
  TOKEN_ID,
} from "./constants.js";
import { useElevenAgentSession } from "./useElevenAgentSession.js";

function readUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AwakenDemo() {
  const [unlocked, setUnlocked] = useState(readUnlocked);
  const [conversationTab, setConversationTab] = useState("chat");
  const session = useElevenAgentSession();
  const listingState = useRobinhoodTokenListing(TOKEN_ID);

  if (!unlocked) {
    return <AccessGate onUnlock={() => setUnlocked(true)} />;
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
    <div className="min-h-screen" style={{ backgroundColor: MIST_BG }}>
      <TokenListingCard
        tokenId={TOKEN_ID}
        personaName={MIST_NAME}
        conversationFooter={conversationFooter}
        listingState={listingState}
        SpriteComponent={MistIdleSprite}
        spriteProps={{
          mouthLevel: session.mouthLevel,
          isSpeaking: session.isSpeaking,
          isSpeechSession: session.isSpeechSession,
        }}
      />
    </div>
  );
}
