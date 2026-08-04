"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AskInChineseSheet } from "@/components/practice/ask-in-chinese-sheet";
import { ConversationProgressSteps } from "@/components/practice/conversation-progress-steps";
import { EmilyAvatar, type EmilyAvatarState } from "@/components/practice/emily-avatar";
import { MessageBubblePair } from "@/components/practice/message-bubble-pair";
import { PracticeInputForm } from "@/components/practice/practice-input-form";
import { PracticeTranscriptDrawer } from "@/components/practice/practice-transcript-drawer";
import { pickRandomOpeningLine, pickRandomSilenceNudge, type HighlightKey } from "@/content/practice";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import { markStepComplete } from "@/lib/progress";
import { usePractice } from "@/lib/practice-state";

const PRACTICE_TURN_ENDPOINT = "/api/practice/turn";

/** How long Emily's avatar stays in the "talking" state after a new line lands, before settling back to idle. */
const TALKING_DURATION_MS = 1400;

/**
 * How long the learner can go without submitting a reply before Emily sends
 * one gentle nudge (ticket 10; spec.md "Practice 页交互模型": "无响应计时
 * 15–20 秒触发一次鼓励语，不推进状态，不提供答案"; user story 62). Picked at
 * the middle of the spec's 15-20s range.
 */
const SILENCE_TIMEOUT_MS = 18000;

type TurnResponseBody = {
  verdict: "accepted" | "needs_retry" | "off_topic";
  reply_en: string;
  reply_zh: string;
  highlight_key: string;
};

function isTurnResponseBody(value: unknown): value is TurnResponseBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.verdict === "accepted" || v.verdict === "needs_retry" || v.verdict === "off_topic") &&
    typeof v.reply_en === "string" &&
    typeof v.reply_zh === "string" &&
    typeof v.highlight_key === "string"
  );
}

/**
 * Practice page body: a text-driven conversation with Emily that walks the
 * learner through the 4-state Conversation State Machine (ticket 08;
 * spec.md "Practice 页交互模型"). Split out from page.tsx (a Server
 * Component, so it can keep exporting `metadata`) for the same reason as
 * Explore's page/content split — everything here is client-only state
 * (the practice store, in-flight request status, avatar animation timing).
 *
 * Voice input (ticket 09, still landing in a sibling worktree against this
 * same file) is explicitly out of scope here — this page's text form must
 * work standalone. Support & recovery features (ticket 10 — bilingual
 * subtitle toggle, replay, Ask-in-Chinese sheet, silence-timeout nudge, full
 * transcript drawer) are wired in below; per spec.md's "Practice 页交互模型"
 * they must never advance `conversationState` or call the LLM proxy route
 * themselves.
 */
