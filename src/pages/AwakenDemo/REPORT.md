# Awaken Demo (M1-lite) — Report

## Route

- **URL:** `/awaken-demo`
- **Not linked** from site nav or sitemap.
- **Header/footer:** suppressed — full-viewport artifact layout.

## Local access

```bash
npm run dev
```

Open [http://localhost:5173/awaken-demo](http://localhost:5173/awaken-demo)

**Access code:** `chromies-mist-demo`  
Override via `VITE_AWAKEN_DEMO_ACCESS_CODE` in `.env.local`.

Unlock persists for the browser tab session (`sessionStorage`).

## Files

| Path | Purpose |
|------|---------|
| `src/pages/AwakenDemo/index.jsx` | Page shell, access gate, layout |
| `src/pages/AwakenDemo/AccessGate.jsx` | One-input splash |
| `src/pages/AwakenDemo/MistHero.jsx` | Token #1 sprite + caption |
| `src/pages/AwakenDemo/ConversationPanel.jsx` | Chat / Talk tabs + shared transcript |
| `src/pages/AwakenDemo/useElevenAgentSession.js` | ElevenAgents SDK session hook |
| `src/pages/AwakenDemo/constants.js` | Agent ID, access code, Mist metadata |

## Agent

- **Agent ID:** `agent_1701kxgrehk1erj8s462r3nfemgs`
- **Package:** `@elevenlabs/client` (ElevenAgents JS SDK)
- Persona, voice, and prompts live in the ElevenAgents dashboard — not embedded in client code.

## SDK adaptation (push-to-talk)

**Approach:** Single voice session (`Conversation.startSession` with default WebRTC voice mode). Mic starts **muted** via `setMicMuted(true)`. Push-to-talk un mutes on pointer down and re-mutes on release — no separate VAD-off flag in the public SDK; this is the documented mic-mute pattern for hold-to-talk.

Text chat uses the same session via `sendUserMessage()` while the mic stays muted.

## M2 groundwork (server-issued session)

If the agent is made **private** or usage must be metered server-side:

1. Replace direct `agentId` with a backend endpoint that returns either:
   - `signedUrl` (WebSocket), or
   - `conversationToken` (WebRTC)
2. Pass that token to `Conversation.startSession({ signedUrl })` or `{ conversationToken }` instead of `{ agentId }`.
3. Access-code gate moves server-side; client only receives short-lived session credentials.
4. `userId` can be set server-side for analytics when issuing tokens.
5. No change to UI transcript model — only session bootstrap in `useElevenAgentSession.js`.

## Screenshots

See `src/pages/AwakenDemo/screenshots/`:

- `awaken-demo-chat.png` — Chat tab
- `awaken-demo-talk.png` — Talk tab

*(Captured locally after unlock; agent connection may show idle state without live API calls in CI.)*
