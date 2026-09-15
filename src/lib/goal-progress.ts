/**
 * Goal Progress algebra (issue #47; ADR-0012;
 * docs/adr/0012-flexible-goal-tracking-replaces-the-linear-state-machine.md).
 * Pure functions only — same discipline as
 * src/lib/conversation-state-machine.ts: no React, no localStorage, no fetch.
 *
 * ADR-0012 replaced that module's linear pointer (`nextConversationState`,
 * deleted by issue #47) with a *set*: the four Conversation Goals the learner
 * must communicate (`ACTIVE_CONVERSATION_STATES`) are no longer a sequence the
 * conversation walks one at a time. The Judge is handed the set of Goals
 * already achieved and returns a Goal Report on the open ones; this module
 * derives everything else the app reads back off those two inputs, exactly
 * where each answer belongs:
 *
 *   - `deriveVerdict` — the Verdict (CONTEXT.md "Verdict"): the Judge never
 *     names one. `accepted` iff at least one open Goal was `achieved` and none
 *     was `failed`; `needs_retry` otherwise. All-or-nothing.
 *   - `applyGoalReport` — how a Turn moves Goal Progress: an `accepted` Turn
 *     adds every Goal its report marked `achieved`, all at once, and a
 *     `needs_retry` Turn saves nothing from its report — not even the Goals
 *     that were right (ADR-0012's deliberate departure from "save completed
 *     goals": a learner should never have to work out which half of their
 *     sentence counted).
 *   - `getFocusGoal` — the first *open* Goal in canonical order, which every
 *     place that used to read "the current state" now reads instead: Emily's
 *     next line, a `needs_retry` line, the silence nudge, and the
 *     Ask-in-Chinese help content. A `support_requested` Turn Outcome never
 *     changes it.
 *
 * Goal Progress can be non-contiguous (there is no rule crediting an earlier
 * Goal because a later one was achieved — ADR-0012's first considered option
 * rejects that), which is why the Focus Goal is defined as "first open Goal"
 * rather than "one past the last achieved one".
 *
 * Issue #47 deliberately fixed the protocol in its final three-state shape
 * without yet using it: nothing here produces a multi-Goal report or a gap
 * (that was #48's one-Goal-per-Turn looseness — a Turn may now achieve
 * several Goals at once and leave earlier ones open). The functions already
 * answer every shape correctly because the shape itself is final — see
 * goal-progress.test.ts. Which *line* a `failed` Goal earns Emily is not a
 * Goal Progress question at all, so it lives with the rest of pool selection
 * (issue #49 — src/lib/emily-reply-selector.ts's `selectRetryPoolGoal`).
 */

import {
  ACTIVE_CONVERSATION_STATES,
  isActiveConversationState,
  type ActiveConversationState,
  type ConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";
import type { GoalReport } from "@/lib/practice-turn-protocol";

/**
 * The set of Conversation Goals achieved so far in this Practice (CONTEXT.md
 * "Goal Progress"). Grows only through `accepted` Turns and never shrinks:
 * an achieved Goal is never asked for again. `applyGoalReport` returns it in
 * canonical order and de-duplicated, so a persisted set serializes and
 * compares deterministically; everything here reads it as a *set*, so an
 * order that came from somewhere else (a hand-seeded snapshot) still works.
 *
 * Never mutated in place — every function here returns a new array.
 */
export type GoalProgress = readonly ActiveConversationState[];

/** Runtime shape check for a `GoalProgress` value — used to validate the Judge request body (src/app/api/practice/turn/route.ts) and persisted store snapshots (src/lib/practice-state.ts's `deserialize`). */
export function isGoalProgress(value: unknown): value is GoalProgress {
  return Array.isArray(value) && value.every(isActiveConversationState);
}

/** The Goals still to achieve, in canonical order. Empty means Practice is complete. */
export function getOpenGoals(progress: GoalProgress): ActiveConversationState[] {
  return ACTIVE_CONVERSATION_STATES.filter((goal) => !progress.includes(goal));
}

/**
 * The Focus Goal (CONTEXT.md): the first open Goal in canonical order — the
 * one Emily's next line steers toward, and the one a `needs_retry` line and
 * the Chinese help content are written for. `null` once every Goal is
 * achieved, i.e. once Practice is complete.
 */
export function getFocusGoal(progress: GoalProgress): ActiveConversationState | null {
  return getOpenGoals(progress)[0] ?? null;
}

/** Whether every Goal is achieved — all four in Goal Progress, in any order, means Practice is complete. */
export function isGoalProgressComplete(progress: GoalProgress): boolean {
  return getOpenGoals(progress).length === 0;
}

/** The Conversation State (CONTEXT.md "Conversation State") Goal Progress derives: the Focus Goal, or `complete` once all four Goals are achieved. */
export function deriveConversationState(progress: GoalProgress): ConversationState {
  return getFocusGoal(progress) ?? "complete";
}

/**
 * Derives the Turn's Verdict from its Goal Report (docs/ai-configuration.md
 * section 4 "Verdict derivation — all-or-nothing"): `accepted` when the report
 * contains at least one `achieved` and no `failed`, `needs_retry` otherwise —
 * including when one Goal was `achieved` and another `failed` in the same
 * message, and including an empty report (the learner touched no open Goal).
 *
 * Only the *open* Goals are considered: a key outside that set (`unexpectedGoalReportKeys`)
 * is ignored, never treated as the model misbehaving.
 */
export function deriveVerdict(progress: GoalProgress, report: GoalReport): Verdict {
  const reported = getOpenGoals(progress).map((goal) => report[goal]);
  const achieved = reported.includes("achieved");
  const failed = reported.includes("failed");
  return achieved && !failed ? "accepted" : "needs_retry";
}

/**
 * Applies a Turn's Goal Report to Goal Progress. Takes the Verdict because
 * that is what makes the all-or-nothing rule unforgettable: an `accepted`
 * Turn adds every open Goal the report marked `achieved`, at once, and every
 * other Turn returns Goal Progress unchanged — even one whose report marked a
 * Goal `achieved` alongside a `failed` one.
 *
 * `verdict` is always `deriveVerdict(progress, report)` for the same pair —
 * taken as a parameter rather than recomputed here so that callers who have
 * already derived it (practice-page-content.tsx needs it to pick Emily's next
 * line before this is recorded) cannot pass a contradicting one by accident.
 */
export function applyGoalReport(
  progress: GoalProgress,
  report: GoalReport,
  verdict: Verdict,
): GoalProgress {
  if (verdict !== "accepted") return progress;
  const newlyAchieved = getOpenGoals(progress).filter((goal) => report[goal] === "achieved");
  if (newlyAchieved.length === 0) return progress;
  // Filtered off the canonical list rather than appended, so the result is
  // both de-duplicated and in canonical order.
  return ACTIVE_CONVERSATION_STATES.filter(
    (goal) => progress.includes(goal) || newlyAchieved.includes(goal),
  );
}

/**
 * The report's keys that aren't open Goals — a Goal that is already achieved,
 * or (if the model misbehaves) a key that names no Goal at all. ADR-0012:
 * "The Judge is only ever asked about open Goals, so a Goal Report never
 * re-credits one already achieved." Every function above silently ignores
 * these; the Judge route (src/app/api/practice/turn/route.ts) calls this to
 * log them, so a drifting model is still visible to whoever is watching the
 * server, without a Turn ever failing over it.
 */
export function unexpectedGoalReportKeys(progress: GoalProgress, report: GoalReport): string[] {
  const openGoals: readonly string[] = getOpenGoals(progress);
  return Object.keys(report).filter((key) => !openGoals.includes(key));
}
