"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AskInChineseSheet } from "@/components/practice/ask-in-chinese-sheet";
import { ConversationProgressSteps } from "@/components/practice/conversation-progress-steps";
import { EmilyAvatar, type EmilyAvatarState } from "@/components/practice/emily-avatar";
import { MessageBubblePair } from "@/components/practice/message-bubble-pair";
import { PracticeInputForm } from "@/components/practice/practice-input-form";
import { PracticeTranscriptDrawer } from "@/components/practice/practice-transcript-drawer";
import { pickRandomOpeningLine, SILENCE_NUDGE, type HighlightKey } from "@/content/practice";
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

// --- Streamed turn response parsing (issue #5) -------------------
//
// The `/api/practice/turn` route now streams Server-Sent Events instead of
// one blocking JSON body (see that route's doc comment for the exact wire
// format). Each event is `data: <json>\n\n`; the JSON payload is one of:
//   - { type: "partial", reply_en: string } — progress only, never committed.
//   - { type: "final", verdict, reply_en, reply_zh, highlight_key } — the one
//     event that gets validated and written to the Practice store.
//   - { type: "error", error: string } — terminal failure signal.

type StreamedTurnEvent =
  | ({ type: "final" } & TurnResponseBody)
  | { type: "partial"; reply_en: string }
  | { type: "error"; error: string };

function isStreamedTurnEvent(value: unknown): value is StreamedTurnEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === "partial") return typeof v.reply_en === "string";
  if (v.type === "error") return typeof v.error === "string";
  if (v.type === "final") return isTurnResponseBody(v);
  return false;
}

/**
 * Consumes `response.body` as Server-Sent Events, parsing out each `data:`
 * line's JSON payload as it arrives. Calls `onEvent` for every well-formed
 * event this module recognizes; malformed/unrecognized lines are silently
 * skipped (mirroring how the old `isTurnResponseBody` guard just made the
 * caller's `!isTurnResponseBody(data)` check fail rather than throwing a
 * parse error) — the caller decides what "the stream ended without ever
 * producing a valid final event" means for its own error handling.
 */
async function consumeTurnEventStream(
  response: Response,
  onEvent: (event: StreamedTurnEvent) => void,
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error("practice turn response had no body to stream");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a single frame may itself
    // be split across chunks, so only split on complete "\n\n" boundaries
    // and keep any trailing partial frame in the buffer for the next read.
    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const jsonText = line.slice("data:".length).trim();
        if (!jsonText) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          continue;
        }
        if (isStreamedTurnEvent(parsed)) {
          onEvent(parsed);
        }
      }
    }
  }
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

      // The route now streams Server-Sent Events rather than one blocking
      // JSON body (issue #5). `final` is the one event that gets
      // committed to the Practice store — exactly once, same as the old
      // single-JSON-body response — and `error` (or the stream simply
      // ending without ever sending `final`) falls into the same catch
      // block below that a non-ok status or malformed body used to.
      let finalResult: TurnResponseBody | null = null;
      let streamError: string | null = null;
      await consumeTurnEventStream(response, (event) => {
        if (event.type === "final") {
          finalResult = event;
        } else if (event.type === "error") {
          streamError = event.error;
        }
        // "partial" events are progress-only and intentionally not acted on
        // here — see this file's module doc comment above.
      });

      if (streamError) {
        throw new Error(`practice turn stream reported an error: ${streamError}`);
      }
      if (!finalResult) {
        throw new Error("practice turn stream ended without a final result");
      }

      const data: TurnResponseBody = finalResult;
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
