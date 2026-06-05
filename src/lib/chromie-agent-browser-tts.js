import { createMouthDriver, wordEnergyToMouthTarget } from "./chromie-agent-mouth.js";

export function isBrowserTtsSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

export function getDefaultTtsProvider() {
  return isBrowserTtsSupported() ? "browser" : "elevenlabs";
}

export function getBrowserVoices() {
  if (!isBrowserTtsSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function cancelBrowserTts() {
  if (!isBrowserTtsSupported()) return;
  window.speechSynthesis.cancel();
}

export function pickBrowserVoiceByGender(voices, gender) {
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length > 0 ? en : voices;
  const g = gender?.toLowerCase() ?? "";
  if (g.includes("female")) {
    return pool.find((v) => /female|woman|girl|samantha|victoria|zira|jenny|aria|sonia/i.test(v.name)) ?? pool[0];
  }
  if (g.includes("male")) {
    return pool.find((v) => /male|man|boy|david|mark|guy|andrew|brian|ryan|thomas/i.test(v.name)) ?? pool[0];
  }
  return pool.find((v) => v.default) ?? pool[0];
}

function estimateWordStartsMs(text, rate) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const msPerChar = 52 / Math.max(0.5, rate);
  let t = 80;
  return words.map((w) => {
    const start = t;
    t += (w.length + 1) * msPerChar;
    return start;
  });
}

function attachMouthSync(utterance, text, rate, onMouthPulse, isActive) {
  const driver = createMouthDriver();
  let rafId = 0;
  const timeouts = [];

  const tick = () => {
    if (!isActive()) return;
    onMouthPulse?.(driver.tick());
    rafId = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    driver.reset();
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (rafId) cancelAnimationFrame(rafId);
    for (const id of timeouts) clearTimeout(id);
    timeouts.length = 0;
    driver.reset();
    onMouthPulse?.(0);
  };

  utterance.onboundary = (ev) => {
    const name = ev.name ?? "";
    if (name === "word" || name === "") {
      const len = typeof ev.charLength === "number" && ev.charLength > 0 ? ev.charLength : 4;
      driver.pushTarget(wordEnergyToMouthTarget(len));
    }
  };

  const words = text.trim().split(/\s+/).filter(Boolean);
  const starts = estimateWordStartsMs(text, rate);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const id = setTimeout(() => {
      if (!isActive()) return;
      driver.pushTarget(wordEnergyToMouthTarget(w.length));
    }, starts[i] ?? i * 200);
    timeouts.push(id);
  }

  return { stop, startLoop };
}

export function speakBrowserTts({ text, voice, rate, pitch, onStart, onEnd, onMouthPulse }) {
  return new Promise((resolve, reject) => {
    if (!isBrowserTtsSupported()) {
      reject(new Error("Browser speech synthesis is not supported."));
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      resolve();
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(trimmed);
    if (voice) utterance.voice = voice;
    utterance.rate = rate ?? 1;
    utterance.pitch = pitch ?? 1;

    let speaking = false;
    const mouth = attachMouthSync(utterance, trimmed, utterance.rate, onMouthPulse, () => speaking);

    utterance.onstart = () => {
      speaking = true;
      onStart?.();
      mouth.startLoop();
    };
    utterance.onend = () => {
      speaking = false;
      mouth.stop();
      onEnd?.();
      resolve();
    };
    utterance.onerror = (ev) => {
      speaking = false;
      mouth.stop();
      if (ev.error === "canceled") {
        resolve();
        return;
      }
      reject(new Error(ev.error ? `Browser TTS failed: ${ev.error}` : "Browser TTS failed."));
    };

    synth.speak(utterance);
    setTimeout(() => {
      if (synth.paused) synth.resume();
    }, 80);
  });
}
