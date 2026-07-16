import React, { useState } from "react";
import { ACCESS_CODE, SESSION_UNLOCK_KEY } from "./constants.js";

export default function AccessGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();
    if (code.trim() === ACCESS_CODE) {
      try {
        sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
      } catch {
        /* ignore */
      }
      onUnlock();
      return;
    }
    setError("Invalid access code.");
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ backgroundColor: "#e3e5e4" }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-ink bg-paper p-8 shadow-sm"
      >
        <p className="font-symtext text-lg uppercase tracking-wide text-ink">Awaken Demo</p>
        <p className="mt-2 text-sm text-ink/60">Enter access code to continue.</p>
        <label className="mt-6 block">
          <span className="sr-only">Access code</span>
          <input
            type="password"
            autoComplete="off"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            className="w-full border border-ink bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
            placeholder="Access code"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-signal">{error}</p> : null}
        <button
          type="submit"
          className="mt-4 w-full border border-ink bg-ink px-4 py-2 text-sm font-medium uppercase tracking-wide text-paper transition hover:bg-ink-soft"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
