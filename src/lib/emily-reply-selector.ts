import type { ActiveConversationState, Verdict } from "@/lib/conversation-state-machine";
import { getFocusGoal, type GoalProgress } from "@/lib/goal-progress";
import type { Lesson, ScriptLine } from "@/content/lesson";

/**
 * Client-side Conversation Script selection (issue #16;
 * docs/ai-configuration.md section 3; ADR-0005 "verbatim Conversation
 * Script, not model-generated"). This is the module the Judge's output
 * (a Goal Report over the open Goals plus `learner_asked_back` —
 * src/lib/practice-turn-protocol.ts) hands off to: the model does not say
 * what Emily says, only what the learner communicated and whether they asked
 * a question back. Every English line Emily speaks after her opening line is
 * picked here, at random, verbatim, from the current Lesson's fixed pools
 * (src/content/lesson.ts) — never paraphrased, never composed.
 *
 * Deliberately a small, pure, injectable-random module (same discipline as
 * src/lib/feedback-selector.ts) so pool selection is unit-testable without a
 * browser or a model call — see emily-reply-selector.test.ts.
 *
 * Issue #47 (ADR-0012): selection keys off the **Focus Goal** now, not a
 * Conversation State pointer. Given the Goal Progress a Turn left behind:
 *   - `needs_retry` → that Progress is where it started (nothing from a
 *     `needs_retry` Turn is saved — src/lib/goal-progress.ts's
 *     `applyGoalReport`), so its Focus Goal is the Goal the Turn was judged
 *     against, and the line comes from that Goal's `needsRetryLines`.
 *   - `accepted` → the *new* Focus Goal, or the completion pool once all four
 *     Goals are achieved.
 *
 * A single line, deliberately, for now. ADR-0012's "Line composition" makes
 * an `accepted` Turn a *sequence* — a reaction to a Goal just achieved, then a
 * line steering toward the new Focus Goal, with a farewell before completion
 * when `closing` landed earlier — which is #48's job. The seam is this
 * function's shape: it already receives the whole settled Turn
 * (`SelectEmilyLineInput`) rather than one state, so #48 adds a second picked
 * line (and a plural return) without the caller changing what it hands in.
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

/**
 * What Emily's line selection reads off one already-settled Turn: its Verdict
 * (derived on the client from the Judge's Goal Report — src/lib/goal-progress.ts's
 * `deriveVerdict`), the Goal Progress it left behind, and whether the learner
 * asked a question back. Grouped rather than positional because they are three
 * readings of the same Turn, and because #48 grows this input (a Turn that
 * achieves several Goals needs the whole achieved set, not just the new Focus
 * Goal) without changing the call site's shape.
 */
export type SelectEmilyLineInput = {
  verdict: Verdict;
  /**
   * Goal Progress *after* this Turn — identical to what it was before the Turn
   * when the Verdict is `needs_retry`, since nothing from such a Turn is saved.
   */
  progressAfterTurn: GoalProgress;
  learnerAskedBack: boolean;
};

/**
 * Selects Emily's next line for one judged learner turn — see this file's top
 * doc comment for the two cases and why one line is enough until #48.
 *
 * Every pool it draws from is written for a Conversation Goal, never for a
 * Conversation State's position in a sequence: the `needsRetryLines` are the
 * Focus Goal's own (docs/ai-configuration.md section 3's 12-line table),
 * `checkinLines`/`closingLines` are the steer toward that Focus Goal, and the
 * Response sub-pools are the reaction to the check-in Goal just achieved —
 * with `learner_asked_back` choosing between them, which is the whole reason
 * that boolean is on the wire (issue #16 acceptance criteria: never thank a
 * learner for a question they didn't ask; always answer one they did).
 */
export function selectEmilyLineForTurn(
  lesson: Lesson,
  input: SelectEmilyLineInput,
  random: RandomSource = Math.random,
): ScriptLine {
  const focusGoal = getFocusGoal(input.progressAfterTurn);

  if (input.verdict === "needs_retry") {
    if (focusGoal === null) {
      // Unreachable: a Turn is only ever submitted while at least one Goal is
      // open, and a needs_retry Turn leaves Goal Progress exactly as it was.
      throw new Error("emily-reply-selector: no open Goal to retry against");
    }
    return pickOne(lesson.script[focusGoal].needsRetryLines, random);
  }

  if (focusGoal === null) {
    // All four Goals achieved: the completion pool (English-only; see that
    // pool's own doc comment in lesson.ts).
    return { en: pickOne(lesson.completionMessages, random), zh: "" };
  }

  return selectLineForFocusGoal(lesson, focusGoal, input.learnerAskedBack, random);
}

function selectLineForFocusGoal(
  lesson: Lesson,
  focusGoal: ActiveConversationState,
  learnerAskedBack: boolean,
  random: RandomSource,
): ScriptLine {
  switch (focusGoal) {
    case "checkin":
      return pickOne(lesson.checkinLines, random);
    case "closing":
      return pickOne(lesson.closingLines, random);
    case "response":
      // The steer toward `response` is the check-in's *reaction*
      // (docs/ai-configuration.md section 3's "Line composition": the
      // Response pool is the one reaction-type pool every other pool
      // steers). `response` can only be the Focus Goal with `checkin`
      // already achieved, so a Response-pool line is always the right one
      // here — `learner_asked_back` chooses the sub-pool, which is the whole
      // reason that boolean is on the wire (issue #16 acceptance criteria:
      // never thank a learner for a question they didn't ask; always answer
      // one they did).
      return pickOne(
        learnerAskedBack ? lesson.responseLines.askedBack : lesson.responseLines.didNotAskBack,
        random,
      );
    case "greeting":
    default:
      // `greeting` has no steer pool of its own, so — per section 3's own
      // rule — one of its `needs_retry` lines serves as the steer; those
      // lines already read as "here's what to say next". Reachable only when
      // an accepted Turn achieved a *later* Goal while `greeting` stayed
      // open, which is the non-contiguous Goal Progress #47's one-Goal-per-Turn
      // conversations never produce (the Judge reports the Focus Goal's own
      // turn) — #48 owns multi-Goal Turns, and #50 owns the steering-back
      // behaviour and whether these two Goals deserve a steer pool.
      return pickOne(lesson.script[focusGoal].needsRetryLines, random);
  }
}

/**
 * Picks Emily's silence-timeout nudge (docs/ai-configuration.md section 3's
 * 3-line pool), never repeating `lastNudgeText` (the `.en` of whichever
 * nudge was shown last, or `undefined` if none has been shown yet this
 * session) twice in a row.
 *
 * One pool for the whole Lesson, not per Goal, and it takes no Goal Progress:
 * the nudge's job is to break a silence, not to say anything about what the
 * learner has or hasn't said, and it "never changes Goal Progress, never
 * reveals an Accepted Response" (that section). The message it produces is
 * still *tagged* with the Focus Goal — that happens in
 * src/lib/practice-state.ts's `appendSupportMessage`.
 */
export function selectSilenceNudge(
  lesson: Lesson,
  lastNudgeText: string | undefined,
  random: RandomSource = Math.random,
): ScriptLine {
  return pickOneExcluding(lesson.silenceNudgeLines, lastNudgeText, random);
}
