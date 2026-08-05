import { VERDICTS, type Verdict } from "@/lib/conversation-state-machine";
import { HIGHLIGHT_KEYS, type HighlightKey } from "@/content/practice";

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
 * `Verdict`/`VERDICTS` (conversation-state-machine.ts) and
 * `HighlightKey`/`HIGHLIGHT_KEYS` (content/practice.ts) are safe imports
 * here — neither pulls in the SDK, directly or transitively.
 */

/** One prior turn of conversation history, as sent to (and echoed back by) the judge. */
export type HistoryTurn = { role: "user" | "assistant"; content: string };

/** The judge's structured verdict on one learner turn. */
export type TurnResult = {
  verdict: Verdict;
  reply_en: string;
  reply_zh: string;
  highlight_key: HighlightKey;
};

/** Runtime shape check for a parsed `TurnResult` — used to validate both the model's tool-call output and incoming SSE `final` events. */
export function isTurnResult(value: unknown): value is TurnResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.verdict === "string" &&
    (VERDICTS as readonly string[]).includes(v.verdict) &&
    typeof v.reply_en === "string" &&
    typeof v.reply_zh === "string" &&
    typeof v.highlight_key === "string" &&
    (HIGHLIGHT_KEYS as readonly string[]).includes(v.highlight_key)
  );
}

/**
 * The SSE wire contract src/app/api/practice/turn/route.ts streams to the
 * client (issue #5) — defined once here, next to `TurnResult`, so the route
 * and the client both import this single shape instead of each hand-writing
 * their own copy and risking silent protocol drift between them.
 */
export type PracticeTurnFinalEvent = { type: "final" } & TurnResult;

export type PracticeTurnStreamEvent =
  | PracticeTurnFinalEvent
  | { type: "partial"; reply_en: string }
  | { type: "error"; error: string };

/** Validates a parsed SSE payload against the `PracticeTurnStreamEvent` contract above. */
export function isPracticeTurnStreamEvent(value: unknown): value is PracticeTurnStreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === "partial") return typeof v.reply_en === "string";
  if (v.type === "error") return typeof v.error === "string";
  if (v.type === "final") return isTurnResult(v);
  return false;
}
