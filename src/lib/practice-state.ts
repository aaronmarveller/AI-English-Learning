"use client";

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "@/lib/create-persisted-store";
import {
  ACTIVE_CONVERSATION_STATES,
  isConversationState,
  nextConversationState,
  type ActiveConversationState,
  type ConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";
import { isStateTurnRecord, type StateTurnRecord } from "@/lib/turn-record";
import type { OpeningLine, SupportNudge } from "@/content/lesson";

/**
 * Practice conversation store (ticket 08) — built on the same shared
 * useSyncExternalStore + localStorage factory as src/lib/progress.ts
 * (src/lib/create-persisted-store.ts, extracted in ticket 07), under its
 * own distinct storage key so it never collides with the Learning Flow
 * progress store.
 *
 * This module owns *persisted conversation state*: the current
 * ConversationState, the turn-by-turn message history (populated here so
 * ticket 10's transcript drawer has data to render, even though this ticket
 * doesn't render the full log itself), and the accumulated per-state
 * `turnRecords` the Learning Summary derives from (issue #20). It wraps the
 * pure state machine in src/lib/conversation-state-machine.ts — this module
 * is the only place that calls `nextConversationState` and persists the
 * result — but never does the network call itself; the LLM request is the
 * Practice page component's job (see
 * src/components/practice/practice-page-content.tsx), which then reports the
 * result back here via `recordTurnResult`.
 *
 * Issue #20 (#12's "Learning Summary inputs are derived, not reported"):
 * replaced the old model-reported `highlightKeys: HighlightKey[]` list with
 * `turnRecords: StateTurnRecord[]` (src/lib/turn-record.ts) — one record per
 * Conversation State that was ever accepted, carrying whether it was passed
 * first try, whether the reply matched an Accepted Response, and whether
 * the learner asked back. `attemptCounts` is new bookkeeping this store
 * needs to compute `passedFirstTry` itself: how many times the learner has
 * submitted against each state so far, incremented on every turn regardless
 * of verdict. Pre-issue-#20 persisted data (the old `highlightKeys` shape)
 * has no `turnRecords` field at all — `deserialize` below treats that
 * mismatch as "no saved state" and discards the whole snapshot rather than
 * trying to salvage individual fields (see #12's Further Notes: "In-flight
 * practice sessions will reset").
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
  /** The Conversation State active when this message was produced. */
  state: ConversationState;
};

export type PracticeStoreState = {
  conversationState: ConversationState;
  messages: PracticeMessage[];
  turnRecords: StateTurnRecord[];
  /** How many times the learner has submitted against each active state so far (all verdicts, not just accepted) — used to compute a newly-accepted record's `passedFirstTry`. */
  attemptCounts: Partial<Record<ActiveConversationState, number>>;
};

