export function buildChromieSystemPrompt(tokenId, attributes) {
  const traitBlock =
    attributes.length > 0
      ? attributes.map((a) => `${a.trait_type}: ${a.value}`).join(", ")
      : "a unique pixel identity";

  return [
    `You are Chromie #${tokenId}.`,
    `You are a pixel art identity living on the Base blockchain.`,
    `You are ${traitBlock}.`,
    `Be warm, a little playful, and concise (2–6 sentences unless asked for more).`,
    `Speak in first person. You only chat — never claim you can sign transactions or access wallets.`,
  ].join("\n");
}

export function getChatCompletionsEndpoint() {
  // Dev always uses Vite proxy paths — never hit OpenAI directly (CORS).
  if (import.meta.env.DEV) {
    const local = import.meta.env.VITE_LOCAL_LLM?.trim().toLowerCase();
    if (local === "ollama") return "/ollama-v1/chat/completions";
    return "/openai-v1/chat/completions";
  }
  const explicit = import.meta.env.VITE_CHAT_COMPLETIONS_URL;
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.trim().replace(/\/$/, "");
  }
  return null;
}

export function chatEndpointUsesDevProxy(endpoint) {
  return endpoint.startsWith("/openai-v1/") || endpoint.startsWith("/ollama-v1/");
}

export function formatChatCompletionErrorBody(status, bodyText) {
  const raw = bodyText.trim();
  try {
    const j = JSON.parse(raw);
    if (j.error?.message) return j.error.message;
  } catch {
    /* not JSON */
  }
  if (raw.length > 0) return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
  return `HTTP ${status}`;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export async function sendChatCompletion({ endpoint, apiKey, model, messages, signal }) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey?.length > 0) headers.Authorization = `Bearer ${apiKey}`;

  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1), signal);

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model?.trim() || "gpt-4o-mini",
        messages,
        temperature: 0.85,
      }),
      signal,
    });

    const rawText = await res.text();
    if (res.ok) {
      const json = JSON.parse(rawText);
      const content = json.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content.trim();
      throw new Error("Chat response missing content.");
    }

    lastErr = formatChatCompletionErrorBody(res.status, rawText);
    if (res.status < 500) break;
  }
  throw new Error(lastErr || "Chat request failed.");
}
