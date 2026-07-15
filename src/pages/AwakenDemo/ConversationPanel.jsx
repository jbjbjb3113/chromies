import React, { useEffect, useRef, useState } from "react";
import { formatTokenId, tokenPngUrl } from "../../lib/chromie-token.js";
import { TOKEN_ID } from "./constants.js";

function MessageBubble({ message }) {
  const isAgent = message.role === "agent";

  return (
    <div className={`flex gap-2 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent ? (
        <img
          src={tokenPngUrl(TOKEN_ID)}
          alt=""
          aria-hidden
          width={28}
          height={28}
          className="mt-0.5 shrink-0 pixelated"
          style={{ imageRendering: "pixelated" }}
        />
      ) : null}
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

function ChatTab({ draft, onDraftChange, onSend, disabled, messages, messagesEndRef }) {
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
              <MessageBubble key={message.id} message={message} />
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
  isRecording,
  isSpeaking,
  isConnecting,
  onPressStart,
  onPressEnd,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !liveTranscript ? (
          <p className="text-center text-sm text-ink/45">Hold the button and speak to Mist.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
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

        <button
          type="button"
          disabled={isConnecting}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onPressStart();
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            onPressEnd();
          }}
          onPointerCancel={onPressEnd}
          onLostPointerCapture={onPressEnd}
          className={`mx-auto flex h-24 w-full max-w-xs select-none touch-none flex-col items-center justify-center border-2 text-sm font-medium uppercase tracking-widest transition ${
            isRecording
              ? "border-signal bg-signal text-paper"
              : "border-ink bg-ink text-paper hover:bg-ink-soft"
          } disabled:cursor-wait disabled:opacity-60`}
        >
          {isConnecting ? "Connecting…" : isRecording ? "Release to send" : "Hold to talk"}
        </button>

        <p className="mt-3 text-center text-xs text-ink/45">
          Microphone used only while holding
        </p>
      </div>
    </div>
  );
}

export default function ConversationPanel({
  messages,
  liveTranscript,
  sessionError,
  isConnecting,
  isRecording,
  isSpeaking,
  sendTextMessage,
  startPushToTalk,
  stopPushToTalk,
}) {
  const [tab, setTab] = useState("chat");
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveTranscript, tab]);

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
    <div className="flex h-full min-h-0 flex-col border-t border-ink/10 bg-paper lg:border-t-0 lg:border-l">
      <div className="flex shrink-0 border-b border-ink/10">
        <button type="button" className={tabClass("chat")} onClick={() => setTab("chat")}>
          Chat
        </button>
        <button type="button" className={tabClass("talk")} onClick={() => setTab("talk")}>
          Talk
        </button>
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
        />
      ) : (
        <TalkTab
          messages={messages}
          messagesEndRef={messagesEndRef}
          liveTranscript={liveTranscript}
          isRecording={isRecording}
          isSpeaking={isSpeaking}
          isConnecting={isConnecting}
          onPressStart={startPushToTalk}
          onPressEnd={stopPushToTalk}
        />
      )}
    </div>
  );
}
