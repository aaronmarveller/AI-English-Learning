"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { CALL_SECONDS, CallEngine, type CallLine, type Floor } from "@/lib/call-engine";
import { endCall, startCall, updateCallLines } from "@/lib/practice-state";
import { CallConnectionError, connectRealtime, type RealtimeConnection } from "@/lib/realtime-call";

export type CallPhase = "idle" | "connecting" | "live" | "ending";

/**
 * Runs one live Call at a time: connects, drives the {@link CallEngine} with
 * the Realtime events, and writes the bubbles into the Practice store as they
 * change. The Call is recorded (and so counts toward the three) the moment it
 * connects; a failed connection records nothing.
 */
export function useLiveCall(audioRef: RefObject<HTMLAudioElement | null>) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [remaining, setRemaining] = useState(CALL_SECONDS);
  const [floor, setFloor] = useState<Floor>("learner");
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<CallPhase>("idle");
  const engineRef = useRef<CallEngine | null>(null);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const linesRef = useRef<readonly CallLine[]>([]);

  const changePhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const release = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    callIdRef.current = null;
    linesRef.current = [];
  }, []);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (phaseRef.current !== "idle" || !audio) return;
    changePhase("connecting");
    setError(null);
    setRemaining(CALL_SECONDS);
    setFloor("emily");

    let pendingOpen = false;
    const engine = new CallEngine({
      setMicEnabled: (enabled) => connectionRef.current?.setMicEnabled(enabled),
      send: (event) => connectionRef.current?.send(event),
      onLines: (lines) => {
        linesRef.current = lines;
        if (callIdRef.current) updateCallLines(callIdRef.current, lines);
      },
      onCountdown: setRemaining,
      onFloorChange: setFloor,
      onEnded: (lines) => {
        if (callIdRef.current) endCall(callIdRef.current, lines);
        release();
        setFloor("learner");
        changePhase("idle");
      },
    });
    engineRef.current = engine;

    try {
      const connection = await connectRealtime({
        audio,
        onConnected: () => {
          callIdRef.current = startCall();
          changePhase("live");
        },
        onOpen: () => {
          if (connectionRef.current) engine.begin();
          else pendingOpen = true;
        },
        onEvent: (event) => engine.handleEvent(event),
        onDropped: () => engine.hangUp(),
      });
      connectionRef.current = connection;
      // The floor is Emily's until she has greeted: nothing said before then is heard.
      connection.setMicEnabled(false);
      if (pendingOpen) engine.begin();
    } catch (e) {
      release();
      setError(e instanceof CallConnectionError ? e.message : "连接失败了，请稍后再试。");
      setFloor("learner");
      changePhase("idle");
    }
  }, [audioRef, changePhase, release]);

  const hangUp = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || phaseRef.current !== "live") return;
    changePhase("ending");
    engine.hangUp();
  }, [changePhase]);

  // Leaving the page mid-Call ends it: release the microphone and keep what was said.
  useEffect(() => {
    return () => {
      if (callIdRef.current) endCall(callIdRef.current, linesRef.current);
      release();
    };
  }, [release]);

  return { phase, remaining, floor, error, start, hangUp };
}
