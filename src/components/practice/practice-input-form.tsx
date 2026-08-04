"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  isSpeechRecognitionSupported,
  startListening,
  type ListeningController,
} from "@/lib/speech-recognition";

type PracticeInputFormProps = {
  disabled: boolean;
  onSubmit: (text: string) => void;
};

type InputMode = "mic" | "text";
type MicState = "idle" | "listening";

const UNSUPPORTED_REASON =
  "你的浏览器不支持语音识别，已切换到文字输入。 Your browser doesn't support voice input, switched to typing.";
const PERMISSION_DENIED_REASON =
  "麦克风权限被拒绝，已切换到文字输入。 Microphone access was denied, switched to typing.";

// --- Support detection (SSR-safe) ---------------------------------------
//
// Whether the browser can recognize speech is only knowable client-side.
// Rather than call setState from inside a useEffect body (which this repo's
// eslint config flags via react-hooks/set-state-in-effect — see the same
// problem solved in src/components/home/greeting-banner.tsx and
// src/lib/use-has-mounted.ts), this uses useSyncExternalStore: the server
// (and first client render, to match hydration) optimistically assume mic
// support so the primary input renders by default, and React corrects to
// the real, client-checked value immediately after mount if it's wrong —
// the same "hasMounted correction" those two modules document.
function subscribeToNothing(): () => void {
  return () => {};
}
function getSupportSnapshot(): boolean {
  return isSpeechRecognitionSupported();
}
function getServerSupportSnapshot(): boolean {
  return true;
}
function useSpeechRecognitionSupport(): boolean {
  return useSyncExternalStore(subscribeToNothing, getSupportSnapshot, getServerSupportSnapshot);
}

/**
 * The learner's input: mic-first, with a full-parity text fallback (ticket
 * 09; spec.md "Practice 页交互模型" — "学习者开口后下方实时出现识别文本气
 * 泡"). Both paths funnel into the exact same `onSubmit(text)` prop ticket
 * 08 already wired up (practice-page-content.tsx → appendLearnerMessage →
 * the learner bubble in message-bubble-pair.tsx), so this component owns
 * *how* text is produced and nothing downstream needs to know which mode
 * was used.
 *
 * Recognized text is only ever submitted once a result is *final* — the
 * simplest approach ticket 09 explicitly calls out as correct: it reuses
 * the existing echo-bubble pipeline unchanged instead of inventing a
 * separate preview surface, while an interim transcript is still shown live
 * next to the mic as the visible "listening" state so the learner isn't
 * staring at a silent button.
 *
 * Mode selection is derived, not imperative: `manualMode` (set only by the
 * toggle button) always wins when present; otherwise mode falls out of
 * `isSupported` and `permissionDenied`. That keeps every fallback rule a
 * pure expression instead of scattered setState calls that could disagree.
 */
export function PracticeInputForm({ disabled, onSubmit }: PracticeInputFormProps) {
  const isSupported = useSpeechRecognitionSupport();

  const [manualMode, setManualMode] = useState<InputMode | null>(null);
  const [micState, setMicState] = useState<MicState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [value, setValue] = useState("");

  const controllerRef = useRef<ListeningController | null>(null);

  // Stop any in-flight recognition if the learner navigates away mid-listen.
  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
    };
  }, []);

  const mode: InputMode = manualMode ?? (isSupported && !permissionDenied ? "mic" : "text");
  const fallbackReason: string | null = manualMode
    ? null
    : !isSupported
      ? UNSUPPORTED_REASON
      : permissionDenied
        ? PERMISSION_DENIED_REASON
        : null;

  function handleMicClick() {
    if (disabled || micState === "listening") return;
    setInterimTranscript("");
    setMicState("listening");

    controllerRef.current = startListening({
      onResult: (transcript, isFinal) => {
        if (!isFinal) {
          setInterimTranscript(transcript);
          return;
        }
        setMicState("idle");
        setInterimTranscript("");
        // Deliberately doesn't call controllerRef.current?.stop() here: a
        // real recognizer already auto-stops itself right after a final
        // result (continuous=false), and calling stop() reentrantly from
        // inside the very event handler that's still dispatching that
        // result is a footgun (it raced e2e/fixtures.ts's mock, which nulls
        // its shared "active recognition" reference synchronously from
        // inside stop() before the mock had finished dispatching).
        const trimmed = transcript.trim();
        if (trimmed.length > 0) onSubmit(trimmed);
      },
      onError: (reason) => {
        setMicState("idle");
        setInterimTranscript("");
        if (reason === "not-allowed") {
          setPermissionDenied(true);
        }
      },
      onEnd: () => {
        setMicState("idle");
      },
    });
  }

  function handleToggleMode() {
    controllerRef.current?.stop();
    setMicState("idle");
    setInterimTranscript("");
    setManualMode(mode === "mic" ? "text" : "mic");
  }

  function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (disabled || trimmed.length === 0) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <div data-testid="practice-input-form" className="flex flex-col gap-3">
      {fallbackReason ? (
        <p data-testid="practice-input-fallback-reason" className="text-body-sm text-muted">
          {fallbackReason}
        </p>
      ) : null}

      {mode === "mic" ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleMicClick}
            disabled={disabled}
            data-testid="practice-mic-button"
            data-state={micState}
            aria-label="开始说话 Start speaking"
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-h2 active:scale-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 ${
              micState === "listening"
                ? "animate-pulse bg-accent text-accent-foreground"
                : "bg-accent-soft text-accent"
            }`}
          >
            <span aria-hidden>🎤</span>
          </button>
          <p
            data-testid="practice-mic-status"
            className="min-h-5 text-center text-body-sm text-muted"
            role="status"
          >
            {micState === "listening"
              ? interimTranscript.length > 0
                ? interimTranscript
                : "正在聆听... Listening..."
              : "点击麦克风开始说话 Tap the mic to speak"}
          </p>
          <button
            type="button"
            onClick={handleToggleMode}
            data-testid="practice-input-mode-toggle"
            className="text-body-sm text-muted underline underline-offset-2"
          >
            改用打字 Switch to typing
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <form onSubmit={handleTextSubmit} data-testid="practice-text-form" className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={disabled}
              placeholder="用英文打字回复 Emily... Type your reply"
              aria-label="你的回复 Your reply"
              data-testid="practice-text-input"
              className="min-w-0 flex-1 rounded-button border border-border bg-card px-4 py-3 text-body-lg text-foreground disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || value.trim().length === 0}
              data-testid="practice-send-button"
              className="btn-primary shrink-0 px-5 py-3 active:scale-[0.98] active:brightness-90"
            >
              发送 Send
            </button>
          </form>
          {isSupported ? (
            <button
              type="button"
              onClick={handleToggleMode}
              data-testid="practice-input-mode-toggle"
              className="self-start text-body-sm text-muted underline underline-offset-2"
            >
              改用语音 Switch to voice
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
