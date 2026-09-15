"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { IconBoxButton } from "@/components/practice/icon-box-button";
import {
  isSpeechRecognitionSupported,
  type SpeechRecognitionErrorReason,
} from "@/lib/speech-recognition";
import { useMicListening } from "@/lib/use-mic-listening";
import {
  getServerTurnTakingSnapshot,
  getTurnTakingSnapshot,
  subscribeToTurnTaking,
} from "@/lib/speech-synthesis";

type PracticeInputFormProps = {
  disabled: boolean;
  onSubmit: (text: string) => void;
  /**
   * A boxed action button (built with IconBoxButton, same as the mode
   * toggle) rendered alongside the mic/text controls — the Ask-in-Chinese
   * trigger, owned and styled by the parent so this form doesn't need to
   * know anything about that feature (2026-08-07 UI draft: the two boxed
   * buttons flank the mic as a matched pair).
   */
  asideAction?: ReactNode;
};

type InputMode = "mic" | "text";
type MicState = "idle" | "listening";

const UNSUPPORTED_REASON =
  "你的浏览器不支持语音识别，已切换到文字输入。 Your browser doesn't support voice input, switched to typing.";
const PERMISSION_DENIED_REASON =
  "麦克风权限被拒绝，已切换到文字输入。 Microphone access was denied, switched to typing.";
const NO_MICROPHONE_REASON =
  "检测不到麦克风设备，已切换到文字输入。 No microphone was detected, switched to typing.";
const NO_SPEECH_RETRY_MESSAGE = "没听清，请再说一次。 I didn't catch that. Please try again.";
const REPEATED_NO_SPEECH_REASON =
  "连续三次没听清，已切换到文字输入。 I couldn't hear you three times, so I switched to typing.";

/**
 * Recognition failure reasons that can trigger an auto-fallback to text.
 * Hardware/permission faults do so immediately; `"no-speech"` does so only
 * on the third consecutive occurrence. Each gets a distinct explanation so
 * the learner knows whether retrying voice is likely to help.
 */
type FallbackTrigger = Extract<SpeechRecognitionErrorReason, "not-allowed" | "audio-capture" | "no-speech">;

function isImmediateFallbackTrigger(
  reason: SpeechRecognitionErrorReason,
): reason is Exclude<FallbackTrigger, "no-speech"> {
  return reason === "not-allowed" || reason === "audio-capture";
}

function fallbackTriggerReason(trigger: FallbackTrigger): string {
  switch (trigger) {
    case "not-allowed":
      return PERMISSION_DENIED_REASON;
    case "audio-capture":
      return NO_MICROPHONE_REASON;
    case "no-speech":
      return REPEATED_NO_SPEECH_REASON;
  }
}

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
 * `isSupported` and `fallbackTrigger`. The no-speech retry counter only
 * decides when that trigger is set; it does not create a separate mode.
 */
