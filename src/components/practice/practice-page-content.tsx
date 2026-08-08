"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseProgressChip } from "@/components/course-progress";
import { AskInChineseSheet } from "@/components/practice/ask-in-chinese-sheet";
import { ConversationProgressSteps } from "@/components/practice/conversation-progress-steps";
import { EmilyAvatar, type EmilyAvatarState } from "@/components/practice/emily-avatar";
import { EmilyInfoCard } from "@/components/practice/emily-info-card";
import { IconBoxButton } from "@/components/practice/icon-box-button";
import { MessageBubblePair } from "@/components/practice/message-bubble-pair";
import { PracticeInputForm } from "@/components/practice/practice-input-form";
import { PracticeTranscriptDrawer } from "@/components/practice/practice-transcript-drawer";
import { StageTag } from "@/components/stage-tag";
import { pickRandomOpeningLine, PRACTICE_HEADLINE, SILENCE_NUDGE } from "@/content/practice";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import { markStepComplete } from "@/lib/progress";
import { usePractice } from "@/lib/practice-state";
import { speakAssertively } from "@/lib/speech-synthesis";
import { submitPracticeTurn } from "@/lib/submit-practice-turn";

/** How long Emily's avatar stays in the "talking" state after a new line lands, before settling back to idle. */
const TALKING_DURATION_MS = 1400;

/**
 * The opening-line message id `speakAssertively` has already been fired for
 * (see the effect below) — module-scoped, not a component ref, deliberately:
 * a `useRef` resets on any full remount of the component (React Strict
 * Mode's dev-only double-invoke of effects, or a Fast Refresh reload), but
 * the store-persisted message id doesn't, so keying on it here survives a
 * remount without risking Emily's opening line audibly playing twice.
 */
let autoSpokenOpeningMessageId: string | undefined;

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
    resetPractice,
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

  // Emily speaks first: auto-plays the opening line's audio as soon as it
  // lands, so the learner hears her before typing anything, instead of only
  // on a manual 🔊 replay tap. Scoped to the opening line only (messages.length
  // === 1, mirroring MessageBubblePair's own "first message in the
  // conversation" check) — a resumed session that already has turns beyond
  // the opening line never replays audio on mount. Uses `speakAssertively`,
  // not `speak`, because most mobile browsers silently block unmuted audio
  // that isn't triggered by a user gesture — it falls back to the learner's
  // very next tap/keypress on the page when a bare autoplay attempt is
  // blocked. Guarded by `autoSpokenOpeningMessageId` (module scope, keyed on
  // the message's own id) rather than a ref, so a restarted conversation's
  // new opening line (a genuinely new id) auto-plays again with no manual
  // reset needed — see handleRestart.
  useEffect(() => {
    if (!emilyMessage || messages.length !== 1) return;
    if (autoSpokenOpeningMessageId === emilyMessage.id) return;
    autoSpokenOpeningMessageId = emilyMessage.id;
    return speakAssertively(emilyMessage.textEn);
  }, [emilyMessage, messages.length]);

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

  // Clean-slate restart, staying on /practice (unlike Review's "重练"
  // button, which navigates back here to trigger the same reset via a fresh
  // mount) — clears the store, then immediately re-seeds a new opening line
  // so the page never sits without one. The new line gets a genuinely new
  // message id, so the auto-play effect above picks it up on its own with no
  // manual reset needed here.
  function handleRestart() {
    submitControllerRef.current?.abort();
    resetPractice();
    ensureOpeningMessage(pickRandomOpeningLine());
    setErrorMessage(null);
    setIsSubmitting(false);
    setIsAskInChineseOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Practice" icon="🎙" asHeading />
        <CourseProgressChip />
      </div>

      <EmilyAvatar
        state={avatarState}
        topOverlay={<EmilyInfoCard />}
        headlineOverlay={
          <div className="flex flex-col gap-1.5">
            <h2 className="text-h3 leading-tight font-bold text-accent">{PRACTICE_HEADLINE.en}</h2>
            <p className="text-body-sm font-semibold text-accent">{PRACTICE_HEADLINE.zh}</p>
            <p className="text-[8px] leading-snug text-foreground/80">
              和 Emily 进行真实对话练习，
              <br />
              建立自信，轻松开口说英语！
            </p>
          </div>
        }
        bottomOverlay={
          <MessageBubblePair
            key={emilyMessage?.id}
            emilyMessage={emilyMessage ? { textEn: emilyMessage.textEn, textZh: emilyMessage.textZh } : null}
            learnerMessage={learnerMessage ? { textEn: learnerMessage.textEn, textZh: learnerMessage.textZh } : null}
            defaultShowChinese={messages.length > 0 && messages[0].id === emilyMessage?.id}
          />
        }
      />

      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <p className="text-center text-body-lg font-semibold text-foreground">
          <span aria-hidden>🎙</span> Your turn 你的发言
        </p>

        {errorMessage ? (
          <p role="alert" data-testid="practice-error" className="text-body-sm text-danger">
            {errorMessage}
          </p>
        ) : null}

        <PracticeInputForm
          disabled={isComplete || isSubmitting}
          onSubmit={handleSubmit}
          asideAction={
            <IconBoxButton
              icon="💬"
              lineOne="中文提问"
              lineTwo="Ask in Chinese"
              onClick={() => setIsAskInChineseOpen(true)}
              disabled={isComplete}
              data-testid="ask-in-chinese-button"
            />
          }
        />
      </div>

      <ConversationProgressSteps current={conversationState} />

      <PracticeTranscriptDrawer />

      {isAskInChineseOpen && !isComplete ? (
        <AskInChineseSheet
          conversationState={conversationState as ActiveConversationState}
          onClose={() => setIsAskInChineseOpen(false)}
        />
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <button
          type="button"
          onClick={handleRestart}
          data-testid="restart-practice-button"
          className="btn-outline w-full"
        >
          重新练习 Restart Practice
        </button>
        <button
          type="button"
          disabled={!isComplete}
          onClick={handleViewSummary}
          data-testid="view-summary-button"
          className="btn-primary flex w-full items-center justify-center gap-2"
        >
          查看学习总结 View Summary <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
