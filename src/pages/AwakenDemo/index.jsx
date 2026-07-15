import React, { useState } from "react";
import AccessGate from "./AccessGate.jsx";
import ConversationPanel from "./ConversationPanel.jsx";
import MistHero from "./MistHero.jsx";
import { MIST_BG, SESSION_UNLOCK_KEY } from "./constants.js";
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
  const session = useElevenAgentSession();

  if (!unlocked) {
    return <AccessGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div
      className="flex min-h-screen flex-col lg:h-screen lg:max-h-screen lg:overflow-hidden"
      style={{ backgroundColor: MIST_BG }}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2 lg:overflow-hidden">
        <section className="min-h-[42vh] shrink-0 lg:min-h-0 lg:overflow-hidden">
          <MistHero />
        </section>

        <section className="flex min-h-[50vh] flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          <ConversationPanel {...session} />
        </section>
      </div>
    </div>
  );
}
