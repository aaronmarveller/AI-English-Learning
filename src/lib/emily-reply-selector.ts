import type { ActiveConversationState, Verdict } from "@/lib/conversation-state-machine";
import { applyGoalReport, getFocusGoal, type GoalProgress } from "@/lib/goal-progress";
import type { GoalReport } from "@/lib/practice-turn-protocol";
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
 * Issue #48 (same section's "Line composition"): the return is an **ordered
 * sequence**, because one Turn can achieve several Goals (ADR-0012) and every
 * line is spoken in full, in order — see `selectEmilyLinesForTurn` below for
 * the composition itself. Two Goals at a time is the real case the ticket's
 * headline scenario exercises (a reaction, then a steer); the single-Goal
 * cases are unchanged, still exactly one line.
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
 * What Emily's sequence selection reads off one already-settled Turn: its
 * Verdict (derived on the client from the Judge's Goal Report —
 * src/lib/goal-progress.ts's `deriveVerdict`), the Goal Progress the Judge's
 * report was judged against, that report, and whether the learner asked a
 * question back. Grouped rather than positional because they are four
 * readings of the same Turn.
 *
 * The report is carried rather than the Goal Progress it produced (the older
 * shape's `progressAfterTurn`) because composition #48 needs to know which
 * Goals *this Turn* achieved, not only where Goal Progress ended up: the
 * reaction line is chosen for `checkin` having been achieved here, and the
 * same distinction is what #50's farewell-before-completion needs
 * (`closing` achieved earlier vs. now). Both are derived from these two
 * fields by the one rule that moves Goal Progress at all —
 * `applyGoalReport`, applied inside this module — rather than by a second
 * "newly achieved" computation at the call site.
 */
export type SelectEmilyLinesInput = {
  verdict: Verdict;
  /** Goal Progress as it stood *before* this Turn — the open Goals the Judge's report was about. */
  progressBeforeTurn: GoalProgress;
  /** The Judge's Goal Report for this Turn (src/lib/practice-turn-protocol.ts). */
  goalReport: GoalReport;
  learnerAskedBack: boolean;
};

/**
 * Selects the ordered sequence of Conversation Script lines Emily speaks after
 * one judged learner turn (issue #48; docs/ai-configuration.md section 3's
 * "Line composition").
 *
 * Emily never composes a line, so a Turn that achieves several Goals is
 * answered by several existing pool lines, in this order:
 *
 * 1. **Reaction** — if `checkin` was achieved *in this Turn*, one line from the
 *    Response pool, the sub-pool chosen by `learner_asked_back`. The Response
 *    pool is the only reaction-type pool: it is the one place a floor line
 *    answers the learner rather than asking them for something, which is
 *    exactly what an achieved check-in calls for on both counts (they told her
 *    how they are, and — if they asked — she owes them her own answer; issue
 *    #16 acceptance criteria: never thank a learner for a question they didn't
 *    ask; always answer one they did).
 * 2. **Steer** — one line toward the *new* Focus Goal: Check-in pool for
 *    `checkin`, Closing pool for `closing`, the Completion pool once all four
 *    Goals are achieved. When that Focus Goal is `response` and step 1 just
 *    spoke, the reaction *is* the steer and nothing more is added; `response`
 *    and `greeting` have no steer pool of their own, so a Focus Goal that
 *    step 1 did not already address borrows one of its `needs_retry` lines
 *    (those lines already read as "here's what to say next" — see
 *    `selectSteerLineForFocusGoal` for how that reads on `response`). Whether
 *    those two Goals deserve a real steer pool, and the "an accepted Turn
 *    always yields at least one line" invariant, are #50's.
 *
 * A `needs_retry` Turn is a single line from the Focus Goal's own
 * `needsRetryLines` — the Focus Goal, because Goal Progress does not move on
 * such a Turn, so it is still the Goal the learner was judged against. (Which
 * pool a `failed` Goal picks is #49's.) Step 3 of section 3's composition —
 * farewell before completion when `closing` landed in an earlier Turn — is
 * #50's too, so a Turn that completes Practice here ends on the Completion
 * line alone.
 *
 * Deliberately returns an array even in the single-line cases: every call site
 * speaks and persists a sequence, and a caller that had to special-case
 * `length === 1` would be the second playback mechanism this ticket's design
 * notes rule out.
 */
export function selectEmilyLinesForTurn(
  lesson: Lesson,
  input: SelectEmilyLinesInput,
  random: RandomSource = Math.random,
): ScriptLine[] {
  const progressAfterTurn = applyGoalReport(
    input.progressBeforeTurn,
    input.goalReport,
    input.verdict,
  );
  const focusGoal = getFocusGoal(progressAfterTurn);

  if (input.verdict === "needs_retry") {
    if (focusGoal === null) {
      // Unreachable: a Turn is only ever submitted while at least one Goal is
      // open, and a needs_retry Turn leaves Goal Progress exactly as it was.
      throw new Error("emily-reply-selector: no open Goal to retry against");
    }
    return [pickOne(lesson.script[focusGoal].needsRetryLines, random)];
  }

  // All-or-nothing, so this is empty on a needs_retry Turn: read off the one
  // rule that moves Goal Progress rather than re-deriving "what changed" here.
  const achievedThisTurn = progressAfterTurn.filter(
    (goal) => !input.progressBeforeTurn.includes(goal),
  );

  const lines: ScriptLine[] = [];
  const reacted = achievedThisTurn.includes("checkin");
  if (reacted) {
    lines.push(
      pickOne(
        input.learnerAskedBack ? lesson.responseLines.askedBack : lesson.responseLines.didNotAskBack,
        random,
      ),
    );
  }

  if (focusGoal === null) {
    // All four Goals achieved: the completion pool (English-only; see that
    // pool's own doc comment in lesson.ts).
    lines.push({ en: pickOne(lesson.completionMessages, random), zh: "" });
    return lines;
  }

  if (focusGoal === "response" && reacted) return lines;

  lines.push(selectSteerLineForFocusGoal(lesson, focusGoal, random));
  return lines;
}

/**
 * The steer line toward one Focus Goal (step 2 of the composition above).
 *
 * `greeting` and `response` have no steer pool, so they borrow their own
 * `needsRetryLines` — section 3's rule for both. For `response` that is a
 * deliberate reading of section 3 over #47's mapping, which sent this case to
 * the Response pool: that pool *reacts* to a check-in the learner gave, and a
 * Turn that leaves `response` as the Focus Goal without having just achieved
 * `checkin` has no check-in to react to. #47's mapping and §3 coincide for
 * every one-Goal-per-Turn conversation (where the reaction is always what
 * steers toward `response`), so this only differs in the non-contiguous case
 * this ticket makes reachable — #50 owns ratifying it and deciding whether
 * these two Goals deserve steer pools of their own.
 */
function selectSteerLineForFocusGoal(
  lesson: Lesson,
  focusGoal: ActiveConversationState,
  random: RandomSource,
): ScriptLine {
  switch (focusGoal) {
    case "checkin":
      return pickOne(lesson.checkinLines, random);
    case "closing":
      return pickOne(lesson.closingLines, random);
    case "response":
      // See this function's doc comment.
      return pickOne(lesson.script[focusGoal].needsRetryLines, random);
    case "greeting":
    default:
      // `greeting` has no steer pool of its own either, so — per section 3's
      // own rule — one of its `needs_retry` lines serves as the steer; those
      // lines already read as "here's what to say next". Reachable when a Turn
      // achieved a *later* Goal while `greeting` stayed open, which is the
      // non-contiguous Goal Progress this ticket's multi-Goal Turns produce.
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
