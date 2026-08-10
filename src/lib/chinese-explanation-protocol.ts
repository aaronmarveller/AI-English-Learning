import { isActiveConversationState, type ActiveConversationState } from "@/lib/conversation-state-machine";

/**
 * Chinese-explanation wire protocol (issue #19; docs/ai-configuration.md
 * section 6 "Chinese Help Rules"; issue #12's "Chinese help becomes a mode,
 * with its own seam").
 *
 * This is a SEPARATE protocol from practice-turn-protocol.ts, deliberately.
 * The parent epic (#12) is explicit that the Chinese explanation seam must
 * share NO wire vocabulary with the Judge: "It is a separate seam because
 * the two calls share nothing: different inputs, different outputs,
 * different failure handling. Folding it into the Judge would turn the
 * shared wire vocabulary into a mode-discriminated union both sides must
 * destructure, and would broaden the Judge from 'produces the Verdict' to
 * 'sometimes produces a Verdict'." So this file imports nothing from
 * practice-turn-protocol.ts, and defines its own request/response shapes
 * from scratch — even though `ActiveConversationState` is shared with the
 * Judge's contract (that type lives on the Conversation State Machine, not
 * on either protocol).
 *
 * Zero-dependency on `@anthropic-ai/sdk`, same reasoning as
 * practice-turn-protocol.ts: `explainInChinese` (src/lib/chinese-explanation.ts,
 * server-only) and `askChineseQuestion` (src/lib/ask-chinese-question.ts,
 * client-only) are the symmetric deep modules either side of this seam, and
 * this file is the only thing both of them import.
 */

/**
 * Request: the learner's Chinese follow-up question, and the current
 * Conversation State so the model can ground its answer in what's actually
 * happening in the lesson right now (docs/ai-configuration.md section 6:
 * "answered by the model through a separate seam from the Judge").
 */
export type ChineseExplanationRequest = {
  state: ActiveConversationState;
  question: string;
};

/**
 * Response: free Chinese text, not a structured Verdict — the Note in
 * issue #19 / the Further Notes in issue #12 are explicit that this
 * response has NO answer-leak protection (a server-side check rejecting
 * verbatim Accepted Response quotes was proposed and declined), so this
 * type stays exactly one field, with no extra flags implying a guarantee
 * that isn't actually being made.
 */
export type ChineseExplanationResponse = {
  answerZh: string;
};

/** Runtime shape check for a parsed `ChineseExplanationRequest` — used by the route to validate the incoming body. */
export function isChineseExplanationRequest(value: unknown): value is ChineseExplanationRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isActiveConversationState(v.state) &&
    typeof v.question === "string" &&
    v.question.trim().length > 0
  );
}

/** Runtime shape check for a parsed `ChineseExplanationResponse` — used by the client to validate the route's JSON body. */
export function isChineseExplanationResponse(value: unknown): value is ChineseExplanationResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.answerZh === "string" && v.answerZh.trim().length > 0;
}
