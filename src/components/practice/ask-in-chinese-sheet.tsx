"use client";

/**
 * Ask-in-Chinese bottom sheet (ticket 10; spec.md "Practice 页交互模型";
 * user stories 54-57) — turned into a real spoken help MODE by issue #19
 * (docs/ai-configuration.md section 6 "Chinese Help Rules"; issue #12's
 * "Chinese help becomes a mode, with its own seam").
 *
 * The initial tap shows the fixed 4-part canned explanation straight from
 * `GREETING_SOMEBODY_LESSON.chineseHelp` — instant and with no model call.
 * Issue #27 keeps it silent until its manual play control is used, while a
 * model-generated follow-up (or its canned fallback) auto-plays. From there
 * the learner may
 * keep talking, in Chinese, by voice or by text, using the mic/text input
 * this component now owns itself. A Chinese follow-up is answered by the
 * model through `askChineseQuestion` (src/lib/ask-chinese-question.ts) —
 * a wholly separate seam from the Judge (see that module's and
 * src/lib/chinese-explanation.ts's doc comments). An English follow-up
 * means the learner is done asking for help — this component reports that
 * back via `onExitWithEnglishInput` so the caller can both close help mode
 * and submit that text as a normal Practice turn, instead of the learner
 * having to retype it (issue #19 acceptance criterion 6; user story 28
 * "returning to English is frictionless").
 *
 * Speech recognition here is configured for Chinese
 * (`CHINESE_RECOGNITION_LANG`), independent from the main conversation's
 * English-configured recognizer in practice-input-form.tsx (issue #19
 * acceptance criterion 2) — a fresh recognizer instance per mic tap, same
 * shape as that component's own mic handling.
 *
 * Like before, opening/closing this sheet and everything that happens
 * inside it is local UI state — it never touches the practice store
 * (`conversationState` / `messages` / `turnRecords`), so it can never
 * advance or reset the conversation (user story 57), and Chinese Turns
 * never feed the Learning Summary (issue #19 acceptance criterion 7).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import { containsChineseText } from "@/lib/detect-chinese-input";
import { askChineseQuestion } from "@/lib/ask-chinese-question";
import {
  CHINESE_RECOGNITION_LANG,
  isSpeechRecognitionSupported,
  startListening,
  type ListeningController,
} from "@/lib/speech-recognition";
import {
  acquireMicListening,
  getServerSpeakingSnapshot,
  getSpeakingSnapshot,
  releaseMicListening,
  speak,
  speakAssertively,
  subscribeToSpeaking,
  type MicListeningOwner,
} from "@/lib/speech-synthesis";

type AskInChineseSheetProps = {
  conversationState: ActiveConversationState;
  onClose: () => void;
  /**
   * Called instead of just closing when the learner speaks/types English
   * while help mode is open — the text is handed back so the caller can
   * submit it as a normal Practice turn (issue #19 acceptance criterion 6).
   */
  onExitWithEnglishInput: (text: string) => void;
};

/** One follow-up exchange shown in the sheet, in order. */
type FollowUp = {
  id: string;
  questionZh: string;
  answerZh: string;
  /** True when `answerZh` is the canned fallback text, not a model answer (issue #19 acceptance criterion 5). */
  isFallback: boolean;
};

let followUpIdCounter = 0;

