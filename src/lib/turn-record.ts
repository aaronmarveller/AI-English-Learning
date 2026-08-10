import {
  isActiveConversationState,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";

/**
 * Per-Conversation-State record the client builds itself (issue #20;
 * see #12's "Learning Summary inputs are derived, not reported"). Replaces
 * the model-reported `highlight_key` (gone since issue #16) as the input to
 * Learning Summary selection (src/lib/feedback-selector.ts).
 *
 * One record is appended per Conversation State the moment that state's turn
 * is judged `accepted` (src/lib/practice-state.ts's `recordTurnResult`) — a
 * state that never gets accepted (an abandoned mid-conversation session)
 * never contributes a record, which is what lets Overall's "completed all
 * four states" guarantee (src/lib/feedback-selector.ts) be computed as
 * simply "one record per active state exists".
 */
export type StateTurnRecord = {
  /** Which Conversation State this record is for. */
  state: ActiveConversationState;
  /** Whether this state was accepted on the learner's very first attempt — no prior `needs_retry` in this same state. */
  passedFirstTry: boolean;
  /** Whether the learner's accepted reply matched (case/punctuation-insensitively) one of this state's `acceptedResponses` verbatim, rather than a natural paraphrase outside that list. */
  matchedAcceptedResponse: boolean;
  /** Whether the learner's message asked Emily a question back (the Judge's `learner_asked_back`, passed straight through). */
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