export function PracticeInputForm({ disabled, onSubmit, asideAction }: PracticeInputFormProps) {
  const isSupported = useSpeechRecognitionSupport();
  const turnTakingState = useSyncExternalStore(
    subscribeToTurnTaking,
    getTurnTakingSnapshot,
    getServerTurnTakingSnapshot,
  );
  const isMicGated = turnTakingState !== "idle";

  const [manualMode, setManualMode] = useState<InputMode | null>(null);
  const [fallbackTrigger, setFallbackTrigger] = useState<FallbackTrigger | null>(null);
  const [consecutiveNoSpeechCount, setConsecutiveNoSpeechCount] = useState(0);
  const [value, setValue] = useState("");

  const consecutiveNoSpeechCountRef = useRef(0);

  function resetNoSpeechCount() {
    consecutiveNoSpeechCountRef.current = 0;
    setConsecutiveNoSpeechCount(0);
  }

  const { isListening, interimTranscript, beginListening, stopListening } = useMicListening({
    onResult: (transcript, isFinal) => {
      resetNoSpeechCount();
      if (!isFinal) return;
      const trimmed = transcript.trim();
      if (trimmed.length > 0) onSubmit(trimmed);
    },
    onError: (reason) => {
      if (reason === "no-speech") {
        const nextCount = consecutiveNoSpeechCountRef.current + 1;
        consecutiveNoSpeechCountRef.current = nextCount;
        setConsecutiveNoSpeechCount(nextCount);
        if (nextCount >= 3) setFallbackTrigger("no-speech");
      } else {
        resetNoSpeechCount();
      }
      if (isImmediateFallbackTrigger(reason)) setFallbackTrigger(reason);
    },
  });
  const micState: MicState = isListening ? "listening" : "idle";

  const mode: InputMode = manualMode ?? (isSupported && fallbackTrigger === null ? "mic" : "text");
  const fallbackReason: string | null = manualMode
    ? null
    : !isSupported
      ? UNSUPPORTED_REASON
      : fallbackTrigger !== null
        ? fallbackTriggerReason(fallbackTrigger)
        : null;

  function handleMicClick() {
    if (disabled || isMicGated) return;
    if (isListening) {
      stopListening();
      return;
    }
    // Emily now auto-speaks every one of her lines (see
    // practice-page-content.tsx), so by the time the learner taps the mic
    // for their next turn, her reply's own audio is very often either
    // already playing or about to start (its live-TTS fetch may still be in
    // flight — see speech-synthesis.ts's acquireMicListening doc comment for
    // both orderings). Left alone, that audio plays back through the same
    // microphone the recognizer just started listening on, which real
    // devices reliably let bleed into (or let echo-cancellation
    // over-aggressively strip out) the learner's own voice — the same class
    // of collision ticket/commit 5e94690 already fixed once for the opening
    // line specifically, now recurring on every turn since every reply
    // auto-plays. acquireMicListening() both cancels whatever's already
    // playing right now AND stops any of Emily's audio still in flight from
    // starting later while this listening session is still active.
    // Each tap owns one session id. Late lifecycle callbacks from an older
    // WebKit recognizer cannot release or reset the new session.
    beginListening();

        // Not calling controllerRef.current?.stop() here — the recognizer
        // already stops itself right after a final result (see
        // speech-recognition.ts's startListening) — and calling it
        // reentrantly from inside the very event handler that's still
        // dispatching this result raced e2e/fixtures.ts's mock, which nulls
        // its shared "active recognition" reference synchronously from
        // inside stop() before the mock had finished dispatching.
  }

  function handleToggleMode() {
    stopListening();
    if (mode === "text") resetNoSpeechCount();
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
        <div className="flex items-center justify-center gap-3">
          <IconBoxButton
            icon="⌨️"
            lineOne="改用打字"
            lineTwo="Type instead"
            onClick={handleToggleMode}
            data-testid="practice-input-mode-toggle"
          />

          <div className="flex flex-1 flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleMicClick}
              disabled={disabled || isMicGated}
              data-testid="practice-mic-button"
              data-state={isListening ? "listening" : "idle"}
              // Tapping this button starts the microphone at the same
              // instant — see src/lib/speech-synthesis.ts's
              // AUDIO_UNLOCK_EXEMPT_SELECTOR doc comment: playing Emily's
              // audio out of the speaker at that exact moment reliably
              // drowns out or echo-cancels the learner's own voice out of
              // the recognized transcript, so this tap must never double as
              // the "learner interacted with the page" cue speakLinesAssertively
              // listens for.
              data-audio-unlock-exempt
              aria-label={micState === "listening" ? "停止说话 Stop listening" : "开始说话 Start speaking"}
              className={`btn-icon-pressed select-none flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-h2 disabled:cursor-not-allowed disabled:opacity-40 ${
                isListening
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
              {turnTakingState === "speaking"
                ? "Emily 正在说话，请稍候... Emily is speaking. Please wait..."
                : turnTakingState === "handoff-gap"
                ? "等她话音落下再开口... Wait for her voice to settle..."
                : isListening
                ? interimTranscript.length > 0
                  ? interimTranscript
                  : "正在聆听... Listening..."
                : consecutiveNoSpeechCount === 2
                  ? NO_SPEECH_RETRY_MESSAGE
                  : "点击麦克风开始说话 Tap the mic to speak"}
            </p>
          </div>

          {asideAction}
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
              className="btn-primary shrink-0 px-5 py-3"
            >
              发送 Send
            </button>
          </form>
          <div className="flex items-center gap-3">
            {isSupported ? (
              <IconBoxButton
                icon="🎤"
                lineOne="改用语音"
                lineTwo="Switch to voice"
                onClick={handleToggleMode}
                data-testid="practice-input-mode-toggle"
              />
            ) : null}
            {asideAction}
          </div>
        </div>
      )}
    </div>
  );
}
