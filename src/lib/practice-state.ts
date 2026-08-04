"use client";

import { useSyncExternalStore } from "react";
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
 * Practice conversation store (ticket 08) — same hand-rolled
 * useSyncExternalStore + localStorage pattern as src/lib/progress.ts, under
 * its own distinct storage key so it never collides with the Learning Flow
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

function readFromStorage(): PracticeStoreState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
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
  } catch {
    // Corrupt or inaccessible storage (e.g. private browsing) — fall back
    // to a clean slate rather than throwing.
    return INITIAL_STATE;
  }
}

function writeToStorage(state: PracticeStoreState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore write failures (storage full / disabled) — the conversation
    // just won't survive a refresh in that case.
  }
}

// --- Module-level store -----------------------------------------------

let snapshot: PracticeStoreState = INITIAL_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  snapshot = readFromStorage();
  hydrated = true;
}

function emit() {
  for (const listener of listeners) listener();
}

function persist(next: PracticeStoreState) {
  snapshot = next;
  writeToStorage(next);
  emit();
}

function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PracticeStoreState {
  ensureHydrated();
  return snapshot;
}

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value (a fresh literal on every call reads as "always
// changed" and can trigger a render loop). INITIAL_STATE is never mutated —
// every update goes through `persist`, which always builds a new object.
function getServerSnapshot(): PracticeStoreState {
  return INITIAL_STATE;
}

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
  ensureHydrated();
  if (snapshot.messages.length > 0) return;
  const message: PracticeMessage = {
    id: nextMessageId(),
    role: "emily",
    textEn: line.en,
    textZh: line.zh,
    state: snapshot.conversationState,
  };
  persist({ ...snapshot, messages: [message] });
}

/** Appends the learner's echoed input as a message in the current state, ahead of grading. */
export function appendLearnerMessage(text: string): void {
  ensureHydrated();
  const message: PracticeMessage = {
    id: nextMessageId(),
    role: "learner",
    textEn: text,
    textZh: "",
    state: snapshot.conversationState,
  };
  persist({ ...snapshot, messages: [...snapshot.messages, message] });
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
  ensureHydrated();
  const resultingState = nextConversationState(input.priorState, input.verdict);
  const message: PracticeMessage = {
    id: nextMessageId(),
    role: "emily",
    textEn: input.replyEn,
    textZh: input.replyZh,
    state: input.priorState,
  };
  persist({
    conversationState: resultingState,
    messages: [...snapshot.messages, message],
    highlightKeys: [...snapshot.highlightKeys, input.highlightKey],
  });
  return resultingState;
}

/** Clears the conversation back to a clean start — ticket 11's Retry button will call this. */
export function resetPractice(): void {
  ensureHydrated();
  persist({ conversationState: "greeting", messages: [], highlightKeys: [] });
}

/**
 * React hook: subscribes to the practice store and re-renders on change.
 * `getServerSnapshot` returns the fixed empty/initial state so server render
 * and the first client hydration pass agree (no hydration mismatch); React
 * then swaps in the real localStorage-backed value immediately after
 * hydrating, same pattern as src/lib/progress.ts's `useProgress`.
 */
export function usePractice() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    conversationState: state.conversationState,
    messages: state.messages,
    highlightKeys: state.highlightKeys,
    isComplete: state.conversationState === "complete",
    ensureOpeningMessage,
    appendLearnerMessage,
    recordTurnResult,
    resetPractice,
  };
}

export { ACTIVE_CONVERSATION_STATES };
