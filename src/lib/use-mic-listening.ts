"use client";

import { useEffect, useRef, useState } from "react";
import {
  startListening,
  type ListeningController,
  type SpeechRecognitionErrorReason,
} from "@/lib/speech-recognition";
import { acquireMicListening, releaseMicListening, type MicListeningOwner } from "@/lib/speech-synthesis";

type UseMicListeningOptions = {
  lang?: string;
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (reason: SpeechRecognitionErrorReason) => void;
};

/** Shared UI owner for one click-to-start/click-to-stop microphone session. */
export function useMicListening({ lang, onResult, onError }: UseMicListeningOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const controllerRef = useRef<ListeningController | null>(null);
  const micOwnerRef = useRef<MicListeningOwner | null>(null);
  const sessionIdRef = useRef(0);
  const latestTranscriptRef = useRef("");
  const callbacksRef = useRef({ lang, onResult, onError });
  useEffect(() => {
    callbacksRef.current = { lang, onResult, onError };
  }, [lang, onResult, onError]);

  function releaseMic() {
    if (!micOwnerRef.current) return;
    releaseMicListening(micOwnerRef.current);
    micOwnerRef.current = null;
  }

  function finish(sessionId: number, stopRecognition = false): boolean {
    if (sessionIdRef.current !== sessionId) return false;
    sessionIdRef.current += 1;
    const controller = controllerRef.current;
    controllerRef.current = null;
    setIsListening(false);
    setInterimTranscript("");
    latestTranscriptRef.current = "";
    releaseMic();
    if (stopRecognition) controller?.stop();
    return true;
  }

  function beginListening() {
    if (controllerRef.current) return;
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    setInterimTranscript("");
    setIsListening(true);
    micOwnerRef.current = acquireMicListening();
    controllerRef.current = startListening(
      {
        onResult: (transcript, isFinal) => {
          if (sessionIdRef.current !== sessionId) return;
          latestTranscriptRef.current = transcript.trim();
          if (!isFinal) {
            setInterimTranscript(transcript);
            callbacksRef.current.onResult(transcript, false);
            return;
          }
          if (!finish(sessionId)) return;
          latestTranscriptRef.current = "";
          callbacksRef.current.onResult(transcript, true);
        },
        onError: (reason) => {
          if (!finish(sessionId, true)) return;
          callbacksRef.current.onError?.(reason);
        },
        onEnd: () => {
          finish(sessionId);
        },
      },
      { lang: callbacksRef.current.lang },
    );
  }

  function stopListening() {
    const sessionId = sessionIdRef.current;
    const transcript = latestTranscriptRef.current;
    if (!finish(sessionId, true)) return;
    latestTranscriptRef.current = "";
    if (transcript) callbacksRef.current.onResult(transcript, true);
  }

  // finish intentionally remains stable for the lifetime of this hook.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopListening(), []);

  return {
    isListening,
    interimTranscript,
    beginListening,
    stopListening,
  };
}
