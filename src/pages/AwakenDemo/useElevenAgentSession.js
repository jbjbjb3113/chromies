import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import { AGENT_ID } from "./constants.js";

function nextMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useElevenAgentSession() {
  const conversationRef = useRef(null);
  const recordingRef = useRef(false);
  const connectPromiseRef = useRef(null);

  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [agentMode, setAgentMode] = useState("listening");
  const [messages, setMessages] = useState([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [sessionError, setSessionError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

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

  const startPushToTalk = useCallback(async () => {
    setSessionError(null);
    setLiveTranscript("");

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const conversation = await ensureSession();
      recordingRef.current = true;
      setIsRecording(true);
      conversation.setMicMuted(false);
    } catch (error) {
      recordingRef.current = false;
      setIsRecording(false);
      const message =
        error instanceof Error ? error.message : "Microphone access denied.";
      setSessionError(message);
    }
  }, [ensureSession]);

  const stopPushToTalk = useCallback(() => {
    recordingRef.current = false;
    setIsRecording(false);
    conversationRef.current?.setMicMuted(true);
    setLiveTranscript("");
  }, []);

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
    isRecording,
    isSpeaking: agentMode === "speaking",
    sendTextMessage,
    startPushToTalk,
    stopPushToTalk,
  };
}
