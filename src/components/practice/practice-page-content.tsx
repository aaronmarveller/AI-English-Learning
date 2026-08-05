"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AskInChineseSheet } from "@/components/practice/ask-in-chinese-sheet";
import { ConversationProgressSteps } from "@/components/practice/conversation-progress-steps";
import { EmilyAvatar, type EmilyAvatarState } from "@/components/practice/emily-avatar";
import { MessageBubblePair } from "@/components/practice/message-bubble-pair";
import { PracticeInputForm } from "@/components/practice/practice-input-form";
import { PracticeTranscriptDrawer } from "@/components/practice/practice-transcript-drawer";
import { pickRandomOpeningLine, SILENCE_NUDGE } from "@/content/practice";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import { markStepComplete } from "@/lib/progress";
import { usePractice } from "@/lib/practice-state";
import { submitPracticeTurn } from "@/lib/submit-practice-turn";

/** How long Emily's avatar stays in the "talking" state after a new line lands, before settling back to idle. */
const TALKING_DURATION_MS = 1400;

/**
 * How long the learner can go without submitting a reply before Emily sends
 * one gentle nudge (ticket 10; spec.md "Practice 页交互模型": "无响应计时
 * 15–20 秒触发一次鼓励语，不推进状态，不提供答案"; user story 62). Picked at
 * the middle of the spec's 15-20s range.
 */
const SILENCE_TIMEOUT_MS = 18000;

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
  // Tracks the in-flight submitPracticeTurn request, if any, so the cleanup
  // effect below can abort it on unmount — same ref-plus-unmount-cleanup
  // shape as practice-input-form.tsx's `controllerRef`/`startListening`.
  const submitControllerRef = useRef<AbortController | null>(null);

  // Opening line: picked once per mount, only actually applied by
  // ensureOpeningMessage if the transcript is still empty (fresh start). A
  // resumed/refreshed session already has message #1 persisted, so the
  // freshly-picked-but-unused line here is simply discarded.
  useEffect(() => {
    if (openingPickedRef.current) return;
    openingPickedRef.current = true;
    ensureOpeningMessage(pickRandomOpeningLine());
  }, [ensureOpeningMessage]);

  // Stop any in-flight turn submission if the learner navigates away mid-request.
  useEffect(() => {
    return () => {
      submitControllerRef.current?.abort();
    };
  }, []);

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
      appendSupportMessage(SILENCE_NUDGE);
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

    const history = messages.map((message) => ({
      role: message.role === "emily" ? ("assistant" as const) : ("user" as const),
      content: message.textEn,
    }));

    const controller = new AbortController();
    submitControllerRef.current = controller;

    // submitPracticeTurn never throws — it resolves a discriminated result,
    // so every failure path (network failure, non-2xx status, a stream
    // `error` event, the stream ending without `final`, or this request
    // being aborted) is handled explicitly below instead of via try/catch.
    const result = await submitPracticeTurn(
      { priorState, message: text, history },
      { signal: controller.signal },
    );

    if (result.ok) {
      recordTurnResult({
        priorState,
        verdict: result.data.verdict,
        replyEn: result.data.reply_en,
        replyZh: result.data.reply_zh,
        highlightKey: result.data.highlight_key,
      });
      setIsSubmitting(false);
      return;
    }

    if (result.reason === "aborted") {
      // The component is unmounting or this request was superseded — there
      // is nothing left to show the learner, so skip errorMessage/avatarState.
      return;
    }

    console.error("Practice turn failed", result.reason);
    setErrorMessage("Emily 好像没收到消息，请再试一次。 Something went wrong — please try again.");
    setAvatarState("idle");
    setIsSubmitting(false);
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
        className="btn-icon-pressed self-start text-body-sm text-accent underline underline-offset-2 disabled:opacity-50"
      >
        中文提问 Ask in Chinese
      </button>

      {errorMessage ? (
        <p role="alert" data-testid="practice-error" className="text-body-sm text-danger">
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
