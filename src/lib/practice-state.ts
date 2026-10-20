"use client";

import { useSyncExternalStore } from "react";
import type { CallLine } from "@/lib/call-engine";
import { createPersistedStore } from "@/lib/create-persisted-store";
import { isSupportedLearnerText } from "@/lib/supported-language";

/**
 * Practice store: the Calls the learner has made, and what was said in them
 * (CONTEXT.md "Practice", "Call"). Built on the shared
 * useSyncExternalStore + localStorage factory, so a reload restores both the
 * Call count and every Call's transcript.
 *
 * A Practice allows at most {@link MAX_CALLS} Calls. A Call counts the moment
 * it connects (`startCall`), even if the learner says nothing; only
 * `resetPractice` (Review's 重练) grants three again — a reload never does.
 *
 * Snapshots in the retired scripted-Practice shape (no `calls` array) are
 * discarded on load, following the issue #20 precedent.
 */

export const MAX_CALLS = 3;

export type CallRecord = {
  id: string;
  lines: CallLine[];
  /** False while the Call is live; a Call found un-ended on load was cut off by a reload. */
  ended: boolean;
};

export type PracticeState = {
  calls: CallRecord[];
};

const STORAGE_KEY = "greeting-somebody:practice";

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value. Never mutated in place.
const INITIAL_STATE: PracticeState = { calls: [] };

function isCallLine(value: unknown): value is CallLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.role === "learner" || v.role === "emily") &&
    typeof v.text === "string"
  );
}

function isCallRecord(value: unknown): value is CallRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.ended === "boolean" &&
    Array.isArray(v.lines) &&
    v.lines.every(isCallLine)
  );
}

/** Exported for practice-state.test.ts. A snapshot without a well-shaped `calls` array is treated as "no saved state". */
export function deserialize(raw: string): PracticeState {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return INITIAL_STATE;
  const calls = (parsed as Record<string, unknown>).calls;
  if (!Array.isArray(calls) || !calls.every(isCallRecord)) return INITIAL_STATE;
  return { calls: calls.slice(0, MAX_CALLS) };
}

function serialize(state: PracticeState): string {
  return JSON.stringify(state);
}

const store = createPersistedStore<PracticeState>({
  storageKey: STORAGE_KEY,
  initialState: INITIAL_STATE,
  serialize,
  deserialize,
});

// --- Derived values -------------------------------------------------------

/** How many of the three Calls have been used. */
export function callsUsed(state: PracticeState): number {
  return state.calls.length;
}

export function canStartCall(state: PracticeState): boolean {
  return state.calls.length < MAX_CALLS;
}

/** The latest Call, whose Turns the bubbles show. */
export function latestCall(state: PracticeState): CallRecord | null {
  return state.calls[state.calls.length - 1] ?? null;
}

function saidSomethingSupported(call: CallRecord): boolean {
  return call.lines.some((l) => l.role === "learner" && isSupportedLearnerText(l.text));
}

/** Practice is complete once a Call has ended in which the learner said a line in English or Chinese. */
export function isPracticeComplete(state: PracticeState): boolean {
  return state.calls.some((call) => call.ended && saidSomethingSupported(call));
}

/** Everything the learner said in English or Chinese across all Calls, in order. */
export function learnerLinesOf(state: PracticeState): string[] {
  return state.calls.flatMap((call) =>
    call.lines.filter((l) => l.role === "learner" && isSupportedLearnerText(l.text)).map((l) => l.text.trim()),
  );
}

// --- Actions --------------------------------------------------------------

let callIdCounter = 0;

/** Records a connected Call and returns its id, or null when all three are used. */
export function startCall(): string | null {
  const state = store.getSnapshot();
  if (!canStartCall(state)) return null;
  callIdCounter += 1;
  const id = `call-${Date.now()}-${callIdCounter}`;
  store.persist({ calls: [...state.calls, { id, lines: [], ended: false }] });
  return id;
}

function updateCall(id: string, update: (call: CallRecord) => CallRecord): void {
  const state = store.getSnapshot();
  if (!state.calls.some((c) => c.id === id)) return;
  store.persist({ calls: state.calls.map((c) => (c.id === id ? update(c) : c)) });
}

/** Saves the Call's bubbles as they change. */
export function updateCallLines(id: string, lines: readonly CallLine[]): void {
  updateCall(id, (call) => ({ ...call, lines: [...lines] }));
}

/** Marks the Call as over, keeping only bubbles that carry text. */
export function endCall(id: string, lines: readonly CallLine[]): void {
  updateCall(id, (call) => ({ ...call, lines: lines.filter((l) => l.text !== ""), ended: true }));
}

/**
 * A reload (or leaving the page) mid-Call kills the connection; a Call found
 * un-ended is over, with whatever was already transcribed.
 */
export function settleInterruptedCalls(): void {
  const state = store.getSnapshot();
  if (state.calls.every((c) => c.ended)) return;
  store.persist({
    calls: state.calls.map((c) =>
      c.ended ? c : { ...c, lines: c.lines.filter((l) => l.text !== ""), ended: true },
    ),
  });
}

/** Starts Practice over from Review: three Calls again, no transcripts. */
export function resetPractice(): void {
  store.persist(INITIAL_STATE);
}

export function usePractice() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return {
    state,
    calls: state.calls,
    callsUsed: callsUsed(state),
    canStartCall: canStartCall(state),
    latestCall: latestCall(state),
    isComplete: isPracticeComplete(state),
    learnerLines: learnerLinesOf(state),
  };
}
