import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import ChromieViewer from "../components/ChromieViewer.jsx";
import MouthCalibration from "../components/MouthCalibration.jsx";
import {
  buildChromieSystemPrompt,
  getChatCompletionsEndpoint,
  chatEndpointUsesDevProxy,
  sendChatCompletion,
} from "../lib/chromie-agent-chat.js";
import {
  cancelBrowserTts,
  getBrowserVoices,
  getDefaultTtsProvider,
  isBrowserTtsSupported,
  pickBrowserVoiceByGender,
  speakBrowserTts,
} from "../lib/chromie-agent-browser-tts.js";
import { rmsToMouthTarget, smoothMouthLevel } from "../lib/chromie-agent-mouth.js";
import {
  fetchElevenLabsVoices,
  getElevenLabsProxyUrl,
  synthesizeElevenLabsSpeech,
} from "../lib/chromie-agent-tts.js";
import {
  clearMouthForToken,
  DEFAULT_MOUTH,
  fetchChromieMetadata,
  loadMouthForToken,
  loadTokenImage,
  parseTokenId,
  saveMouthForToken,
} from "../lib/chromie-token.js";

const STORAGE = {
  elevenKey: "chromie-lab-eleven-api-key",
  elevenVoice: "chromie-lab-eleven-voice-id",
  elevenModel: "chromie-lab-eleven-model-id",
  elevenServer: "chromie-lab-eleven-server-key",
  ttsProvider: "chromie-lab-tts-provider",
  chatKey: "chromie-lab-chat-api-key",
  chatModel: "chromie-lab-chat-model",
  tokenId: "chromie-lab-token-id",
};

const DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB";
const DEFAULT_MODEL = "eleven_turbo_v2_5";

function readStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function Lab() {
  const [tokenInput, setTokenInput] = useState(() => readStorage(STORAGE.tokenId, "42"));
  const [loadedId, setLoadedId] = useState(null);
  const [tokenImage, setTokenImage] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [mouthRegion, setMouthRegion] = useState(() => ({ ...DEFAULT_MOUTH }));

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ttsProvider, setTtsProvider] = useState(
    () => readStorage(STORAGE.ttsProvider) || getDefaultTtsProvider(),
  );
  const [elevenApiKey, setElevenApiKey] = useState(() => readStorage(STORAGE.elevenKey));
  const [elevenVoiceId, setElevenVoiceId] = useState(() => readStorage(STORAGE.elevenVoice, DEFAULT_VOICE));
  const [elevenModelId, setElevenModelId] = useState(() => readStorage(STORAGE.elevenModel, DEFAULT_MODEL));
  const [elevenUseServerKey, setElevenUseServerKey] = useState(
    () => readStorage(STORAGE.elevenServer, "1") === "1",
  );
  const [elevenVoices, setElevenVoices] = useState([]);
  const [chatApiKey, setChatApiKey] = useState(() => readStorage(STORAGE.chatKey));
  const [chatModel, setChatModel] = useState(() => readStorage(STORAGE.chatModel, "gpt-4o-mini"));

  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(null);
  const mouthSmoothedRef = useRef(0);

  const endpoint = getChatCompletionsEndpoint();
  const elevenProxyUrl = getElevenLabsProxyUrl();
  const browserTtsReady = isBrowserTtsSupported();
  const [browserVoices, setBrowserVoices] = useState([]);

  const gender = useMemo(() => {
    const attr = metadata?.attributes?.find((a) => a.trait_type === "Gender");
    return attr ? String(attr.value) : null;
  }, [metadata]);

  const resolvedBrowserVoice = useMemo(
    () => pickBrowserVoiceByGender(browserVoices, gender),
    [browserVoices, gender],
  );

  const chromieLabel = loadedId ? `Chromie #${String(loadedId).padStart(4, "0")}` : "Chromie";

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.elevenKey, elevenApiKey);
      localStorage.setItem(STORAGE.elevenVoice, elevenVoiceId);
      localStorage.setItem(STORAGE.elevenModel, elevenModelId);
      localStorage.setItem(STORAGE.elevenServer, elevenUseServerKey ? "1" : "0");
      localStorage.setItem(STORAGE.ttsProvider, ttsProvider);
      localStorage.setItem(STORAGE.chatKey, chatApiKey);
      localStorage.setItem(STORAGE.chatModel, chatModel);
      localStorage.setItem(STORAGE.tokenId, tokenInput);
    } catch {
      /* ignore */
    }
  }, [
    chatApiKey,
    chatModel,
    elevenApiKey,
    elevenModelId,
    elevenUseServerKey,
    elevenVoiceId,
    tokenInput,
    ttsProvider,
  ]);

  useEffect(() => {
    if (elevenProxyUrl && !elevenApiKey.trim()) setElevenUseServerKey(true);
  }, [elevenApiKey, elevenProxyUrl]);

  useEffect(() => {
    if (!browserTtsReady) return;
    const load = () => setBrowserVoices(getBrowserVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [browserTtsReady]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      cancelBrowserTts();
      audioRef.current?.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, []);

  const refreshElevenVoices = useCallback(async () => {
    try {
      const voices = await fetchElevenLabsVoices({
        proxyUrl: elevenProxyUrl ?? undefined,
        apiKey: elevenUseServerKey ? undefined : elevenApiKey.trim() || undefined,
      });
      setElevenVoices(voices);
    } catch {
      setElevenVoices([]);
    }
  }, [elevenApiKey, elevenProxyUrl, elevenUseServerKey]);

  useEffect(() => {
    void refreshElevenVoices();
  }, [refreshElevenVoices]);

  const loadToken = useCallback(async (raw) => {
    const id = parseTokenId(raw);
    if (!id) {
      setLoadError("Enter a token ID from 1–9999.");
      return;
    }
    setLoadError(null);
    setLoadedId(null);
    setTokenImage(null);
    setMetadata(null);
    setMessages([]);
    try {
      const [meta, img] = await Promise.all([
        fetchChromieMetadata(id),
        loadTokenImage(id),
      ]);
      setLoadedId(id);
      setMetadata(meta);
      setTokenImage(img);
      setMouthRegion(loadMouthForToken(id));
      setMessages([
        {
          role: "assistant",
          content: `Hey — I'm Chromie #${String(id).padStart(4, "0")}. Ask me anything.`,
        },
      ]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (loadedId === null) return;
    saveMouthForToken(loadedId, mouthRegion);
  }, [loadedId, mouthRegion]);

  const resetMouthRegion = useCallback(() => {
    if (loadedId === null) return;
    clearMouthForToken(loadedId);
    setMouthRegion({ ...DEFAULT_MOUTH });
  }, [loadedId]);

  const stopSpeaking = useCallback(() => {
    cancelBrowserTts();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mouthSmoothedRef.current = 0;
    setMouthLevel(0);
    setSpeaking(false);
  }, []);

  const speakReply = useCallback(
    async (text) => {
      const ttsText = text.trim();
      if (!ttsText) return;

      if (ttsProvider === "browser") {
        if (!browserTtsReady) {
          setChatError("Browser TTS not supported in this browser.");
          return;
        }
        try {
          setSpeaking(true);
          setMouthLevel(0);
          await speakBrowserTts({
            text: ttsText,
            voice: resolvedBrowserVoice,
            onMouthPulse: setMouthLevel,
            onEnd: () => {
              setMouthLevel(0);
              setSpeaking(false);
            },
          });
        } catch (e) {
          setMouthLevel(0);
          setSpeaking(false);
          setChatError(e instanceof Error ? e.message : String(e));
        }
        return;
      }

      if (!elevenProxyUrl && elevenUseServerKey) {
        setChatError("ElevenLabs proxy not configured. Use browser TTS or add your API key.");
        return;
      }
      if (!elevenProxyUrl && !elevenUseServerKey && !elevenApiKey.trim()) {
        setChatError("Add ElevenLabs API key, configure proxy, or switch to browser TTS.");
        return;
      }

      try {
        setSpeaking(true);
        setMouthLevel(0);
        mouthSmoothedRef.current = 0;
        const blob = await synthesizeElevenLabsSpeech({
          proxyUrl: elevenProxyUrl ?? undefined,
          text: ttsText,
          voiceId: elevenVoiceId,
          modelId: elevenModelId,
          apiKey: elevenUseServerKey ? undefined : elevenApiKey.trim() || undefined,
        });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        const audioCtx = audioCtxRef.current ?? new AudioContext();
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === "suspended") await audioCtx.resume();

        sourceRef.current?.disconnect();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.82;
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyserRef.current = analyser;
        sourceRef.current = source;

        const bytes = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(bytes);
          let sum = 0;
          for (let i = 0; i < bytes.length; i++) {
            const n = (bytes[i] - 128) / 128;
            sum += n * n;
          }
          const rms = Math.sqrt(sum / bytes.length);
          const target = rmsToMouthTarget(rms);
          mouthSmoothedRef.current = smoothMouthLevel(mouthSmoothedRef.current, target);
          setMouthLevel(mouthSmoothedRef.current);
          if (audioRef.current === audio && !audio.paused && !audio.ended) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          mouthSmoothedRef.current = 0;
          setMouthLevel(0);
          source.disconnect();
          if (audioRef.current === audio) audioRef.current = null;
          setSpeaking(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          mouthSmoothedRef.current = 0;
          setMouthLevel(0);
          setSpeaking(false);
          setChatError("Unable to play ElevenLabs audio.");
        };
        await audio.play();
      } catch (e) {
        mouthSmoothedRef.current = 0;
        setMouthLevel(0);
        setSpeaking(false);
        setChatError(e instanceof Error ? e.message : String(e));
      }
    },
    [
      browserTtsReady,
      elevenApiKey,
      elevenModelId,
      elevenProxyUrl,
      elevenUseServerKey,
      elevenVoiceId,
      resolvedBrowserVoice,
      ttsProvider,
    ],
  );

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || loadedId === null) return;
    if (!endpoint) {
      setChatError("Chat not configured. Set VITE_CHAT_COMPLETIONS_URL for production.");
      return;
    }
    if (!chatEndpointUsesDevProxy(endpoint) && !chatApiKey.trim()) {
      setChatError("Add your OpenAI API key in Settings (or use dev proxy).");
      return;
    }

    stopSpeaking();
    setChatError(null);
    setSending(true);

    const userMsg = { role: "user", content: text };
    const attrs = metadata?.attributes ?? [];
    const systemMsg = {
      role: "system",
      content: buildChromieSystemPrompt(loadedId, attrs),
    };
    const history = [...messages.filter((m) => m.role !== "system"), userMsg];

    setMessages((prev) => [...prev, userMsg]);
    setDraft("");

    try {
      const reply = await sendChatCompletion({
        endpoint,
        apiKey: chatEndpointUsesDevProxy(endpoint) ? undefined : chatApiKey.trim(),
        model: chatModel,
        messages: [systemMsg, ...history],
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      await speakReply(reply);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }, [
    chatApiKey,
    chatModel,
    draft,
    endpoint,
    loadedId,
    messages,
    metadata,
    sending,
    speakReply,
    stopSpeaking,
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-0 px-4 pt-24 pb-8 lg:flex-row">
        {/* Left — 40% */}
        <aside className="flex w-full flex-col border border-ink bg-white lg:w-[40%]">
          <div className="border-b border-ink px-4 py-4">
            <h1 className="text-lg font-black tracking-tight">Talk to your Chromie</h1>
            <p className="mt-1 text-xs text-ink/50">64×64 pixel identity · lip sync demo</p>
          </div>

          <div className="flex flex-col items-center gap-4 px-4 py-6">
            <form
              className="flex w-full max-w-xs gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void loadToken(tokenInput);
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Token ID"
                className="flex-1 border border-ink bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
              />
              <button
                type="submit"
                className="border border-signal px-4 py-2 text-sm font-semibold text-signal hover:bg-signal hover:text-ink"
              >
                Load
              </button>
            </form>

            {loadError && (
              <p className="text-center text-xs text-red-600">{loadError}</p>
            )}

            {tokenImage ? (
              <>
                <ChromieViewer image={tokenImage} mouthLevel={mouthLevel} mouth={mouthRegion} />
                <MouthCalibration
                  mouth={mouthRegion}
                  onChange={setMouthRegion}
                  onReset={resetMouthRegion}
                  disabled={loadedId === null}
                />
                <p className="text-sm font-semibold text-signal">{chromieLabel}</p>
                {metadata?.attributes && (
                  <p className="max-w-xs text-center text-xs text-ink/50">
                    {metadata.attributes.slice(0, 4).map((a) => a.value).join(" · ")}
                  </p>
                )}
                {speaking && (
                  <span className="border border-signal px-3 py-1 text-xs font-bold uppercase tracking-widest text-signal">
                    Speaking
                  </span>
                )}
              </>
            ) : (
              <div className="flex h-64 w-64 items-center justify-center border border-dashed border-ink text-sm text-ink/45">
                Load a token
              </div>
            )}
          </div>
        </aside>

        {/* Right — 60% */}
        <section className="flex w-full flex-col border border-t-0 border-ink lg:w-[60%] lg:border-t lg:border-l-0">
          <div className="flex items-center justify-between border-b border-ink px-4 py-3">
            <span className="text-sm font-semibold text-ink/60">Chat</span>
            <div className="flex items-center gap-2">
              <select
                value={ttsProvider}
                onChange={(e) => setTtsProvider(e.target.value)}
                className="border border-ink bg-white px-2 py-1 text-xs text-ink outline-none"
                aria-label="Voice provider"
              >
                <option value="browser">Browser TTS</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
              <button
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                className="border border-ink px-3 py-1 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal"
              >
                Settings
              </button>
            </div>
          </div>

          {settingsOpen && (
            <div className="space-y-3 border-b border-ink bg-white px-4 py-4 text-sm">
              <label className="block">
                <span className="text-xs text-ink/50">Chat API key</span>
                <input
                  type="password"
                  value={chatApiKey}
                  onChange={(e) => setChatApiKey(e.target.value)}
                  className="mt-1 w-full border border-ink bg-white px-2 py-1.5 text-ink outline-none focus:border-signal"
                  placeholder={chatEndpointUsesDevProxy(endpoint ?? "") ? "Dev proxy — optional" : "sk-…"}
                />
              </label>
              <label className="block">
                <span className="text-xs text-ink/50">Chat model</span>
                <input
                  type="text"
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  className="mt-1 w-full border border-ink bg-white px-2 py-1.5 text-ink outline-none focus:border-signal"
                />
              </label>
              <label className="block">
                <span className="text-xs text-ink/50">ElevenLabs API key</span>
                <input
                  type="password"
                  value={elevenApiKey}
                  onChange={(e) => setElevenApiKey(e.target.value)}
                  className="mt-1 w-full border border-ink bg-white px-2 py-1.5 text-ink outline-none focus:border-signal"
                  placeholder={elevenProxyUrl ? "Optional — proxy can use server key" : "xi-…"}
                />
              </label>
              {elevenProxyUrl && (
                <label className="flex items-center gap-2 text-xs text-ink/60">
                  <input
                    type="checkbox"
                    checked={elevenUseServerKey}
                    onChange={(e) => setElevenUseServerKey(e.target.checked)}
                  />
                  Use proxy server key
                </label>
              )}
              <label className="block">
                <span className="text-xs text-ink/50">ElevenLabs voice</span>
                <select
                  value={elevenVoiceId}
                  onChange={(e) => setElevenVoiceId(e.target.value)}
                  className="mt-1 w-full border border-ink bg-white px-2 py-1.5 text-ink outline-none"
                >
                  {elevenVoices.length === 0 ? (
                    <option value={elevenVoiceId}>{elevenVoiceId}</option>
                  ) : (
                    elevenVoices.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          )}

          {chatError && (
            <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {chatError}
            </p>
          )}

          <div className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: "420px" }}>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[90%] px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto border border-signal/40 bg-signal/10 text-ink"
                      : "border border-ink bg-white text-ink/80"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {sending && (
                <p className="text-xs text-ink/50">Thinking…</p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form
              className="flex gap-2 border-t border-ink p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={loadedId === null || sending}
                placeholder={loadedId ? "Say something…" : "Load a Chromie first"}
                className="flex-1 border border-ink bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loadedId === null || sending || !draft.trim()}
                className="border border-signal bg-signal px-5 py-2 text-sm font-bold text-ink hover:bg-transparent hover:text-signal disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
