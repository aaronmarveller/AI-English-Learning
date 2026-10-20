import type { CallLine } from "@/lib/call-engine";
import { isSupportedLearnerText } from "@/lib/supported-language";

/**
 * The Practice rules (CONTEXT.md "Practice", "Call"), pure: no browser APIs, no
 * React, no client-only directive, so the client and the server can share them.
 *
 * A Practice allows at most {@link MAX_CALLS} Calls. A Call counts the moment
 * it connects ({@link startCall}), even if the learner says nothing; only
 * {@link startOver} grants three again — a reload never does.
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

// --- Learner lines --------------------------------------------------------

/** Whether a line is the learner's own, in English or Chinese. */
export function isLearnerLine(line: Pick<CallLine, "role" | "text">): boolean {
  return line.role === "learner" && isSupportedLearnerText(line.text);
}

/** Everything the learner said in English or Chinese across the Calls, trimmed, in order. */
export function learnerLinesOf(calls: readonly { lines: readonly CallLine[] }[]): string[] {
  return calls.flatMap((call) => call.lines.filter(isLearnerLine).map((l) => l.text.trim()));
}

// --- Derived values -------------------------------------------------------

/** Practice is complete once a Call has ended in which the learner said a line in English or Chinese. */
export function isPracticeComplete(state: PracticeState): boolean {
  return state.calls.some((call) => call.ended && call.lines.some(isLearnerLine));
}

/** Which Call to show: the live Call's number, or the next one's; never above the cap or below one. */
export function callNumber(state: PracticeState, live: boolean): number {
  const used = state.calls.length;
  return live ? Math.min(Math.max(used, 1), MAX_CALLS) : Math.min(used + 1, MAX_CALLS);
}

/** The Learning Summary can be viewed once Practice is complete and no recorded Call is still un-ended. */
export function canViewLearningSummary(state: PracticeState): boolean {
  return isPracticeComplete(state) && state.calls.every((c) => c.ended);
}

// --- Transitions ----------------------------------------------------------

/** Whether another Call may still start. */
export function canStartCall(state: PracticeState): boolean {
  return state.calls.length < MAX_CALLS;
}

/** Records a connected Call; null (a refusal) when the cap is reached. */
export function startCall(state: PracticeState, id: string): PracticeState | null {
  if (!canStartCall(state)) return null;
  return { calls: [...state.calls, { id, lines: [], ended: false }] };
}

function updateCall(state: PracticeState, id: string, update: (call: CallRecord) => CallRecord): PracticeState {
  if (!state.calls.some((c) => c.id === id)) return state;
  return { calls: state.calls.map((c) => (c.id === id ? update(c) : c)) };
}

/** Replaces the Call's lines as the bubbles change. */
export function replaceCallLines(state: PracticeState, id: string, lines: readonly CallLine[]): PracticeState {
  return updateCall(state, id, (call) => ({ ...call, lines: [...lines] }));
}

/** Marks the Call as over, keeping only lines that carry text. */
export function endCall(state: PracticeState, id: string, lines: readonly CallLine[]): PracticeState {
  return updateCall(state, id, (call) => ({ ...call, lines: lines.filter((l) => l.text !== ""), ended: true }));
}

/** Practice over from Review: three Calls again, no transcripts. */
export function startOver(): PracticeState {
  return { calls: [] };
}

// --- Loading persisted state ---------------------------------------------

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

/**
 * Turns persisted text into Practice state. The retired scripted-Practice shape
 * (no well-shaped `calls` array) and malformed input yield empty state; Calls
 * beyond the cap are dropped; a Call found un-ended was cut off by a reload or
 * by leaving the page, so it is over, keeping what was already said.
 */
export function loadPractice(raw: string): PracticeState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return startOver();
  }
  if (typeof parsed !== "object" || parsed === null) return startOver();
  const calls = (parsed as Record<string, unknown>).calls;
  if (!Array.isArray(calls) || !calls.every(isCallRecord)) return startOver();
  return {
    calls: calls.slice(0, MAX_CALLS).map((c) =>
      c.ended ? c : { ...c, lines: c.lines.filter((l) => l.text !== ""), ended: true },
    ),
  };
}
