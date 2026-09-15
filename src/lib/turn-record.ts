import {
  isActiveConversationState,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";

/**
 * Per-Conversation-Goal record the client builds itself (issue #20;
 * see #12's "Learning Summary inputs are derived, not reported"). Replaces
 * the model-reported `highlight_key` (gone since issue #16) as the input to
 * Learning Summary selection (src/lib/feedback-selector.ts).
 *
 * One record is appended per Goal a Turn *achieved*, in canonical order
 * (issue #51; ADR-0012's Consequences on this type's grain — #47 and #20
 * appended exactly one, for the Focus Goal, which is the same thing only
 * while a Turn can achieve no more than one). A Goal that never gets achieved
 * (an abandoned mid-conversation session) never contributes a record, and an
 * achieved Goal is never open again, so no Goal ever contributes two — which
 * is what lets Overall's "completed all four Goals" guarantee
 * (src/lib/feedback-selector.ts) be computed as simply "one record per active
 * Goal exists", whatever order they arrived in.
 */
export type StateTurnRecord = {
  /** Which Conversation Goal this record is for. */
  state: ActiveConversationState;
  /** Whether this Goal was achieved on the learner's very first attempt against it. Attempts are counted against the Focus Goal only (ADR-0012), so a Goal achieved while it was *not* the Focus Goal is always `true`, and the Focus Goal's own record reflects its prior `needs_retry` Turns. */
  passedFirstTry: boolean;
  /** Whether the learner's accepted message matched (case/punctuation-insensitively) one of this Goal's `acceptedResponses` verbatim, rather than a natural paraphrase outside that list. Whole-sentence: a message that achieved several Goals matched none of them. */
  matchedAcceptedResponse: boolean;
  /** Whether the learner's message asked Emily a question back (the Judge's `learner_asked_back`). Only recorded on the `response` Goal's record — that is the Goal the question-back rule belongs to (issue #51). */
  learnerAskedBack: boolean;
};

/** Runtime shape check — used by practice-state.ts's `deserialize` to validate persisted data before trusting it. */
export function isStateTurnRecord(value: unknown): value is StateTurnRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isActiveConversationState(v.state) &&
    typeof v.passedFirstTry === "boolean" &&
    typeof v.matchedAcceptedResponse === "boolean" &&
    typeof v.learnerAskedBack === "boolean"
  );
}

/**
 * Normalizes trailing punctuation and case before comparing — "Hi." and "hi"
 * should both match the Accepted Response "Hi." — then checks for an exact
 * match against `acceptedResponses`. Deliberately exact-match, not
 * substring: a learner's much longer natural sentence that happens to
 * contain an Accepted Response as a fragment did not "match" it, they
 * paraphrased around it.
 */
export function matchesAcceptedResponse(learnerText: string, acceptedResponses: readonly string[]): boolean {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/[.!?]+$/, "");
  const normalizedLearnerText = normalize(learnerText);
  return acceptedResponses.some((phrase) => normalize(phrase) === normalizedLearnerText);
}
