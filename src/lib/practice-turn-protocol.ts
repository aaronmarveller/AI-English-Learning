import { VERDICTS, type Verdict } from "@/lib/conversation-state-machine";

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
 * Issue #16 (docs/ai-configuration.md; ADR-0005): the model's structured
 * output shrinks to exactly two fields. `reply_en`, `reply_zh`, and
 * `highlight_key` are gone — Emily no longer improvises a reply; the client
 * selects her line at random from the current Lesson's Conversation Script
 * pool (src/content/lesson.ts, src/lib/emily-reply-selector.ts). The model's
 * only remaining job is judging communicative intent (`verdict`) and
 * detecting whether the learner asked a question back
 * (`learner_asked_back`), which src/lib/emily-reply-selector.ts uses to pick
 * between the Response state's two sub-pools.
 */

/** One prior turn of conversation history, as sent to (and echoed back by) the judge. */
export type HistoryTurn = { role: "user" | "assistant"; content: string };

/**
 * The judge's structured verdict on one learner turn (issue #16: exactly two
 * fields — see this file's top doc comment).
 */
export type TurnResult = {
  verdict: Verdict;
  /** Whether the learner's message asked Emily a question back (e.g. "How about you?"). */
  learner_asked_back: boolean;
};

/** Runtime shape check for a parsed `TurnResult` — used to validate both the model's tool-call output and incoming SSE `final` events. */
export function isTurnResult(value: unknown): value is TurnResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.verdict === "string" &&
    (VERDICTS as readonly string[]).includes(v.verdict) &&
    typeof v.learner_asked_back === "boolean"
  );
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
