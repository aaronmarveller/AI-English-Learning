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
import type { HighlightKey, OpeningLine } from "@/content/practice";

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
 * doesn't render the full log itself), and the accumulated highlight_key
 * list. It wraps the pure state machine in src/lib/conversation-state-machine.ts
 * — this module is the only place that calls `nextConversationState` and
 * persists the result — but never does the network call itself; the LLM
 * request is the Practice page component's job (see
 * src/components/practice/practice-page-content.tsx), which then reports the
 * result back here via `recordTurnResult`.
 */

export type PracticeMessage = {
  id: string;
  role: "emily" | "learner";
  /** English text — always populated. */
  textEn: string;
  /** Chinese translation. Populated for Emily's messages (from `reply_zh` /
   * the opening line's `zh`); empty string for the learner's own echoed input. */
  textZh: string;
  /** The Conversation State active when this message was produced. */
  state: ConversationState;
};

type PracticeStoreState = {
  conversationState: ConversationState;
  messages: PracticeMessage[];
  highlightKeys: HighlightKey[];
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
  highlightKeys: [],
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

function deserialize(raw: string): PracticeStoreState {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return INITIAL_STATE;
  const p = parsed as Record<string, unknown>;
  const conversationState = isConversationState(p.conversationState)
    ? p.conversationState
    : INITIAL_STATE.conversationState;
  const messages = Array.isArray(p.messages) ? p.messages.filter(isPracticeMessage) : [];
  const highlightKeys = Array.isArray(p.highlightKeys)
    ? p.highlightKeys.filter((k): k is HighlightKey => typeof k === "string")
    : [];
  return { conversationState, messages, highlightKeys };
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
 * Appends Emily's opening line as the very first message, if the transcript
 * is still empty. No-op otherwise — safe to call unconditionally on every
 * mount (fresh start picks a line; a resumed/refreshed session keeps
 * whichever line was already shown, since it's already message #1).
 */
export function ensureOpeningMessage(line: OpeningLine): void {
  const current = store.getSnapshot();
  if (current.messages.length > 0) return;
  const message: PracticeMessage = {
    id: nextMessageId(),
    role: "emily",
    textEn: line.en,
    textZh: line.zh,
    state: current.conversationState,
  };
  store.persist({ ...current, messages: [message] });
}

/** Appends the learner's echoed input as a message in the current state, ahead of grading. */
export function appendLearnerMessage(text: string): void {
  const current = store.getSnapshot();
  const message: PracticeMessage = {
    id: nextMessageId(),
    role: "learner",
    textEn: text,
    textZh: "",
    state: current.conversationState,
  };
  store.persist({ ...current, messages: [...current.messages, message] });
}

/**
 * Records the server's structured result for the just-submitted learner
 * turn: advances (or holds) `conversationState` via the pure state machine,
 * appends Emily's reply as a message tagged with the state the turn was
 * judged against, and accumulates `highlightKey`. Returns the resulting
 * ConversationState so the caller can act on it (e.g. know immediately that
 * the conversation just completed) without waiting on a re-render.
 */
export function recordTurnResult(input: {
  priorState: ActiveConversationState;
  verdict: Verdict;
  replyEn: string;
  replyZh: string;
  highlightKey: HighlightKey;
}): ConversationState {
  const current = store.getSnapshot();
  const resultingState = nextConversationState(input.priorState, input.verdict);
  const message: PracticeMessage = {
    id: nextMessageId(),
    role: "emily",
    textEn: input.replyEn,
    textZh: input.replyZh,
    state: input.priorState,
  };
  store.persist({
    conversationState: resultingState,
    messages: [...current.messages, message],
    highlightKeys: [...current.highlightKeys, input.highlightKey],
  });
  return resultingState;
}

/**
 * Appends an Emily message without touching `conversationState` or
 * `highlightKeys` — for support features that must never transition the
 * conversation (ticket 10's silence-timeout nudge; spec.md user story 62:
 * "20 秒没说话时 Emily 只轻轻推一下、不催也不给答案"). Unlike
 * `recordTurnResult`, this never calls `nextConversationState` — the learner
 * hasn't submitted a turn to grade, so there is nothing to advance.
 */
export function appendSupportMessage(en: string, zh: string): void {
  const current = store.getSnapshot();
  const message: PracticeMessage = {
    id: nextMessageId(),
    role: "emily",
    textEn: en,
    textZh: zh,
    state: current.conversationState,
  };
  store.persist({ ...current, messages: [...current.messages, message] });
}

/** Clears the conversation back to a clean start — ticket 11's Retry button will call this. */
export function resetPractice(): void {
  store.persist({ conversationState: "greeting", messages: [], highlightKeys: [] });
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
    highlightKeys: state.highlightKeys,
    isComplete: state.conversationState === "complete",
    ensureOpeningMessage,
    appendLearnerMessage,
    recordTurnResult,
    appendSupportMessage,
    resetPractice,
  };
}

export { ACTIVE_CONVERSATION_STATES };
