import React, { useEffect, useRef, useState } from "react";

const HOLD_THRESHOLD_MS = 200;

function AgentAvatar({ src }) {
  if (!src) {
    return <div className="mt-0.5 h-7 w-7 shrink-0 bg-ink/10" aria-hidden />;
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={64}
      height={64}
      className="mt-0.5 h-7 w-7 shrink-0 max-w-none pixelated"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function MessageBubble({ message, avatarSrc }) {
  const isAgent = message.role === "agent";

  return (
    <div className={`flex gap-2 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent ? <AgentAvatar src={avatarSrc} /> : null}
      <div
        className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${
          isAgent
            ? "border-l-2 border-signal bg-white/80 text-ink"
            : "border border-ink/15 bg-ink text-paper"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

export { MicButton };

function MicButton({
  isConnecting,
  isMicActive,
  isHoldActive,
  isOpenMic,
  onTapToggle,
  onHoldStart,
  onHoldEnd,
}) {
  const downTimeRef = useRef(0);
  const holdTimerRef = useRef(null);
  const holdModeRef = useRef(false);
  const openMicBeforeHoldRef = useRef(false);

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function finishPointer(e) {
    clearHoldTimer();
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const elapsed = Date.now() - downTimeRef.current;

    if (holdModeRef.current) {
      onHoldEnd(openMicBeforeHoldRef.current);
      holdModeRef.current = false;
    } else if (elapsed < HOLD_THRESHOLD_MS) {
      onTapToggle();
    }
  }

  function handlePointerDown(e) {
    if (isConnecting) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    downTimeRef.current = Date.now();
    holdModeRef.current = false;
    openMicBeforeHoldRef.current = isOpenMic;

    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdModeRef.current = true;
      openMicBeforeHoldRef.current = isOpenMic;
      onHoldStart();
    }, HOLD_THRESHOLD_MS);
  }

  function micLabel() {
    if (isConnecting) return "Connecting…";
    if (isHoldActive) return "Release to send";
    if (isOpenMic) return "Listening…";
    return "Tap or hold to talk";
  }

  return (
    <button
      type="button"
      disabled={isConnecting}
      onPointerDown={handlePointerDown}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onLostPointerCapture={(e) => {
        if (holdModeRef.current) finishPointer(e);
      }}
      className={`mx-auto flex h-24 w-full max-w-xs select-none touch-none flex-col items-center justify-center border-2 text-sm font-medium uppercase tracking-widest transition ${
        isMicActive
          ? "border-signal bg-signal text-paper"
          : "border-ink bg-ink text-paper hover:bg-ink-soft"
      } disabled:cursor-wait disabled:opacity-60`}
    >
      {micLabel()}
    </button>
  );
}

function ChatTab({
  draft,
  onDraftChange,
  onSend,
  disabled,
  messages,
  messagesEndRef,
  avatarSrc,
}) {
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-ink/45">Say hello to Mist.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} avatarSrc={avatarSrc} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-ink/10 bg-paper px-4 py-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Message Mist…"
            className="min-w-0 flex-1 border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !draft.trim()}
            className="shrink-0 border border-ink bg-ink px-4 py-2 text-xs font-medium uppercase tracking-wide text-paper transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function TalkTab({
  messages,
  messagesEndRef,
  liveTranscript,
  isConnecting,
  isMicActive,
  isHoldActive,
  isOpenMic,
  isSpeaking,
  onTapToggle,
  onHoldStart,
  onHoldEnd,
  avatarSrc,
  showMic = true,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !liveTranscript ? (
          <p className="text-center text-sm text-ink/45">
            Tap the mic for open listening, or hold for push-to-talk.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} avatarSrc={avatarSrc} />
            ))}
            {liveTranscript ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] border border-dashed border-ink/25 px-3 py-2 text-sm italic text-ink/55">
                  {liveTranscript}
                </div>
              </div>
            ) : null}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-ink/10 bg-paper px-4 py-6">
        {isSpeaking ? (
          <p className="mb-3 text-center text-xs uppercase tracking-widest text-signal">
            Mist is speaking
          </p>
        ) : null}

        {showMic ? (
          <>
            <MicButton
              isConnecting={isConnecting}
              isMicActive={isMicActive}
              isHoldActive={isHoldActive}
              isOpenMic={isOpenMic}
              onTapToggle={onTapToggle}
              onHoldStart={onHoldStart}
              onHoldEnd={onHoldEnd}
            />

            <p className="mt-3 text-center text-xs text-ink/45">
              {isOpenMic && !isHoldActive
                ? "Open mic on — tap to mute, or hold to override"
                : "Tap to toggle open mic · Hold for push-to-talk"}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function ConversationPanel({
  messages,
  liveTranscript,
  sessionError,
  isConnecting,
  isConnected,
  isMicActive,
  isHoldActive,
  isOpenMic,
  isSpeaking,
  sendTextMessage,
  connectSession,
  disconnectSession,
  toggleOpenMic,
  startHoldToTalk,
  stopHoldToTalk,
  tab: controlledTab,
  onTabChange,
  avatarSrc = null,
  showTalkMic = true,
}) {
  const [internalTab, setInternalTab] = useState("chat");
  const tab = controlledTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveTranscript, tab]);

  function selectTalkTab() {
    setTab("talk");
    void connectSession();
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await sendTextMessage(text);
  }

  const tabClass = (name) =>
    `flex-1 border-b-2 px-4 py-3 text-xs font-medium uppercase tracking-widest transition ${
      tab === name
        ? "border-signal text-ink"
        : "border-transparent text-ink/45 hover:text-ink/70"
    }`;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-paper">
      <div className="flex shrink-0 items-stretch border-b border-ink/10">
        <button type="button" className={tabClass("chat")} onClick={() => setTab("chat")}>
          Chat
        </button>
        <button type="button" className={tabClass("talk")} onClick={selectTalkTab}>
          Talk
        </button>
        {isConnected ? (
          <button
            type="button"
            onClick={() => void disconnectSession()}
            className="shrink-0 border-l border-ink/10 px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-ink/55 transition hover:bg-signal/5 hover:text-signal"
          >
            End chat
          </button>
        ) : null}
      </div>

      {sessionError ? (
        <p className="shrink-0 border-b border-signal/30 bg-signal/5 px-4 py-2 text-xs text-signal">
          {sessionError}
        </p>
      ) : null}

      {tab === "chat" ? (
        <ChatTab
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          disabled={isConnecting}
          messages={messages}
          messagesEndRef={messagesEndRef}
          avatarSrc={avatarSrc}
        />
      ) : (
        <TalkTab
          messages={messages}
          messagesEndRef={messagesEndRef}
          liveTranscript={liveTranscript}
          isConnecting={isConnecting}
          isMicActive={isMicActive}
          isHoldActive={isHoldActive}
          isOpenMic={isOpenMic}
          isSpeaking={isSpeaking}
          onTapToggle={toggleOpenMic}
          onHoldStart={startHoldToTalk}
          onHoldEnd={stopHoldToTalk}
          avatarSrc={avatarSrc}
          showMic={showTalkMic}
        />
      )}
    </div>
  );
}
