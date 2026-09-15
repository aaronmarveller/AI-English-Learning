/**
 * Conversation State vocabulary — pure values and validators only (ticket 08;
 * spec.md "模块划分" > "Conversation 状态机模块": "纯函数，不依赖网络与 UI"). No
 * React, no localStorage, no fetch — trivially unit-testable.
 *
 * Issue #47 (ADR-0012;
 * docs/adr/0012-flexible-goal-tracking-replaces-the-linear-state-machine.md):
 * this module used to own the linear transition — `nextConversationState`
 * advanced a pointer one step along `greeting → checkin → response → closing
 * → complete` per `accepted` Verdict. That pointer is gone. The four names are
 * now Conversation Goals the learner may achieve in any order and several per
 * Turn, and where a conversation stands is not a pointer at all but the
 * Conversation State derived off Goal Progress (CONTEXT.md "Conversation
 * State") — see src/lib/goal-progress.ts, which owns that derivation and is
 * what every caller of the deleted function now reads instead.
 *
 * The identifiers below keep their names — `ActiveConversationState`,
 * `ConversationState`, `Verdict`, `ACTIVE_CONVERSATION_STATES`. That was a
 * deliberate, self-imposed choice rather than anyone's instruction: the values
 * and the Verdict are the same domain terms they always were, and only the
 * pointer between them moved, so keeping the names kept #47's wide refactor
 * reviewable. What the names describe on this side is the vocabulary the Goal
 * Progress derivation reads — a Conversation State is now *derived* from Goal
 * Progress (CONTEXT.md "Conversation State"), not a position in a sequence, so
 * `ActiveConversationState` names a Conversation Goal (the value set is
 * unchanged and canonical) and `ConversationState` names that same value or the
 * terminal `complete`, exactly what src/lib/goal-progress.ts's
 * `deriveConversationState` returns.
 *
 * "Conversation Start" isn't modeled as a state here — it's just "before the
 * opening line renders" (see src/content/practice.ts's opening-line pool and
 * src/lib/practice-state.ts's `ensureOpeningMessage`). "Review" isn't modeled
 * here either — it's the next page (ticket 11), reached once Goal Progress is
 * complete (`isGoalProgressComplete`) and the learner clicks "查看学习总结".
 */

/** The 4 active Conversation Goals the learner must communicate, in canonical order. */
export const ACTIVE_CONVERSATION_STATES = ["greeting", "checkin", "response", "closing"] as const;

export type ActiveConversationState = (typeof ACTIVE_CONVERSATION_STATES)[number];

/** All Conversation States, including the terminal "complete" state reached once all four Goals are achieved. */
export type ConversationState = ActiveConversationState | "complete";

/**
 * The two Verdict values (spec.md "大模型契约"). Exactly two (issue #15) —
 * `off_topic` is not a Verdict of its own; off-topic input is judged
 * `needs_retry` (docs/ai-configuration.md section 4).
 *
 * Issue #47 (ADR-0012): a Verdict is no longer the model's output at all — it
 * is derived on the client from the Judge's Goal Report (src/lib/goal-progress.ts's
 * `deriveVerdict`), which is why the wire protocol
 * (src/lib/practice-turn-protocol.ts) no longer mentions this list. It stays
 * here, next to the state vocabulary, because it is still how the app talks
 * about a Turn: `accepted` means "at least one Goal achieved and none failed".
 */
export const VERDICTS = ["accepted", "needs_retry"] as const;
export type Verdict = (typeof VERDICTS)[number];

export function isActiveConversationState(value: unknown): value is ActiveConversationState {
  return (
    typeof value === "string" &&
    (ACTIVE_CONVERSATION_STATES as readonly string[]).includes(value)
  );
}

export function isConversationState(value: unknown): value is ConversationState {
  return value === "complete" || isActiveConversationState(value);
}
