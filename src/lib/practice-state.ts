"use client";

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "@/lib/create-persisted-store";
import {
  ACTIVE_CONVERSATION_STATES,
  isConversationState,
  type ActiveConversationState,
  type ConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";
import {
  applyGoalReport,
  deriveConversationState,
  getFocusGoal,
  isGoalProgress,
  isGoalProgressComplete,
  type GoalProgress,
} from "@/lib/goal-progress";
import type { GoalReport } from "@/lib/practice-turn-protocol";
import { isStateTurnRecord, type StateTurnRecord } from "@/lib/turn-record";
import type { OpeningLine, SupportNudge } from "@/content/lesson";

/**
 * Practice conversation store (ticket 08) — built on the same shared
 * useSyncExternalStore + localStorage factory as src/lib/progress.ts
 * (src/lib/create-persisted-store.ts, extracted in ticket 07), under its
 * own distinct storage key so it never collides with the Learning Flow
 * progress store.
 *
 * This module owns *persisted conversation state*: Goal Progress, the
 * turn-by-turn message history (populated here so a transcript has data to
 * render), and the accumulated per-state `turnRecords` the Learning Summary
 * derives from (issue #20). It performs no model call of its own — the LLM
 * request is the Practice page component's job (see
 * src/components/practice/practice-page-content.tsx), which reports the
 * judged Turn back here via `recordTurnResult`.
 *
 * Issue #47 (ADR-0012): the persisted pointer is gone. What this store
 * persists instead is `goalProgress` — the *set* of Conversation Goals
 * achieved so far — and the Conversation State the rest of the page reads
 * (`usePractice().conversationState`, `.focusGoal`, `.isComplete`) is derived
 * from it every render via src/lib/goal-progress.ts, never stored. The store
 * applies the Judge's Goal Report to Goal Progress itself
 * (`applyGoalReport`, all-or-nothing per ADR-0012), and keys `attemptCounts`
 * by the Focus Goal at submission time — "an attempt counts against the Focus
 * Goal only, so a Goal achieved early is always `passedFirstTry`".
 *
 * Issue #20 (#12's "Learning Summary inputs are derived, not reported"):
 * replaced the old model-reported `highlightKeys: HighlightKey[]` list with
 * `turnRecords: StateTurnRecord[]` (src/lib/turn-record.ts) — one record per
 * Conversation State that was ever accepted, carrying whether it was passed
 * first try, whether the reply matched an Accepted Response, and whether the
 * learner asked back. `attemptCounts` is the bookkeeping this store needs to
 * compute `passedFirstTry` itself: how many times the learner has submitted
 * against each Goal so far, incremented on every turn regardless of verdict.
 * Pre-issue-#20 persisted data (the old `highlightKeys` shape) has no
 * `turnRecords` field at all, and pre-issue-#47 data has no `goalProgress`
 * field — `deserialize` below treats either mismatch as "no saved state" and
 * discards the whole snapshot rather than trying to salvage individual fields
 * (see #12's Further Notes: "In-flight practice sessions will reset").
 */

export type PracticeMessage = {
  id: string;
  role: "emily" | "learner";
  /** English text — always populated. */
  textEn: string;
  /** Chinese translation. Populated for Emily's messages (from the selected
   * Conversation Script line's `zh` — see src/lib/emily-reply-selector.ts —
   * or the opening line's `zh`); empty string for the learner's own echoed input. */
  textZh: string;
  /** The Conversation State active when this message was produced — for a graded Turn, the Focus Goal it was judged against (see `recordTurnResult`). */
  state: ConversationState;
};

export type PracticeStoreState = {
  /** The set of Conversation Goals achieved so far (ADR-0012) — what replaced the old `conversationState` pointer, and the only thing the Conversation State is derived from. */
  goalProgress: GoalProgress;
  messages: PracticeMessage[];
  turnRecords: StateTurnRecord[];
  /** How many times the learner has submitted against each Conversation Goal so far (all verdicts, not just accepted) — used to compute a newly-accepted record's `passedFirstTry`. Keyed by the Focus Goal at submission time. */
  attemptCounts: Partial<Record<ActiveConversationState, number>>;
};

const STORAGE_KEY = "greeting-somebody:practice";

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value (a fresh literal on every call reads as "always
// changed" and can trigger a render loop). createPersistedStore returns this
// exact reference from its getServerSnapshot. Never mutated in place — every
// update goes through `store.persist`, which always builds a new object.
const INITIAL_STATE: PracticeStoreState = {
  goalProgress: [],
  messages: [],
  turnRecords: [],
  attemptCounts: {},
};

function isPracticeMessage(value: unknown): value is PracticeMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.role === "emily" || v.role === "learner") &&
    typeof v.textEn === "string" &&
    typeof v.textZh === "string" &&
    isConversationState(v.state)
  );
}

