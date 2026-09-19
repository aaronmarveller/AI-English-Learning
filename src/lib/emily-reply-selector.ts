import type { ActiveConversationState, Verdict } from "@/lib/conversation-state-machine";
import {
  applyGoalReport,
  getFocusGoal,
  getNewlyAchievedGoals,
  getOpenGoals,
  reportHasFailedGoal,
  type GoalProgress,
} from "@/lib/goal-progress";
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
 *     `applyGoalReport`), and the reply is that Goal's two-tier Recovery: for
 *     the Goal the first entry in canonical order the report marked `failed`
 *     names, or the Focus Goal when nothing was `failed` (issue #49; section
 *     3's own rule — see `selectRecoveryGoal`), and at the tier the learner's
 *     Retry Streak has earned (issue #56 — `selectRecoveryLines`).
 *   - `accepted` → the *new* Focus Goal, or the completion pool once all four
 *     Goals are achieved.
 *
 * Issue #48 (same section's "Line composition"): the return is an **ordered
 * sequence**, because one Turn can achieve several Goals (ADR-0012) and every
 * line is spoken in full, in order — see `selectEmilyLinesForTurn` below for
 * the composition itself. Two Goals at a time is the real case the ticket's
 * headline scenario exercises (a reaction, then a steer); the single-Goal
 * cases are unchanged, still exactly one line.
 *
 * Issue #50 completes the composition's last two rules, both of which exist
 * only because an earlier Goal may be left open: the steer toward an open
 * `greeting`/`response` borrows that Goal's `needs_retry` pool (ratified
 * against section 3 — see `selectSteerLineForFocusGoal`), and a Turn that
 * completes Practice says a Closing line before the Completion line when
 * `closing` was achieved in an earlier Turn. Both are inside
 * `selectEmilyLinesForTurn`, so the caller's shape (#48 chose it) is
 * unchanged.
 *
 * Issue #54 (ADR-0013, v2 ticket 4) changes *when* the reaction is due: the
 * learner asking a question back is reason enough on its own, so ticket 4's
 * Turn 3 — the check-in answered a Turn earlier, then "How about you?" — gets
 * an answer instead of a silent steer to Closing. `checkin` achieved in this
 * Turn still earns the reaction by itself, and `learner_asked_back` still
 * chooses the sub-pool whenever the reaction is spoken; the
 * `focusGoal === "response"` short-circuit now fires whenever a reaction line
 * was actually spoken rather than only when the check-in was. See step 1 of
 * `selectEmilyLinesForTurn`.
 *
 * Issue #55 (v2 ticket 5's Closing table) re-authors the two pools that end a
 * conversation: the Closing steer pool and the Completion pool are now both
 * farewells, so "See you!" is in both. Composition is otherwise unchanged —
 * one Completion pool, picked independently of which Closing line Emily just
 * spoke, because ADR-0013 decision 2 rejects keying a composed reply to the
 * sequence that preceded it (see lesson.ts's `COMPLETION_MESSAGES`). The one
 * consequence here is step 3: a Farewell line followed by the Completion line
 * could be the same text, so the second pick excludes the first (see step 3 in
 * `selectEmilyLinesForTurn`, and `pickOneExcludingBy`, the one helper both
 * exclusion sites go through).
 *
 * Issue #56 (v2 tickets 8, 10 and 9; ADR-0014) turns a `needs_retry` Turn's
 * single line into a **two-tier Recovery** — see `selectRecoveryLines`. The
 * tier is chosen by the learner's Retry Streak, which the caller reads off the
 * store (`SelectEmilyLinesInput.focusRetryStreak`); the first tier is a nudge
 * followed by the Goal's question, the second a direct example. The same
 * question half is what `selectSilenceReminder` now speaks after the nudge, so
 * the silence reminder and the first-tier recovery ask for a Goal in one pair
 * of functions (`selectGoalQuestionLine`), and the steer pools stay the single
 * source of the question wording throughout (ADR-0014 decisions 2 and 3).
 */

/** Injectable RNG, defaulting to `Math.random` — see this file's top doc comment. */
export type RandomSource = () => number;

function pickOne<T>(pool: readonly T[], random: RandomSource): T {
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  return pool[index];
}

/**
 * Picks one entry from `pool` at random, excluding the entry whose
 * `keyOf(entry)` equals `excludeValue` when the pool has more than one entry
 * to choose from. Two callers, one rule each:
 *
 * - `selectSilenceReminder` passes `keyOf = (line) => line.en`, so a long pause
 *   never repeats the exact same line twice in a row (docs/ai-configuration.md
 *   section 3's own rule for this pool; user story 18).
 * - step 3 of `selectEmilyLinesForTurn` passes `keyOf` as the identity on the
 *   Completion pool's bare strings, so the Farewell line is not immediately
 *   repeated as the Completion line (issue #55: both pools hold "See you!"
 *   now).
 *
 * One function rather than a `ScriptLine` version and a string copy of it,
 * because the interesting part is the fallback discipline and it has to hold
 * for both callers identically: an empty or absent exclusion, a single-entry
 * pool, and a filter that would empty the pool all fall back to a plain
 * `pickOne` — a one-line pool still has to say *something* rather than throw,
 * and never-excluding is a better failure than never-speaking.
 */
function pickOneExcludingBy<T>(
  pool: readonly T[],
  excludeValue: string | undefined,
  keyOf: (entry: T) => string,
  random: RandomSource,
): T {
  if (pool.length <= 1 || excludeValue === undefined) return pickOne(pool, random);
  const candidates = pool.filter((entry) => keyOf(entry) !== excludeValue);
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
 * reaction line is chosen for `checkin` having been achieved here — and, since
 * ADR-0013, for the learner having asked a question back at all, whatever
 * earlier Turns did with the check-in — and the same distinction is what #50's
 * farewell-before-completion needs (`closing` achieved earlier vs. now). Both
 * are derived from these two fields by the one rule that moves Goal Progress at
 * all — `applyGoalReport` applied inside this module, then its diff against the
 * Goals it was given (src/lib/goal-progress.ts's `getNewlyAchievedGoals`) —
 * rather than by a second "newly achieved" computation at the call site.
 */
export type SelectEmilyLinesInput = {
  verdict: Verdict;
  /** Goal Progress as it stood *before* this Turn — the open Goals the Judge's report was about. */
  progressBeforeTurn: GoalProgress;
  /** The Judge's Goal Report for this Turn (src/lib/practice-turn-protocol.ts). */
  goalReport: GoalReport;
  learnerAskedBack: boolean;
  /**
   * The learner's Retry Streak (issue #56; docs/ai-configuration.md section
   * 3): how many `needs_retry` Turns in a row the *current Focus Goal* has
   * already had — `0` on the first one. Only a `needs_retry` Turn reads it,
   * and it is the whole of the tier decision: `0` means tier 1 (a nudge, then
   * the Goal's question), anything above means tier 2 (the direct example).
   *
   * Taken as an input rather than derived here because it is *persisted*
   * conversation state (src/lib/practice-state.ts's `retryStreak`): it resets
   * on any `accepted` Turn, which is a fact about Turns this function never
   * sees, and it is read off the store before the Turn being selected is
   * recorded (`practice-page-content.tsx`). Required, not defaulted: a caller
   * that forgot it would silently speak tier 1 to a learner who has already
   * been nudged, which is the one failure this field exists to prevent.
   */
  focusRetryStreak: number;
};

/**
 * Selects the ordered sequence of Conversation Script lines Emily speaks after
 * one judged learner turn (issue #48; docs/ai-configuration.md section 3's
 * "Line composition").
 *
 * Emily never composes a line, so a Turn that achieves several Goals is
 * answered by several existing pool lines, in this order:
 *
 * 1. **Reaction** — when the learner asked a question back *or* `checkin` was
 *    achieved *in this Turn*: one line from the Response pool, the sub-pool
 *    chosen by `learner_asked_back` (`askedBack` when they asked, the plain
 *    `didNotAskBack` acknowledgement otherwise). The Response pool is the only
 *    reaction-type pool: it is the one place a floor line answers the learner
 *    rather than asking them for something, and both halves of the condition
 *    are Emily owing them something — an answer to the question they put to
 *    her (issue #16 acceptance criteria: always answer one they asked; never
 *    thank a learner for one they didn't), or a reaction to the check-in they
 *    just gave. ADR-0013 makes the first half stand on its own, so ticket 4's
 *    own Turn 3 — the check-in answered a Turn earlier, then "How about you?"
 *    — hears the ticket's own answer from the askedBack pool ("I'm good too,
 *    thanks!") and only then a steer, instead of a silent steer to Closing that
 *    never answers the question.
 * 2. **Steer** — one line toward the *new* Focus Goal: Check-in pool for
 *    `checkin`, Closing pool for `closing`, the Completion pool once all four
 *    Goals are achieved. When that Focus Goal is `response` and step 1 just
 *    spoke — whatever the reaction was due to — the reaction *is* the steer and
 *    nothing more is added; `response` and `greeting` have no steer pool of
 *    their own, so a Focus Goal that step 1 did not already address borrows one
 *    of its `needs_retry` lines (those lines already read as "here's what to
 *    say next" — see `selectSteerLineForFocusGoal`, which #50 ratifies against
 *    section 3).
 * 3. **Farewell before completion** (issue #50) — if this Turn completes
 *    Practice but `closing` was achieved in an *earlier* one, a Closing-pool
 *    line is spoken before the Completion line, so Emily always says goodbye:
 *    a learner who opened with "Hi! Bye!" hears "See you!" back when the
 *    conversation finally closes, instead of being cut off. When `closing` was
 *    achieved *in this Turn* there is nothing to add — the Completion line
 *    answers the goodbye the learner just said. Since #55 both lines are
 *    farewells, so in that rare Turn Emily says goodbye twice; the second pick
 *    skips the first's exact text rather than repeating it.
 *
 * The three steps are what makes section 3's guarantee true — "Emily never
 * ends a Turn silent: the composition above always yields at least one line" —
 * which is why it is checked exhaustively rather than case by case in
 * emily-reply-selector.test.ts: an `accepted` Turn achieves at least one open
 * Goal by definition, so every branch here has to be one some line covers.
 *
 * A `needs_retry` Turn speaks a **Recovery** instead (issue #56): one or two
 * lines, never a composed sentence, from `selectRecoveryLines` below. Which
 * Goal's recovery it is stays #49's rule — the first `failed` Goal in
 * canonical order, or the Focus Goal's when the report failed nothing at all —
 * and the tier comes from the caller's Retry Streak. The ticket example is
 * `checkin` achieved and `closing` failed, where the nudge has to come from
 * Closing, not from the Check-in the learner just got right.
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
    const retryGoal = selectRecoveryGoal(input.progressBeforeTurn, input.goalReport);
    if (retryGoal === null) {
      // Unreachable: a Turn is only ever submitted while at least one Goal is
      // open, and a needs_retry Turn leaves Goal Progress exactly as it was.
      throw new Error("emily-reply-selector: no open Goal to retry against");
    }
    return selectRecoveryLines(lesson, retryGoal, input, random);
  }

  // All-or-nothing, so this is empty on a needs_retry Turn: read off the one
  // rule that moves Goal Progress rather than re-deriving "what changed" here
  // (src/lib/goal-progress.ts's `getNewlyAchievedGoals` — the same call the
  // store makes for its per-Goal Turn records).
  const achievedThisTurn = getNewlyAchievedGoals(input.progressBeforeTurn, progressAfterTurn);

  const lines: ScriptLine[] = [];
  // A reaction is due when the learner asked a question back — Emily owes them
  // an answer, whenever the check-in was answered — or when `checkin` landed
  // in this Turn, which she owes them a reaction to (ADR-0013: "the reaction is
  // due whenever the learner asked back, not only when the check-in landed in
  // the same Turn"). Which of the two it is does not change the pool: the
  // sub-pool is `learner_asked_back`'s to choose either way, because a plain
  // acknowledgement and a reply to a returned question are not
  // interchangeable.
  const reacted = input.learnerAskedBack || achievedThisTurn.includes("checkin");
  if (reacted) {
    lines.push(
      pickOne(
        input.learnerAskedBack ? lesson.responseLines.askedBack : lesson.responseLines.didNotAskBack,
        random,
      ),
    );
  }

  if (focusGoal === null) {
    // All four Goals achieved, so this Turn completes Practice — step 2's own
    // terminal case, and the Completion pool (English-only; see that pool's
    // own doc comment in lesson.ts).
    //
    // Step 3: a farewell first, when `closing` was not among the Goals this
    // Turn achieved. That is the same question as "was `closing` already in
    // Goal Progress" — Practice only completes with all four in it — and it is
    // the distinction the whole step turns on: a learner who said goodbye
    // three Turns ago ("Hi! Bye!") never hears Emily return it otherwise. Her
    // line comes from the Closing pool, the same one the steer toward an open
    // `closing` draws from: a goodbye is a goodbye whether Emily is suggesting
    // it or answering it.
    if (input.progressBeforeTurn.includes("closing")) {
      const farewell = pickOne(lesson.closingLines, random);
      lines.push(farewell);
      // Issue #55: the Completion pool was re-authored into bare farewells
      // ("See you!" is in both pools now), so the two lines this step can
      // produce could be the *same text* — the same repetition step 1's
      // `response` short-circuit exists to prevent, and this file's one
      // standing invariant is that a Turn never repeats a line (see
      // emily-reply-selector.test.ts's exhaustion over the whole Progress ×
      // Report space). The pool is still picked independently of which
      // Closing line was spoken — ADR-0013 rejects keying one line to
      // another — it just skips the text it has already said.
      lines.push({
        en: pickOneExcludingBy(
          lesson.completionMessages,
          farewell.en,
          (message) => message,
          random,
        ),
        zh: "",
      });
      return lines;
    }
    lines.push({ en: pickOne(lesson.completionMessages, random), zh: "" });
    return lines;
  }

  // `response`'s steer *is* its reaction, so whenever a reaction line was
  // actually spoken it is never repeated here as a second line. Keyed to the
  // reaction itself rather than to `checkin` having landed in this Turn
  // (ADR-0013): a Turn whose reaction was due to an ask-back alone has just as
  // little left to say toward `response`.
  if (focusGoal === "response" && reacted) return lines;

  lines.push(selectSteerLineForFocusGoal(lesson, focusGoal, random));
  return lines;
}

/**
 * Which Goal's Recovery a `needs_retry` Turn speaks from (issue #49's rule,
 * unchanged by #56; docs/ai-configuration.md section 3's Recovery table: "the
 * first Goal in canonical order the Goal Report marked `failed`, or the Focus
 * Goal's when nothing was `failed`").
 *
 * Reading the report, not only the Focus Goal, is what makes Emily answer the
 * *right* half of a mixed Turn: in the ticket's example the Focus Goal is
 * Check-in but the learner's "I'm fine. See you later alligator crocodile"
 * achieved `checkin` and failed `closing`, so the Recovery has to be a Closing
 * one — pointing at what actually went wrong, not at the Goal they just got
 * right. "First in canonical order" (rather than, say, the last `failed` Goal)
 * keeps a Turn that fails several deterministic and non-arbitrary: the
 * earliest Goal still wrong is the one nudged, and it is the one a learner
 * fixing the message would repair first.
 *
 * Only the *open* Goals are considered, exactly as `deriveVerdict` considers
 * only those (src/lib/goal-progress.ts): a report key naming a Goal already in
 * Goal Progress can never redirect Emily's line. `null` only when no Goal is
 * open, which no submitted Turn reaches (the client stops submitting once
 * Practice is complete).
 *
 * Named for the Recovery rather than for a "retry pool" (issue #56 renamed it):
 * the pool it used to choose between no longer exists, and speaking that Goal's
 * Recovery is what the caller does with the answer.
 */
function selectRecoveryGoal(
  progressBeforeTurn: GoalProgress,
  goalReport: GoalReport,
): ActiveConversationState | null {
  const openGoals = getOpenGoals(progressBeforeTurn);
  return openGoals.find((goal) => goalReport[goal] === "failed") ?? getFocusGoal(progressBeforeTurn);
}

/**
 * Emily's Recovery for one `needs_retry` Turn (issue #56; v2 tickets 8 and 10;
 * docs/ai-configuration.md section 3's "Recovery").
 *
 * Two tiers, and the caller's Retry Streak picks between them:
 *
 * - **Tier 2** — from the learner's *second* consecutive `needs_retry` Turn on
 *   the same Focus Goal — is `directExample`, one line, and the only recovery
 *   line that may name an Accepted Response (ADR-0014 decision 1).
 * - **Tier 1** — everything else — is a *sequence*: a nudge, then the Goal's
 *   question (`selectGoalQuestionLine`). Which nudge is the Goal Report's
 *   difference: at least one open Goal `failed` means a recognisable attempt
 *   that did not come through, so the learner hears the Goal's `unclearNudge`;
 *   a report that attempted nothing at all (every open Goal `untouched` —
 *   what off-topic input looks like, ADR-0006) hears `offTopicNudge` instead,
 *   or no nudge at all where that Goal's row in v2 ticket 10's table has none.
 *
 * That `failed`/`untouched` split is read off *every* open Goal, not only off
 * `retryGoal`: it describes the learner's Turn, while `retryGoal` describes
 * which Goal the recovery talks about (issue #49's rule, which this function
 * is handed already decided). In the ticket's own mixed Turn — `checkin`
 * achieved, `closing` failed — the two coincide as "unclear", which is what
 * that Turn deserves: something was attempted and did not land. (`failed` on
 * the chosen Goal would answer the same way — `selectRecoveryGoal` picks a
 * `failed` Goal whenever one exists — but the variant is a fact about the
 * Turn, so it is read as one rather than as a property of the Goal answering
 * it.)
 *
 * Tier 1 is two lines rather than the one combined sentence the tickets quote
 * ("Let's keep going. How are you today?") because the question half of those
 * sentences is *already written* — it is the Goal's own question — and
 * authoring a second copy of it is the composed line ADR-0013 decision 2 and
 * ADR-0014 decisions 2/3 reject. A sequence of existing lines is how the rest
 * of this module composes too (see `selectEmilyLinesForTurn`).
 */
function selectRecoveryLines(
  lesson: Lesson,
  retryGoal: ActiveConversationState,
  input: SelectEmilyLinesInput,
  random: RandomSource,
): ScriptLine[] {
  const recovery = lesson.script[retryGoal].recovery;

  // Second consecutive `needs_retry` on this Focus Goal: stop nudging, hand
  // over an example. The streak counts *Turns*, and it is the store that
  // resets it on any accepted Turn (src/lib/practice-state.ts's `retryStreak`)
  // — this function only ever reads it.
  if (input.focusRetryStreak > 0) return [recovery.directExample];

  const attempted = reportHasFailedGoal(input.progressBeforeTurn, input.goalReport);
  const nudge = attempted ? recovery.unclearNudge : recovery.offTopicNudge;

  // `null` for a Goal whose off-topic row in ticket 10's table has no prefix
  // of its own (response, closing) — the question is that Goal's whole first
  // redirect, so it opens the recovery on its own.
  const lines: ScriptLine[] = [];
  if (nudge !== null) lines.push(nudge);
  lines.push(selectGoalQuestionLine(lesson, retryGoal, random));
  return lines;
}

/**
 * The question Emily asks for one Goal when the learner has not delivered it:
 * the first-tier Recovery's second half, and the second line of the silence
 * reminder (`selectSilenceReminder`) — one question, so a Goal is asked for the
 * same way however Emily got there.
 *
 * `recovery.question` is `null` for `checkin` and only for it: that Goal's
 * question is its steer pool's ("How are you today?", "How's it going?"), and
 * those lines are what Emily actually asked the learner a moment earlier — so
 * asking it again from there is the single-source rule, not a shortcut
 * (ADR-0014 decisions 2 and 3; docs/ai-configuration.md section 3's
 * "Silence reminder" quotes the Check-in case by name). The steer pools serve
 * this Goal's *accepted* Turn too (`selectSteerLineForFocusGoal`), which is
 * the same reading: one pool, two ways to point at the same Goal.
 */
function selectGoalQuestionLine(
  lesson: Lesson,
  goal: ActiveConversationState,
  random: RandomSource,
): ScriptLine {
  const question = lesson.script[goal].recovery.question;
  if (question !== null) return question;
  return selectSteerLineForFocusGoal(lesson, goal, random);
}

/**
 * The steer line toward one Focus Goal (step 2 of the composition above).
 *
 * `greeting` and `response` have no steer pool, so they borrow their own
 * `steerLines`. Issue #50 ratifies that against section 3, which states it
 * outright, and settles the one place #47's mapping disagreed: that mapping
 * sent a `response` Focus Goal to the Response pool, which *reacts* to
 * something the learner gave — and a Turn that leaves `response` open without
 * having just achieved `checkin` and without an ask-back has nothing to react
 * to (ADR-0013 widened the reaction's trigger, not its meaning: a reaction
 * answers the learner, so it can never be spent on asking). The two coincide
 * for every one-Goal-per-Turn conversation (where the reaction is always what
 * steers toward `response`), so this only shows up in the non-contiguous Goal
 * Progress #48 made reachable. Giving either Goal a steer pool of its own
 * stays out of scope: it would need new lines and so new audio, which #50's
 * design notes rule out — ADR-0012 names that as the fix if these borrowed
 * lines ever read as criticism in practice.
 *
 * Issue #56 renamed the borrowed pool `needsRetryLines` → `steerLines`, made
 * it optional, and left it this one job (ADR-0014 decision 5): a `needs_retry`
 * Turn speaks the Goal's recovery now, so nothing about this function's
 * behaviour changed — only the name of the pool it reads, and the fact that
 * the check-in and closing Goals no longer carry one nothing could speak.
 *
 * The "and step 1 did not already address it" half of that rule is the caller's
 * `focusGoal === "response" && reacted` short-circuit, not a second condition
 * here: only `response` has a reaction that doubles as its steer. A reaction
 * (a Response-pool line answering the learner's check-in, or their question
 * back) says nothing about greeting, so an open `greeting` always gets its line
 * — which is what keeps the composition's "never silent" guarantee true rather
 * than mostly true. Issue #54 keys that short-circuit to the reaction having
 * actually been spoken rather than to `checkin` having landed in this Turn, so
 * an ask-back alone cannot leave `response` saying a steer line *after*
 * Emily has just answered the question.
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
    case "greeting":
    default:
      // Neither Goal has a steer pool of its own, so — per section 3's own
      // rule — one of its `steerLines` serves as the steer; those lines
      // already read as "here's what to say next". Reachable for `greeting`
      // when a Turn achieved a *later* Goal while it stayed open, which is the
      // non-contiguous Goal Progress this ticket's multi-Goal Turns produce.
      return pickBorrowedSteerLine(lesson, focusGoal, random);
  }
}

/**
 * One line from a Goal's borrowed steer pool — the `steerLines` only
 * `greeting` and `response` carry (see `PracticeStateScript.steerLines`), and
 * the only thing that pool is for.
 *
 * Throws rather than falling back to an empty pool: a Goal reaching here
 * without a pool is a content error the compiler cannot see (the field is
 * optional), and the alternative — speaking nothing — is the one outcome this
 * module's "never silent" invariant forbids. Same shape as
 * `selectRecoveryGoal`'s unreachable-`null` throw.
 */
function pickBorrowedSteerLine(
  lesson: Lesson,
  focusGoal: ActiveConversationState,
  random: RandomSource,
): ScriptLine {
  const pool = lesson.script[focusGoal].steerLines;
  if (pool === undefined || pool.length === 0) {
    throw new Error(`emily-reply-selector: ${focusGoal} has no steer pool to borrow from`);
  }
  return pickOne(pool, random);
}

/**
 * Emily's silence reminder (issue #56; v2 ticket 9; docs/ai-configuration.md
 * section 3's "Silence reminder"): the nudge, then the Focus Goal's question.
 * "Take your time. How are you today?" is the ticket's own example, and it is
 * a sequence here for the same reason the first-tier Recovery is: the question
 * is the Goal's, already authored, and the steer pools stay its single source
 * (ADR-0014 decisions 3 and 6).
 *
 * The nudge barely changed — same pool, same rule that a long pause never
 * repeats the exact same line twice in a row — so what this returns is the
 * nudge *and* the lines that are spoken, because the caller has to persist and
 * speak both while only the nudge is what the no-repeat rule tracks:
 *
 * - `nudge` is the pick, `.en` of which the caller keeps as `lastNudgeText`.
 * - `lines` is what to say, in order.
 *
 * The Goal is the caller's to pass rather than derived here: the silence
 * reminder is aimed at the Focus Goal (CONTEXT.md "Focus Goal" — what Emily is
 * waiting for), and it *is* the Focus Goal because silence is not a Turn and
 * cannot change it, but this module has no Goal Progress to derive that from.
 * A reminder never reveals an Accepted Response: tier 1's wording is all it
 * ever speaks, and the Retry Streak is deliberately not consulted — silence is
 * not a failed attempt, so a quiet learner is not a learner on their second
 * try (ADR-0014's considered options).
 */
export type SilenceReminder = {
  /** The nudge line picked — the one the never-twice-in-a-row rule tracks. */
  nudge: ScriptLine;
  /** The whole reminder to speak and persist, in order: the nudge, then the Focus Goal's question. */
  lines: ScriptLine[];
};

export function selectSilenceReminder(
  lesson: Lesson,
  focusGoal: ActiveConversationState,
  lastNudgeText: string | undefined,
  random: RandomSource = Math.random,
): SilenceReminder {
  const nudge = pickOneExcludingBy(lesson.silenceNudgeLines, lastNudgeText, (line) => line.en, random);
  return { nudge, lines: [nudge, selectGoalQuestionLine(lesson, focusGoal, random)] };
}
