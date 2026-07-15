/** Expression speech-session gating — agent turn primary, volume hysteresis fallback. */

export const SPEECH_VOLUME_GATE = 0.01;
export const SPEECH_VOLUME_RELEASE_MS = 500;

export function createSpeechSessionState() {
  return {
    active: false,
    silenceSince: null,
  };
}

/**
 * Holds expression suppression true for a full agent response.
 * Primary: agentSpeaking while agentModeAvailable (connected SDK session).
 * Fallback: volume with sustained-silence hysteresis when agent signal unavailable.
 */
export function updateSpeechSessionState(
  state,
  {
    agentSpeaking = false,
    agentModeAvailable = false,
    volume = 0,
    talkSim = false,
    now = performance.now(),
  } = {},
) {
  const prev = state.active;

  if (talkSim || (agentModeAvailable && agentSpeaking)) {
    state.silenceSince = null;
    state.active = true;
    const source = talkSim ? "talk-sim" : "agent";
    return {
      active: true,
      rising: !prev,
      falling: false,
      source,
    };
  }

  if (agentModeAvailable) {
    state.silenceSince = null;
    state.active = false;
    return {
      active: false,
      rising: false,
      falling: prev,
      source: "agent",
    };
  }

  if (volume > SPEECH_VOLUME_GATE) {
    state.silenceSince = null;
    state.active = true;
    return {
      active: true,
      rising: !prev,
      falling: false,
      source: "volume",
    };
  }

  if (state.silenceSince == null) {
    state.silenceSince = now;
  }
  if (now - state.silenceSince >= SPEECH_VOLUME_RELEASE_MS) {
    state.active = false;
  }

  return {
    active: state.active,
    rising: !prev && state.active,
    falling: prev && !state.active,
    source: "volume-hysteresis",
  };
}