export function AskInChineseSheet({ conversationState, onClose, onExitWithEnglishInput }: AskInChineseSheetProps) {
  const help = GREETING_SOMEBODY_LESSON.chineseHelp[conversationState];

  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  const controllerRef = useRef<ListeningController | null>(null);
  const micListeningOwnerRef = useRef<MicListeningOwner | null>(null);
  const spokenFollowUpIdsRef = useRef(new Set<string>());
  const isSupported = typeof window !== "undefined" && isSpeechRecognitionSupported();
  const isEmilySpeaking = useSyncExternalStore(
    subscribeToSpeaking,
    getSpeakingSnapshot,
    getServerSpeakingSnapshot,
  );

  function releaseOwnedMic() {
    if (!micListeningOwnerRef.current) return;
    releaseMicListening(micListeningOwnerRef.current);
    micListeningOwnerRef.current = null;
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
      releaseOwnedMic();
    };
  }, []);

  useEffect(() => {
    const latest = followUps.at(-1);
    if (!latest || spokenFollowUpIdsRef.current.has(latest.id)) return;
    spokenFollowUpIdsRef.current.add(latest.id);
    // Every Emily reply gets the same gesture-retry safety net as Practice
    // replies. Returning its cleanup removes any still-armed interaction
    // listeners when a newer answer arrives or the sheet unmounts.
    return speakAssertively(latest.answerZh, { lang: "zh-CN" });
  }, [followUps]);

  /** Renders the fixed 4-part canned text as the fallback answer for a failed model call. */
  function cannedFallbackAnswer(): string {
    return `${help.meaning}\n${help.whenToUse}\n${help.example}\n${help.encouragement}`;
  }

  async function handleFollowUp(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    if (!containsChineseText(trimmed)) {
      // English input while help mode is open means the learner is back to
      // practicing English — exit help mode and hand the text off rather
      // than discarding it (user story 28).
      onExitWithEnglishInput(trimmed);
      return;
    }

    setIsAsking(true);
    const id = `chinese-followup-${(followUpIdCounter += 1)}`;
    try {
      const answerZh = await askChineseQuestion({ state: conversationState, question: trimmed });
      setFollowUps((prev) => [...prev, { id, questionZh: trimmed, answerZh, isFallback: false }]);
    } catch (error) {
      // Issue #19 acceptance criterion 5: a failed explanation call
      // degrades to the canned four-part text rather than surfacing an
      // error to the learner.
      console.error("Chinese explanation request failed, falling back to canned text", error);
      setFollowUps((prev) => [
        ...prev,
        { id, questionZh: trimmed, answerZh: cannedFallbackAnswer(), isFallback: true },
      ]);
    } finally {
      setIsAsking(false);
    }
  }

  function handleTextSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = textValue;
    setTextValue("");
    void handleFollowUp(value);
  }

  function handleMicClick() {
    if (isListening || isAsking || getSpeakingSnapshot()) return;
    controllerRef.current?.stop();
    releaseOwnedMic();
    micListeningOwnerRef.current = acquireMicListening();
    setInterimTranscript("");
    setIsListening(true);

    controllerRef.current = startListening(
      {
        onResult: (transcript, isFinal) => {
          if (!isFinal) {
            setInterimTranscript(transcript);
            return;
          }
          releaseOwnedMic();
          setIsListening(false);
          setInterimTranscript("");
          void handleFollowUp(transcript);
        },
        onError: () => {
          releaseOwnedMic();
          setIsListening(false);
          setInterimTranscript("");
        },
        onEnd: () => {
          releaseOwnedMic();
          setIsListening(false);
        },
      },
      { lang: CHINESE_RECOGNITION_LANG },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40"
      data-testid="ask-in-chinese-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="中文提问 Ask in Chinese"
        data-testid="ask-in-chinese-sheet"
        className="flex max-h-[85vh] flex-col rounded-card border border-border bg-card p-5"
        // Stop clicks inside the sheet from bubbling to the backdrop's close handler.
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3">中文提问 Ask in Chinese</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="ask-in-chinese-close-button"
            aria-label="关闭 Close"
            className="btn-icon-pressed text-body-lg text-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto text-body">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-body-sm font-semibold text-muted">这句是什么意思</p>
              <p>{help.meaning}</p>
            </div>
            <div>
              <p className="text-body-sm font-semibold text-muted">什么时候用</p>
              <p>{help.whenToUse}</p>
            </div>
            <div>
              <p className="text-body-sm font-semibold text-muted">举个例子</p>
              <p>{help.example}</p>
            </div>
            <div>
              <p className="text-body-sm font-semibold text-muted">继续加油</p>
              <p>{help.encouragement}</p>
            </div>
            <button
              type="button"
              onClick={() => void speak(cannedFallbackAnswer(), { lang: "zh-CN" })}
              data-testid="ask-in-chinese-play-explanation"
              aria-label="播放中文讲解 Play Chinese explanation"
              className="btn-icon-pressed inline-flex w-fit items-center gap-2 rounded-button bg-accent-soft px-3 py-2 text-body-sm font-semibold text-accent"
            >
              <span aria-hidden>🔊</span>
              <span>播放讲解 Play explanation</span>
            </button>
          </div>

          {followUps.length > 0 ? (
            <div data-testid="ask-in-chinese-followups" className="flex flex-col gap-3 border-t border-border pt-3">
              {followUps.map((followUp) => (
                <div key={followUp.id} className="flex flex-col gap-1">
                  <p data-testid="ask-in-chinese-followup-question" className="text-body-sm font-semibold text-foreground">
                    {followUp.questionZh}
                  </p>
                  <p
                    data-testid="ask-in-chinese-followup-answer"
                    data-fallback={followUp.isFallback}
                    className="whitespace-pre-line text-body-sm text-muted"
                  >
                    {followUp.answerZh}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-body-sm text-muted">继续用中文提问，或者直接说英语回到练习</p>
          <form onSubmit={handleTextSubmit} data-testid="ask-in-chinese-text-form" className="flex items-center gap-2">
            <input
              type="text"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder="用中文输入你的问题..."
              aria-label="中文提问输入框"
              data-testid="ask-in-chinese-text-input"
              disabled={isAsking}
              className="min-w-0 flex-1 rounded-button border border-border bg-card px-4 py-3 text-body text-foreground disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isAsking || textValue.trim().length === 0}
              data-testid="ask-in-chinese-send-button"
              className="btn-primary shrink-0 px-4 py-3"
            >
              发送
            </button>
          </form>

          {isSupported ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMicClick}
                disabled={isAsking || isEmilySpeaking}
                data-testid="ask-in-chinese-mic-button"
                data-state={isListening ? "listening" : "idle"}
                aria-label="用中文提问 Ask in Chinese by voice"
                className={`btn-icon-pressed flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-h3 disabled:cursor-not-allowed disabled:opacity-40 ${
                  isListening ? "animate-pulse bg-accent text-accent-foreground" : "bg-accent-soft text-accent"
                }`}
              >
                <span aria-hidden>🎤</span>
              </button>
              <p data-testid="ask-in-chinese-mic-status" className="text-body-sm text-muted" role="status">
                {isEmilySpeaking
                  ? "Emily 正在说话，请稍候... Emily is speaking. Please wait..."
                  : isAsking
                  ? "Emily 正在思考... Thinking..."
                  : isListening
                    ? interimTranscript.length > 0
                      ? interimTranscript
                      : "正在聆听... Listening..."
                    : "点击麦克风用中文提问"}
              </p>
            </div>
          ) : isAsking ? (
            <p data-testid="ask-in-chinese-mic-status" className="text-body-sm text-muted" role="status">
              Emily 正在思考... Thinking...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