const STORAGE_KEY = "greeting-somebody:practice";

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value (a fresh literal on every call reads as "always
// changed" and can trigger a render loop). createPersistedStore returns this
// exact reference from its getServerSnapshot. Never mutated in place — every
// update goes through `store.persist`, which always builds a new object.
const INITIAL_STATE: PracticeStoreState = {
  conversationState: "greeting",
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

/** Sanitizes a persisted `attemptCounts` value, dropping anything that isn't a number keyed by a real active state. Never fails the whole deserialize on its own — unlike `turnRecords`, a malformed `attemptCounts` isn't evidence of a pre-issue-#20 shape, so it degrades to "no attempts recorded yet" instead of discarding the rest of the snapshot. */
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
 * Issue #20 (#12's Further Notes: "In-flight practice sessions will
 * reset"): `turnRecords` is the one field that must be present and
 * well-shaped for this snapshot to be trusted at all — its absence (the old
 * `highlightKeys` shape) or corruption is treated as "no saved state"
 * rather than a partial-recovery case, discarding the whole snapshot
 * (falling back to `INITIAL_STATE`, same as a JSON.parse failure) instead
 * of crashing or silently mixing old and new shapes.
 */
/** Exported for practice-state.test.ts's discard-safely coverage (the persisted-store factory's own `serialize`/`deserialize` contract is otherwise private per store). */
export function deserialize(raw: string): PracticeStoreState {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return INITIAL_STATE;
  const p = parsed as Record<string, unknown>;

  if (!Array.isArray(p.turnRecords) || !p.turnRecords.every(isStateTurnRecord)) {
    return INITIAL_STATE;
  }

  const conversationState = isConversationState(p.conversationState)
    ? p.conversationState
    : INITIAL_STATE.conversationState;
  const messages = Array.isArray(p.messages) ? p.messages.filter(isPracticeMessage) : [];
  const turnRecords = p.turnRecords;
  const attemptCounts = sanitizeAttemptCounts(p.attemptCounts);
  return { conversationState, messages, turnRecords, attemptCounts };
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
 * the same persist call — only `recordTurnResult` needs this, to advance
 * `conversationState`/`turnRecords`/`attemptCounts` alongside appending
 * Emily's reply. Everything else distinct about each caller
 * (ensureOpeningMessage's no-op guard when messages already exist,
 * recordTurnResult's `nextConversationState` call) stays in the caller, not
 * here.
 */
function appendMessage(
  current: PracticeStoreState,
  input: { role: PracticeMessage["role"]; textEn: string; textZh: string; state: ConversationState },
  stateOverrides: Partial<Pick<PracticeStoreState, "conversationState" | "turnRecords" | "attemptCounts">> = {},
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
    state: current.conversationState,
  });
}

/** Appends the learner's echoed input as a message in the current state, ahead of grading. */
export function appendLearnerMessage(text: string): void {
  const current = store.getSnapshot();
  appendMessage(current, {
    role: "learner",
    textEn: text,
    textZh: "",
    state: current.conversationState,
  });
}

/**
 * Records the server's structured result for the just-submitted learner
 * turn: advances (or holds) `conversationState` via the pure state machine,
 * appends Emily's reply as a message tagged with the state the turn was
 * judged against, bumps that state's attempt count, and — only when the
 * turn was accepted — appends a `StateTurnRecord` for `priorState` to
 * `turnRecords` (issue #20; see src/lib/turn-record.ts). A `needs_retry`
 * turn still bumps `attemptCounts` (so a later accepted attempt in the same
 * state can correctly compute `passedFirstTry: false`) but never itself
 * contributes a record — only an accepted state produces a highlight
 * candidate.
 *
 * `matchedAcceptedResponse` and `learnerAskedBack` are passed straight
 * through from the caller (practice-page-content.tsx), which already has
 * both: the former from comparing the learner's raw text against
 * `Lesson.script[priorState].acceptedResponses`
 * (src/lib/turn-record.ts's `matchesAcceptedResponse`), the latter from the
 * Judge's `learner_asked_back`. This module stays ignorant of `Lesson`
 * content — it only assembles the record, it doesn't compute any part of
 * it.
 *
 * Returns the resulting ConversationState so the caller can act on it (e.g.
 * know immediately that the conversation just completed) without waiting on
 * a re-render.
 */
export function recordTurnResult(input: {
  priorState: ActiveConversationState;
  verdict: Verdict;
  replyEn: string;
  replyZh: string;
  matchedAcceptedResponse: boolean;
  learnerAskedBack: boolean;
}): ConversationState {
  const current = store.getSnapshot();
  const resultingState = nextConversationState(input.priorState, input.verdict);

  const priorAttempts = current.attemptCounts[input.priorState] ?? 0;
  const attempts = priorAttempts + 1;
  const attemptCounts = { ...current.attemptCounts, [input.priorState]: attempts };

  const turnRecords =
    input.verdict === "accepted"
      ? [
          ...current.turnRecords,
          {
            state: input.priorState,
            passedFirstTry: attempts === 1,
            matchedAcceptedResponse: input.matchedAcceptedResponse,
            learnerAskedBack: input.learnerAskedBack,
          } satisfies StateTurnRecord,
        ]
      : current.turnRecords;

  appendMessage(
    current,
    { role: "emily", textEn: input.replyEn, textZh: input.replyZh, state: input.priorState },
    { conversationState: resultingState, turnRecords, attemptCounts },
  );
  return resultingState;
}

/**
 * Appends an Emily message without touching `conversationState` or
 * `turnRecords` — for support features that must never transition the
 * conversation (ticket 10's silence-timeout nudge; spec.md user story 62:
 * "20 秒没说话时 Emily 只轻轻推一下、不催也不给答案"). Unlike
 * `recordTurnResult`, this never calls `nextConversationState` — the learner
 * hasn't submitted a turn to grade, so there is nothing to advance. Takes a
 * single `SupportNudge`-shaped object (rather than two positional `en`/`zh`
 * strings) so call sites can pass a nudge value straight through.
 */
export function appendSupportMessage(input: SupportNudge): void {
  const current = store.getSnapshot();
  appendMessage(current, {
    role: "emily",
    textEn: input.en,
    textZh: input.zh,
    state: current.conversationState,
  });
}

/** Clears the conversation back to a clean start — ticket 11's Retry button will call this. */
export function resetPractice(): void {
  store.persist({ conversationState: "greeting", messages: [], turnRecords: [], attemptCounts: {} });
}

/**
 * React hook: subscribes to the practice store and re-renders on change.
 * `getServerSnapshot` returns the fixed empty/initial state so server render
 * and the first client hydration pass agree (no hydration mismatch); React
 * then swaps in the real localStorage-backed value immediately after
 * hydrating, same pattern as src/lib/progress.ts's `useProgress`.
 */
export function usePractice() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return {
    conversationState: state.conversationState,
    messages: state.messages,
    turnRecords: state.turnRecords,
    isComplete: state.conversationState === "complete",
    ensureOpeningMessage,
    appendLearnerMessage,
    recordTurnResult,
    appendSupportMessage,
    resetPractice,
  };
}

export { ACTIVE_CONVERSATION_STATES };