/** Sanitizes a persisted `attemptCounts` value, dropping anything that isn't a number keyed by a real Conversation Goal. Never fails the whole deserialize on its own — unlike `turnRecords`/`goalProgress`, a malformed `attemptCounts` isn't evidence of a pre-change shape, so it degrades to "no attempts recorded yet" instead of discarding the rest of the snapshot. */
function sanitizeAttemptCounts(value: unknown): Partial<Record<ActiveConversationState, number>> {
  if (typeof value !== "object" || value === null) return {};
  const v = value as Record<string, unknown>;
  const result: Partial<Record<ActiveConversationState, number>> = {};
  for (const state of ACTIVE_CONVERSATION_STATES) {
    if (typeof v[state] === "number") result[state] = v[state];
  }
  return result;
}

/**
 * Issue #20 (#12's Further Notes: "In-flight practice sessions will reset"):
 * a snapshot is only trusted if the two fields this store cannot work without
 * are present and well-shaped — `turnRecords` (whose absence means the old
 * pre-#20 `highlightKeys` shape) and `goalProgress` (whose absence means the
 * old pre-#47 `conversationState` shape). Either mismatch is treated as "no
 * saved state" rather than a partial-recovery case: the whole snapshot is
 * discarded (falling back to `INITIAL_STATE`, same as a JSON.parse failure)
 * instead of crashing or silently mixing old and new shapes. `messages` and
 * `attemptCounts` degrade per-entry instead, since neither is load-bearing for
 * correctness.
 */
/** Exported for practice-state.test.ts's discard-safely coverage (the persisted-store factory's own `serialize`/`deserialize` contract is otherwise private per store). */
export function deserialize(raw: string): PracticeStoreState {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return INITIAL_STATE;
  const p = parsed as Record<string, unknown>;

  if (!Array.isArray(p.turnRecords) || !p.turnRecords.every(isStateTurnRecord)) {
    return INITIAL_STATE;
  }
  if (!isGoalProgress(p.goalProgress)) {
    return INITIAL_STATE;
  }

  const goalProgress = p.goalProgress;
  const messages = Array.isArray(p.messages) ? p.messages.filter(isPracticeMessage) : [];
  const turnRecords = p.turnRecords;
  const attemptCounts = sanitizeAttemptCounts(p.attemptCounts);
  return { goalProgress, messages, turnRecords, attemptCounts };
}

function serialize(state: PracticeStoreState): string {
  return JSON.stringify(state);
}

const store = createPersistedStore<PracticeStoreState>({
  storageKey: STORAGE_KEY,
  initialState: INITIAL_STATE,
  serialize,
  deserialize,
});

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `practice-msg-${Date.now()}-${messageIdCounter}`;
}

/**
 * Shared internal helper: constructs a `PracticeMessage` (assigning it a
 * fresh id) and persists it appended to `messages`. Every exported function
 * below that appends an Emily/learner message goes through this, rather
 * than each hand-rolling the same "build the message object, spread it onto
 * the end of `messages`, persist" shape.
 *
 * `stateOverrides` lets a caller update the other top-level store fields in
 * the same persist call — only `recordTurnResult` needs this, to move
 * `goalProgress`/`turnRecords`/`attemptCounts` alongside appending Emily's
 * reply. Everything else distinct about each caller
 * (ensureOpeningMessage's no-op guard when messages already exist,
 * recordTurnResult's `applyGoalReport` call) stays in the caller, not here.
 */
function appendMessage(
  current: PracticeStoreState,
  input: { role: PracticeMessage["role"]; textEn: string; textZh: string; state: ConversationState },
  stateOverrides: Partial<Pick<PracticeStoreState, "goalProgress" | "turnRecords" | "attemptCounts">> = {},
): void {
  const message: PracticeMessage = { id: nextMessageId(), ...input };
  store.persist({ ...current, ...stateOverrides, messages: [...current.messages, message] });
}

/**
 * Appends Emily's opening line as the very first message, if the transcript
 * is still empty. No-op otherwise — safe to call unconditionally on every
 * mount (fresh start picks a line; a resumed/refreshed session keeps
 * whichever line was already shown, since it's already message #1).
 */
export function ensureOpeningMessage(line: OpeningLine): void {
  const current = store.getSnapshot();
  if (current.messages.length > 0) return;
  appendMessage(current, {
    role: "emily",
    textEn: line.en,
    textZh: line.zh,
    state: deriveConversationState(current.goalProgress),
  });
}

/** Appends the learner's echoed input as a message in the current state, ahead of grading. */
export function appendLearnerMessage(text: string): void {
  const current = store.getSnapshot();
  appendMessage(current, {
    role: "learner",
    textEn: text,
    textZh: "",
    state: deriveConversationState(current.goalProgress),
  });
}

