import type { ConversationState, ActiveConversationState, Verdict } from "@/lib/conversation-state-machine";
import { nextConversationState } from "@/lib/conversation-state-machine";
import type { Lesson, ScriptLine } from "@/content/lesson";

/**
 * Client-side Conversation Script selection (issue #16;
 * docs/ai-configuration.md section 3; ADR-0005 "verbatim Conversation
 * Script, not model-generated"). This is the module the Judge's shrunken
 * two-field contract (`verdict` + `learner_asked_back` —
 * src/lib/practice-turn-protocol.ts) hands off to: the model no longer says
 * what Emily says, only whether the learner's turn succeeded and whether
 * they asked a question back. Every English line Emily speaks after her
 * opening line is picked here, at random, verbatim, from the current
 * Lesson's fixed pools (src/content/lesson.ts) — never paraphrased, never
 * composed.
 *
 * Deliberately a small, pure, injectable-random module (same discipline as
 * src/lib/feedback-selector.ts) so pool selection is unit-testable without a
 * browser or a model call — see emily-reply-selector.test.ts.
 *
 * Issue #20 (Learning Summary, later) needs "whether the reply matched an
 * Accepted Response" and "whether the learner asked back" as a per-state
 * record. This module doesn't build that record (that's #20's job), but it
 * takes `verdict` and `learnerAskedBack` as plain, un-buried parameters and
 * returns them straight through on `EmilySelectedLine` — a caller building
 * that record later has everything it needs without this module changing.
 */

/** Injectable RNG, defaulting to `Math.random` — see this file's top doc comment. */
export type RandomSource = () => number;

function pickOne<T>(pool: readonly T[], random: RandomSource): T {
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  return pool[index];
}

/**
 * Picks one entry from `pool` at random, excluding `exclude` (by reference
 * equality on `.en`) when the pool has more than one entry to choose from —
 * used by `selectSilenceNudge` so a long pause never repeats the exact same
 * line twice in a row (docs/ai-configuration.md section 3's own rule for
 * this pool; user story 18).
 */
function pickOneExcluding<T extends { en: string }>(
  pool: readonly T[],
  excludeText: string | undefined,
  random: RandomSource,
): T {
  if (pool.length <= 1 || excludeText === undefined) return pickOne(pool, random);
  const candidates = pool.filter((entry) => entry.en !== excludeText);
  if (candidates.length === 0) return pickOne(pool, random);
  return pickOne(candidates, random);
}

export type EmilySelectedLine = {
  /** The Conversation State the store should transition to (mirrors `nextConversationState`). */
  resultingState: ConversationState;
  /** Emily's selected line. */
  line: ScriptLine;
  /** Passed straight through from the caller — see this file's top doc comment on why this is never buried. */
  verdict: Verdict;
  /** Passed straight through from the caller — see this file's top doc comment on why this is never buried. */
  learnerAskedBack: boolean;
};

/**
 * Selects Emily's next line for one judged learner turn.
 *
 * - `needs_retry`: picks from `priorState`'s own 3-line `needsRetryLines`
 *   pool (src/content/lesson.ts) — the conversation stays on `priorState`.
 * - `accepted`: advances to the next Conversation State (via the same pure
 *   `nextConversationState` the store already uses) and picks Emily's line
 *   for the state just entered:
 *     - `checkin` ← `lesson.checkinLines`
 *     - `response` ← `lesson.responseLines.askedBack` if `learnerAskedBack`,
 *       otherwise `lesson.responseLines.didNotAskBack` — this is the whole
 *       reason `learner_asked_back` exists on the wire (issue #16 acceptance
 *       criteria: never thank a learner for a question they didn't ask;
 *       always answer one they did).
 *     - `closing` ← `lesson.closingLines`
 *     - `complete` ← `lesson.completionMessages` (English-only; see that
 *       pool's own doc comment in lesson.ts)
 */
export function selectEmilyLineForTurn(
  lesson: Lesson,
  priorState: ActiveConversationState,
  verdict: Verdict,
  learnerAskedBack: boolean,
  random: RandomSource = Math.random,
): EmilySelectedLine {
  if (verdict === "needs_retry") {
    return {
      resultingState: priorState,
      line: pickOne(lesson.script[priorState].needsRetryLines, random),
      verdict,
      learnerAskedBack,
    };
  }

  const resultingState = nextConversationState(priorState, verdict);
  const line = selectLineForEnteringState(lesson, resultingState, learnerAskedBack, random);
  return { resultingState, line, verdict, learnerAskedBack };
}

function selectLineForEnteringState(
  lesson: Lesson,
  state: ConversationState,
  learnerAskedBack: boolean,
  random: RandomSource,
): ScriptLine {
  switch (state) {
    case "checkin":
      return pickOne(lesson.checkinLines, random);
    case "response":
      return pickOne(
        learnerAskedBack ? lesson.responseLines.askedBack : lesson.responseLines.didNotAskBack,
        random,
      );
    case "closing":
      return pickOne(lesson.closingLines, random);
    case "complete":
      return { en: pickOne(lesson.completionMessages, random), zh: "" };
    case "greeting":
    default:
      // `state` here is always the result of an "accepted" transition off
      // some active state, which is never "greeting" (nothing accepted ever
      // transitions back into the first state) — this branch only exists to
      // satisfy the compiler's coverage of `ConversationState`.
      throw new Error(`emily-reply-selector: unexpected resulting state "${state}"`);
  }
}

/**
 * Picks Emily's silence-timeout nudge (docs/ai-configuration.md section 3's
 * 3-line pool), never repeating `lastNudgeText` (the `.en` of whichever
 * nudge was shown last, or `undefined` if none has been shown yet this
 * session) twice in a row.
 */
export function selectSilenceNudge(
  lesson: Lesson,
  lastNudgeText: string | undefined,
  random: RandomSource = Math.random,
): ScriptLine {
  return pickOneExcluding(lesson.silenceNudgeLines, lastNudgeText, random);
}
