import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import {
  smoothTalkMouthLevel,
  volumeToMouthTarget,
} from "./mist-talk-mouth.js";
import {
  createSpeechSessionState,
  updateSpeechSessionState,
} from "./mist-speech-session.js";
import { AGENT_ID } from "./constants.js";
import { getMistMouthDebugConfig } from "./mist-sprite-animation.js";

function nextMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useElevenAgentSession() {
  const conversationRef = useRef(null);
  const recordingRef = useRef(false);
  const openMicRef = useRef(false);
  const holdActiveRef = useRef(false);
  const connectPromiseRef = useRef(null);

  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [agentMode, setAgentMode] = useState("listening");
  const [messages, setMessages] = useState([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [sessionError, setSessionError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isOpenMic, setIsOpenMic] = useState(false);
  const [isHoldActive, setIsHoldActive] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isSpeechSession, setIsSpeechSession] = useState(false);

  const mouthSmoothedRef = useRef(0);
  const mouthRafRef = useRef(0);
  const audioPlayingRef = useRef(false);
  const agentSpeakingRef = useRef(false);
  const speechSessionRef = useRef(createSpeechSessionState());

  const isConnected = connectionStatus === "connected" && conversationRef.current != null;
  const isMicActive = isOpenMic || isHoldActive;

  const upsertMessage = useCallback((role, text, eventId) => {
    const trimmed = text?.trim();
    if (!trimmed) return;

    setMessages((prev) => {
      if (eventId != null) {
        const existingIdx = prev.findIndex((m) => m.eventId === eventId && m.role === role);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], text: trimmed };
          return next;
        }
      }

      const last = prev[prev.length - 1];
      if (last?.role === role && last.text === trimmed) return prev;

      return [
        ...prev,
        {
          id: nextMessageId(),
          role,
          text: trimmed,
          eventId: eventId ?? null,
        },
      ];
    });
  }, []);

  const setMicMuted = useCallback((muted) => {
    conversationRef.current?.setMicMuted(muted);
    recordingRef.current = !muted;
  }, []);

  const ensureSession = useCallback(async () => {
    if (conversationRef.current) return conversationRef.current;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    setIsConnecting(true);
    setSessionError(null);

    connectPromiseRef.current = (async () => {
      try {
        const conversation = await Conversation.startSession({
          agentId: AGENT_ID,
          onConnect: () => setConnectionStatus("connected"),
          onDisconnect: () => {
            setConnectionStatus("disconnected");
            conversationRef.current = null;
            connectPromiseRef.current = null;
            openMicRef.current = false;
            holdActiveRef.current = false;
            recordingRef.current = false;
            setIsOpenMic(false);
            setIsHoldActive(false);
            setLiveTranscript("");
          },
          onStatusChange: ({ status }) => setConnectionStatus(status),
          onModeChange: ({ mode }) => setAgentMode(mode),
          onMessage: ({ role, message, event_id: eventId }) => {
            if (recordingRef.current && role === "user") {
              setLiveTranscript(message);
            }
            upsertMessage(role, message, eventId);
          },
          onAgentResponseCorrection: ({
            original_agent_response: original,
            corrected_agent_response: corrected,
          }) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.role === "agent" && m.text === original ? { ...m, text: corrected } : m,
              ),
            );
          },
          onError: (message) => setSessionError(message),
        });

        conversation.setMicMuted(true);
        conversationRef.current = conversation;
        return conversation;
      } catch (error) {
        connectPromiseRef.current = null;
        const message =
          error instanceof Error ? error.message : "Could not start agent session.";
        setSessionError(message);
        throw error;
      } finally {
        setIsConnecting(false);
      }
    })();

    return connectPromiseRef.current;
  }, [upsertMessage]);

  const connectSession = useCallback(async () => {
    if (conversationRef.current || connectPromiseRef.current) {
      return ensureSession();
    }

    setSessionError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await ensureSession();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Microphone access denied.";
      setSessionError(message);
      throw error;
    }
  }, [ensureSession]);

  const disconnectSession = useCallback(async () => {
    holdActiveRef.current = false;
    openMicRef.current = false;
    recordingRef.current = false;
    setIsHoldActive(false);
    setIsOpenMic(false);
    setLiveTranscript("");

    const conversation = conversationRef.current;
    conversationRef.current = null;
    connectPromiseRef.current = null;

    if (conversation) {
      try {
        conversation.setMicMuted(true);
        await conversation.endSession();
      } catch {
        /* session may already be closed */
      }
    }

    setConnectionStatus("disconnected");
    setAgentMode("listening");
  }, []);

  const sendTextMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setSessionError(null);
      upsertMessage("user", trimmed);

      try {
        const conversation = await ensureSession();
        conversation.sendUserMessage(trimmed);
      } catch {
        /* error surfaced via sessionError */
      }
    },
    [ensureSession, upsertMessage],
  );

  const toggleOpenMic = useCallback(async () => {
    setSessionError(null);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await ensureSession();

      const next = !openMicRef.current;
      openMicRef.current = next;
      setIsOpenMic(next);
      setMicMuted(!next);
      if (!next) setLiveTranscript("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Microphone access denied.";
      setSessionError(message);
    }
  }, [ensureSession, setMicMuted]);

  const startHoldToTalk = useCallback(async () => {
    if (holdActiveRef.current) return;

    setSessionError(null);
    setLiveTranscript("");

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await ensureSession();
      holdActiveRef.current = true;
      setIsHoldActive(true);
      setMicMuted(false);
    } catch (error) {
      holdActiveRef.current = false;
      setIsHoldActive(false);
      const message =
        error instanceof Error ? error.message : "Microphone access denied.";
      setSessionError(message);
    }
  }, [ensureSession, setMicMuted]);

  const stopHoldToTalk = useCallback(
    (restoreOpenMic) => {
      if (!holdActiveRef.current) return;

      holdActiveRef.current = false;
      setIsHoldActive(false);

      const keepOpen = restoreOpenMic ?? openMicRef.current;
      setMicMuted(!keepOpen);
      if (!keepOpen) setLiveTranscript("");
    },
    [setMicMuted],
  );

  useEffect(() => {
    const mouthDebug = getMistMouthDebugConfig();
    const agentSpeaking = agentMode === "speaking";
    if (mouthDebug.logAudio && agentSpeaking !== agentSpeakingRef.current) {
      console.log("[mist-mouth] agentMode edge", {
        ts: performance.now(),
        from: agentSpeakingRef.current,
        to: agentSpeaking,
        agentMode,
      });
    }
    agentSpeakingRef.current = agentSpeaking;
  }, [agentMode]);

  useEffect(() => {
    if (!isConnected) {
      mouthSmoothedRef.current = 0;
      setMouthLevel(0);
      setIsAudioPlaying(false);
      speechSessionRef.current = createSpeechSessionState();
      setIsSpeechSession(false);
      return undefined;
    }

    const tick = () => {
      const conversation = conversationRef.current;
      const mouthDebug = getMistMouthDebugConfig();
      let target = 0;
      let audioPlaying = false;
      let volume = 0;
      if (conversation && typeof conversation.getOutputVolume === "function") {
        volume = conversation.getOutputVolume();
        audioPlaying = volume > 0.01;
        if (audioPlaying) {
          target = volumeToMouthTarget(volume);
        }
        if (mouthDebug.logAudio && audioPlaying !== audioPlayingRef.current) {
          console.log("[mist-mouth] isAudioPlaying edge", {
            ts: performance.now(),
            from: audioPlayingRef.current,
            to: audioPlaying,
            volume,
            agentMode,
          });
        }
        audioPlayingRef.current = audioPlaying;
      }

      const sessionUpdate = updateSpeechSessionState(speechSessionRef.current, {
        agentSpeaking: agentMode === "speaking",
        agentModeAvailable: true,
        volume,
        now: performance.now(),
      });
      if (mouthDebug.logAudio && (sessionUpdate.rising || sessionUpdate.falling)) {
        console.log("[mist-mouth] speechSession edge", {
          ts: performance.now(),
          active: sessionUpdate.active,
          rising: sessionUpdate.rising,
          falling: sessionUpdate.falling,
          source: sessionUpdate.source,
          agentMode,
          volume,
        });
      }

      setIsSpeechSession(sessionUpdate.active);
      setIsAudioPlaying(audioPlaying);
      mouthSmoothedRef.current = smoothTalkMouthLevel(mouthSmoothedRef.current, target);
      if (target <= 0 && mouthSmoothedRef.current < 0.01) {
        mouthSmoothedRef.current = 0;
      }
      setMouthLevel(mouthSmoothedRef.current);
      mouthRafRef.current = requestAnimationFrame(tick);
    };

    mouthRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(mouthRafRef.current);
      mouthSmoothedRef.current = 0;
      setMouthLevel(0);
      setIsAudioPlaying(false);
      speechSessionRef.current = createSpeechSessionState();
      setIsSpeechSession(false);
    };
  }, [isConnected, agentMode]);

  useEffect(() => {
    return () => {
      void conversationRef.current?.endSession();
    };
  }, []);

  return {
    messages,
    liveTranscript,
    sessionError,
    connectionStatus,
    agentMode,
    isConnecting,
    isConnected,
    isOpenMic,
    isHoldActive,
    isMicActive,
    isRecording: isMicActive,
    isSpeaking: agentMode === "speaking",
    isSpeechSession,
    isAudioPlaying,
    mouthLevel,
    sendTextMessage,
    connectSession,
    disconnectSession,
    toggleOpenMic,
    startHoldToTalk,
    stopHoldToTalk,
  };
};
