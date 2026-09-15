import type { ActiveConversationState } from "@/lib/conversation-state-machine";

/**
 * Practice turn wire protocol: the shapes that cross the client/server
 * boundary for one Practice conversation turn. `judgeTurn`
 * (src/lib/practice-judge.ts, server-only, imports `@anthropic-ai/sdk`) and
 * `submitPracticeTurn` (src/lib/submit-practice-turn.ts, client-only) are
 * symmetric deep modules either side of that boundary, and this file is the
 * only thing both of them import — so it must stay zero-dependency. Nothing
 * here may import `@anthropic-ai/sdk`, or anything that itself imports it:
 * that SDK is a ~171KB client bundle the /practice page has no business
 * shipping, and this module is the seam that keeps it from leaking across.
 *
 * Issue #47 (ADR-0012; docs/ai-configuration.md section 4): the wire contract
 * is set-shaped now, in both directions, in its final form. Up, the Judge
 * request carries Goal Progress — the set of Conversation Goals achieved so
 * far, instead of one Conversation State. Down, the model's structured output
 * is a **Goal Report** over the open Goals plus `learner_asked_back`; it no
 * longer carries a `verdict` at all, because the Verdict is derived from that
 * report on the client (src/lib/goal-progress.ts's `deriveVerdict`). What the
 * model is asked has changed; what it is *for* has not — Emily's line
 * selection stays client-side (src/lib/emily-reply-selector.ts), now keyed
 * off the Focus Goal rather than a state pointer.
 */

/** One prior turn of conversation history, as sent to (and echoed back by) the judge. */
export type HistoryTurn = { role: "user" | "assistant"; content: string };

/**
 * What the Judge reports about one still-open Conversation Goal
 * (docs/ai-configuration.md section 4's Goal Report table; CONTEXT.md "Goal
 * Report"): the learner's message `achieved` it, `failed` it (recognisably
 * attempted its intent without communicating it), or left it `untouched`.
 * Unrelated chatter is `untouched`, never `failed`; grammar alone never makes
 * an attempt `failed`.
 */
export const GOAL_REPORT_VALUES = ["achieved", "failed", "untouched"] as const;
export type GoalReportValue = (typeof GOAL_REPORT_VALUES)[number];

/**
 * The Judge's structured output for one learner Turn: one entry per open
 * Conversation Goal, in the final three-state shape (ADR-0012). A Goal
 * already in Goal Progress is never asked about, so a report never
 * re-credits one; that is the Judge's instruction, not this type's job to
 * enforce — see `isGoalReport` below.
 */
export type GoalReport = Partial<Record<ActiveConversationState, GoalReportValue>>;

/**
 * Runtime shape check for a parsed `GoalReport` — used to validate both the
 * model's tool-call output and incoming SSE `final` events.
 *
 * Deliberately checks the *values* only, never the keys: ADR-0012 requires a
 * report key outside the open Goals to be "dropped silently on the client
 * (logged server-side), never treated as invalid model output", so a
 * three-state value under an unexpected key is not model misbehaviour and
 * must not fail the Turn. Only a value that is none of
 * `achieved`/`failed`/`untouched` is. (Which keys are unexpected is decided
 * against Goal Progress by src/lib/goal-progress.ts's
 * `unexpectedGoalReportKeys`, since this validator has no Goal Progress to
 * compare against.)
 */
export function isGoalReport(value: unknown): value is GoalReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) => typeof entry === "string" && (GOAL_REPORT_VALUES as readonly string[]).includes(entry),
  );
}

/**
 * The judge's structured output for one learner turn (issue #47: exactly two
 * fields — see this file's top doc comment). `goal_report` is keyed by
 * Conversation Goal; the four Goals kept their identifiers, but they are no
 * longer a sequence a conversation advances through.
 */
export type TurnResult = {
  goal_report: GoalReport;
  /** Whether the learner's message asked Emily a question back (e.g. "How about you?"). */
  learner_asked_back: boolean;
};

/** Runtime shape check for a parsed `TurnResult`. */
export function isTurnResult(value: unknown): value is TurnResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isGoalReport(v.goal_report) && typeof v.learner_asked_back === "boolean";
}

/**
 * The SSE wire contract src/app/api/practice/turn/route.ts streams to the
 * client (issue #5) — defined once here, next to `TurnResult`, so the route
 * and the client both import this single shape instead of each hand-writing
 * their own copy and risking silent protocol drift between them.
 *
 * Issue #16: the streamed partial-reply mechanism is gone. There is no
 * model-authored text left to stream — the stream stays as transport
 * (`final` still arrives as an SSE event, same as before), but `partial` is
 * deleted along with `reply_en`.
 */
export type PracticeTurnFinalEvent = { type: "final" } & TurnResult;

export type PracticeTurnStreamEvent =
  | PracticeTurnFinalEvent
  | { type: "error"; error: string };

/** Validates a parsed SSE payload against the `PracticeTurnStreamEvent` contract above. */
export function isPracticeTurnStreamEvent(value: unknown): value is PracticeTurnStreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === "error") return typeof v.error === "string";
  if (v.type === "final") return isTurnResult(v);
  return false;
}