/**
 * Records the server's structured result for the just-submitted learner
 * turn: applies the Judge's Goal Report to Goal Progress via the pure
 * all-or-nothing rule (src/lib/goal-progress.ts's `applyGoalReport` — an
 * `accepted` Turn adds every Goal the report marked `achieved`, at once, and
 * a `needs_retry` Turn saves nothing), appends Emily's reply as a message
 * tagged with the Goal the turn was judged against, bumps that Goal's attempt
 * count, and — only when the turn was accepted — appends a
 * `StateTurnRecord` for the Focus Goal (issue #20; see
 * src/lib/turn-record.ts). A `needs_retry` turn still bumps `attemptCounts`
 * (so a later accepted attempt against the same Goal correctly computes
 * `passedFirstTry: false`) but never itself contributes a record — only an
 * accepted Goal produces a highlight candidate.
 *
 * Issue #47: the record is still one per accepted Turn, attributed to the
 * Focus Goal. #51 re-grains that to one record per `achieved` Goal, which is
 * the same thing in #47's one-Goal-per-Turn conversations and different only
 * once a Turn can achieve several.
 *
 * `matchedAcceptedResponse` and `learnerAskedBack` are passed straight
 * through from the caller (practice-page-content.tsx), which already has
 * both: the former from comparing the learner's raw text against
 * `Lesson.script[focusGoal].acceptedResponses`
 * (src/lib/turn-record.ts's `matchesAcceptedResponse`), the latter from the
 * Judge's `learner_asked_back`. This module stays ignorant of `Lesson`
 * content — it only assembles the record, it doesn't compute any part of
 * it.
 *
 * Returns the resulting Goal Progress so the caller can act on it (e.g. know
 * immediately that the conversation just completed) without waiting on a
 * re-render.
 */
export function recordTurnResult(input: {
  focusGoal: ActiveConversationState;
  verdict: Verdict;
  goalReport: GoalReport;
  replyEn: string;
  replyZh: string;
  matchedAcceptedResponse: boolean;
  learnerAskedBack: boolean;
}): GoalProgress {
  const current = store.getSnapshot();

  const priorAttempts = current.attemptCounts[input.focusGoal] ?? 0;
  const attempts = priorAttempts + 1;
  const attemptCounts = { ...current.attemptCounts, [input.focusGoal]: attempts };

  const goalProgress = applyGoalReport(current.goalProgress, input.goalReport, input.verdict);

  const turnRecords =
    input.verdict === "accepted"
      ? [
          ...current.turnRecords,
          {
            state: input.focusGoal,
            passedFirstTry: attempts === 1,
            matchedAcceptedResponse: input.matchedAcceptedResponse,
            learnerAskedBack: input.learnerAskedBack,
          } satisfies StateTurnRecord,
        ]
      : current.turnRecords;

  appendMessage(
    current,
    { role: "emily", textEn: input.replyEn, textZh: input.replyZh, state: input.focusGoal },
    { goalProgress, turnRecords, attemptCounts },
  );
  return goalProgress;
}

/**
 * Appends an Emily message without touching Goal Progress or `turnRecords` —
 * for support features that must never move a conversation forward (ticket
 * 10's silence-timeout nudge; spec.md user story 62: "20 秒没说话时 Emily
 * 只轻轻推一下、不催也不给答案"). Unlike `recordTurnResult`, this never
 * applies a Goal Report — the learner hasn't submitted a turn to judge, so
 * there is nothing to apply.
 *
 * Issue #47: the message is tagged with the Focus Goal (the Conversation
 * State derived from Goal Progress) — the nudge is aimed at whatever Emily is
 * waiting for, which is the Focus Goal by definition. The nudge *text* is
 * still drawn from the Lesson's one global 3-line pool
 * (docs/ai-configuration.md section 3 specifies a single pool, not one per
 * Goal); selection happens at the call site
 * (src/lib/emily-reply-selector.ts's `selectSilenceNudge`). Takes a single
 * `SupportNudge`-shaped object (rather than two positional `en`/`zh` strings)
 * so call sites can pass a nudge value straight through.
 */
export function appendSupportMessage(input: SupportNudge): void {
  const current = store.getSnapshot();
  appendMessage(current, {
    role: "emily",
    textEn: input.en,
    textZh: input.zh,
    state: deriveConversationState(current.goalProgress),
  });
}

/** Clears the conversation back to a clean start — ticket 11's Retry button will call this. */
export function resetPractice(): void {
  store.persist({ goalProgress: [], messages: [], turnRecords: [], attemptCounts: {} });
}

/**
 * React hook: subscribes to the practice store and re-renders on change.
 * `getServerSnapshot` returns the fixed empty/initial state so server render
 * and the first client hydration pass agree (no hydration mismatch); React
 * then swaps in the real localStorage-backed value immediately after
 * hydrating, same pattern as src/lib/progress.ts's `useProgress`.
 *
 * `conversationState`, `focusGoal`, and `isComplete` are derived here rather
 * than stored (ADR-0012): a snapshot with `goalProgress: []` reads exactly
 * like a brand-new conversation, so a discarded pre-#47 snapshot needs no
 * special case beyond `deserialize`'s wholesale fallback.
 */
export function usePractice() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return {
    goalProgress: state.goalProgress,
    /** The first open Goal in canonical order, or `null` once every Goal is achieved. */
    focusGoal: getFocusGoal(state.goalProgress),
    conversationState: deriveConversationState(state.goalProgress),
    messages: state.messages,
    turnRecords: state.turnRecords,
    isComplete: isGoalProgressComplete(state.goalProgress),
    ensureOpeningMessage,
    appendLearnerMessage,
    recordTurnResult,
    appendSupportMessage,
    resetPractice,
  };
}

export { ACTIVE_CONVERSATION_STATES };
