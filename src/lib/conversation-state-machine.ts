/**
 * Conversation State Machine — pure functions only (ticket 08; spec.md
 * "模块划分" > "Conversation 状态机模块": "纯函数，不依赖网络与 UI"). No React,
 * no localStorage, no fetch — trivially unit-testable even though this repo
 * has no unit-test runner; it's exercised end-to-end through the E2E seam
 * (e2e/practice-conversation.spec.ts) instead.
 *
 * Transition contract (spec.md "Conversation State Machine", grounded in the
 * ticket's own diagram: Conversation Start → Greeting → Check-in → Response
 * → Closing → Complete → Review):
 *
 *   accepted     → advance to the next state (Closing's accept → "complete")
 *   needs_retry  → stay on the current state
 *   off_topic    → stay on the current state
 *
 * "Conversation Start" isn't modeled as a state here — it's just "before the
 * opening line renders" (see src/content/practice.ts's opening-line pool and
 * src/lib/practice-state.ts's `ensureOpeningMessage`). "Review" isn't
 * modeled here either — it's the next page (ticket 11), reached only once
 * `nextConversationState` returns "complete" and the learner clicks
 * "查看学习总结".
 */

/** The 4 active conversation states the learner walks through, in fixed order. */
export const ACTIVE_CONVERSATION_STATES = ["greeting", "checkin", "response", "closing"] as const;

export type ActiveConversationState = (typeof ACTIVE_CONVERSATION_STATES)[number];

/** All conversation states, including the terminal "complete" state reached after Closing is accepted. */
export type ConversationState = ActiveConversationState | "complete";

/** The per-turn judgment the LLM proxy route returns (spec.md "大模型契约"). */
export type Verdict = "accepted" | "needs_retry" | "off_topic";

function isActiveConversationState(value: unknown): value is ActiveConversationState {
  return (
    typeof value === "string" &&
    (ACTIVE_CONVERSATION_STATES as readonly string[]).includes(value)
  );
}

export function isConversationState(value: unknown): value is ConversationState {
  return value === "complete" || isActiveConversationState(value);
}

/**
 * Pure state transition. `current` must be one of the 4 active states (once
 * a conversation reaches "complete" there is nothing left to submit against
 * — callers should stop invoking this once `isConversationComplete` is true).
 */
export function nextConversationState(
  current: ActiveConversationState,
  verdict: Verdict,
): ConversationState {
  if (verdict !== "accepted") return current;
  const index = ACTIVE_CONVERSATION_STATES.indexOf(current);
  const next = ACTIVE_CONVERSATION_STATES[index + 1];
  return next ?? "complete";
}

export function isConversationComplete(state: ConversationState): state is "complete" {
  return state === "complete";
}
