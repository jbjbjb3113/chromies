import { formatChatCompletionErrorBody } from "./chromie-agent-chat.js";

export function getElevenLabsProxyUrl() {
  const fromEnv = import.meta.env.VITE_TTS_PROXY_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return null;
}

export async function fetchElevenLabsVoices({ proxyUrl, apiKey, signal }) {
  const headers = { Accept: "application/json" };
  if (apiKey?.trim()) headers["xi-api-key"] = apiKey.trim();
  const base = proxyUrl?.trim() || "https://api.elevenlabs.io";
  const res = await fetch(`${base}/v1/voices`, { method: "GET", headers, signal });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${formatChatCompletionErrorBody(res.status, body)}`);
  }
  const json = await res.json();
  return Array.isArray(json.voices) ? json.voices : [];
}

export async function synthesizeElevenLabsSpeech({
  proxyUrl,
  text,
  voiceId,
  modelId,
  voiceSettings,
  apiKey,
  signal,
}) {
  const id = voiceId?.trim();
  if (!id) throw new Error("Missing ElevenLabs Voice ID.");

  const headers = {
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  };
  if (apiKey?.trim()) headers["xi-api-key"] = apiKey.trim();

  const base = proxyUrl?.trim() || "https://api.elevenlabs.io";
  const res = await fetch(`${base}/v1/text-to-speech/${id}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      model_id: modelId?.trim() || "eleven_turbo_v2_5",
      voice_settings: {
        stability: voiceSettings?.stability ?? 0.45,
        similarity_boost: voiceSettings?.similarity_boost ?? 0.75,
        style: voiceSettings?.style ?? 0.2,
        use_speaker_boost: voiceSettings?.use_speaker_boost ?? true,
      },
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${formatChatCompletionErrorBody(res.status, body)}`);
  }
  return res.blob();
}