export function PracticePageContent() {
  const router = useRouter();
  const {
    conversationState,
    messages,
    isComplete,
    ensureOpeningMessage,
    appendLearnerMessage,
    recordTurnResult,
    appendSupportMessage,
  } = usePractice();

  const [avatarState, setAvatarState] = useState<EmilyAvatarState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAskInChineseOpen, setIsAskInChineseOpen] = useState(false);
  // Mirrors the id of the Emily message the "talking" beat was last started
  // for — see the render-time adjustment below.
  const [talkingForMessageId, setTalkingForMessageId] = useState<string | undefined>(undefined);

  const openingPickedRef = useRef(false);

  // Opening line: picked once per mount, only actually applied by
  // ensureOpeningMessage if the transcript is still empty (fresh start). A
  // resumed/refreshed session already has message #1 persisted, so the
  // freshly-picked-but-unused line here is simply discarded.
  useEffect(() => {
    if (openingPickedRef.current) return;
    openingPickedRef.current = true;
    ensureOpeningMessage(pickRandomOpeningLine());
  }, [ensureOpeningMessage]);

  const emilyMessage = [...messages].reverse().find((message) => message.role === "emily") ?? null;
  const lastMessage = messages[messages.length - 1];
  const learnerMessage = lastMessage?.role === "learner" ? lastMessage : null;

  // Whenever a new Emily line lands (the opening line, or a fresh reply),
  // kick off a brief "talking" beat. This adjusts state during render
  // (React's documented pattern for reacting to a changed value —
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than in a useEffect body: this repo's lint config
  // (react-hooks/set-state-in-effect) flags a setState call made directly
  // and synchronously in an effect as a cascading-render risk.
  if (emilyMessage && emilyMessage.id !== talkingForMessageId) {
    setTalkingForMessageId(emilyMessage.id);
    setAvatarState("talking");
  }

  // The matching return-to-idle transition is a genuine timer side effect,
  // so it stays in an Effect — but the setState call lives inside the
  // setTimeout callback, not directly in the effect body, which is exactly
  // the shape react-hooks/set-state-in-effect allows ("calling setState in
  // a callback function when external state changes").
  useEffect(() => {
    if (avatarState !== "talking") return;
    const timeoutId = setTimeout(() => setAvatarState("idle"), TALKING_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [avatarState]);

  // Silence-timeout nudge: a single-shot timer keyed off the last message's
  // id (or its absence, before the opening line lands) — any new message
  // (a learner submission, Emily's graded reply, or this nudge itself)
  // reruns the effect and re-arms a fresh window, so this fires once per
  // stretch of continued silence rather than on a repeating interval. Stays
  // idle while a turn is mid-flight (`isSubmitting`) so the nudge never
  // fires while Emily is "thinking", and stops entirely once the
  // conversation is complete. Deliberately calls `appendSupportMessage`
  // directly, never `recordTurnResult` — no LLM call, no state transition.
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (isComplete || isSubmitting) return;
    const timeoutId = setTimeout(() => {
      const nudge = pickRandomSilenceNudge();
      appendSupportMessage(nudge.en, nudge.zh);
    }, SILENCE_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [lastMessageId, isComplete, isSubmitting, appendSupportMessage]);

  async function handleSubmit(text: string) {
    if (isComplete || isSubmitting) return;
    const priorState = conversationState as ActiveConversationState;

    setErrorMessage(null);
    setIsSubmitting(true);
    appendLearnerMessage(text);
    setAvatarState("thinking");

    try {
      const history = messages.map((message) => ({
        role: message.role === "emily" ? ("assistant" as const) : ("user" as const),
        content: message.textEn,
      }));

      const response = await fetch(PRACTICE_TURN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: priorState, message: text, history }),
      });

      if (!response.ok) {
        throw new Error(`practice turn request failed with status ${response.status}`);
      }

      const data: unknown = await response.json();
      if (!isTurnResponseBody(data)) {
        throw new Error("practice turn response was malformed");
      }

      recordTurnResult({
        priorState,
        verdict: data.verdict,
        replyEn: data.reply_en,
        replyZh: data.reply_zh,
        // The route validates highlight_key against HIGHLIGHT_KEYS before
        // responding, so this cast is safe.
        highlightKey: data.highlight_key as HighlightKey,
      });
    } catch (error) {
      console.error("Practice turn failed", error);
      setErrorMessage("Emily 好像没收到消息，请再试一次。 Something went wrong — please try again.");
      setAvatarState("idle");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleViewSummary() {
    if (!isComplete) return;
    markStepComplete("practice");
    router.push("/review");
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Practice</h1>
        <p className="text-body text-muted">
          用打字和 Emily 完成一次打招呼对话——按自己的节奏来，说得不完美也没关系。
        </p>
      </div>

      <ConversationProgressSteps current={conversationState} />

      <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-card p-4">
        <EmilyAvatar state={avatarState} />
        <MessageBubblePair
          key={emilyMessage?.id}
          emilyMessage={emilyMessage ? { textEn: emilyMessage.textEn, textZh: emilyMessage.textZh } : null}
          learnerMessage={learnerMessage ? { textEn: learnerMessage.textEn, textZh: learnerMessage.textZh } : null}
          defaultShowChinese={messages.length > 0 && messages[0].id === emilyMessage?.id}
        />
      </div>

      <button
        type="button"
        onClick={() => setIsAskInChineseOpen(true)}
        disabled={isComplete}
        data-testid="ask-in-chinese-button"
        className="self-start text-body-sm text-accent underline underline-offset-2 disabled:opacity-50 active:scale-95 active:brightness-90"
      >
        中文提问 Ask in Chinese
      </button>

      {errorMessage ? (
        <p role="alert" data-testid="practice-error" className="text-body-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      <PracticeInputForm disabled={isComplete || isSubmitting} onSubmit={handleSubmit} />

      <PracticeTranscriptDrawer />

      {isAskInChineseOpen && !isComplete ? (
        <AskInChineseSheet
          conversationState={conversationState as ActiveConversationState}
          onClose={() => setIsAskInChineseOpen(false)}
        />
      ) : null}

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={!isComplete}
          onClick={handleViewSummary}
          data-testid="view-summary-button"
          className="btn-primary w-full"
        >
          查看学习总结 View Summary
        </button>
      </div>
    </div>
  );
}
