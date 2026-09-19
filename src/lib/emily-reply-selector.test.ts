import { describe, expect, it } from "vitest";
import { selectEmilyLinesForTurn, selectSilenceNudge } from "@/lib/emily-reply-selector";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import { applyGoalReport, deriveVerdict, type GoalProgress } from "@/lib/goal-progress";
import { GOAL_REPORT_VALUES, type GoalReport } from "@/lib/practice-turn-protocol";
import { AUDIO_MANIFEST } from "@/lib/audio-manifest";
import type { Lesson, ScriptLine } from "@/content/lesson";

/** Deterministic RNG returning a fixed value every call — picks the pool's first entry via `pickOne`'s floor(). */
function fixedRandom(value: number) {
  return () => value;
}

/**
 * Issue #47 (ADR-0012): selection keys off the Focus Goal — the first open
 * Goal in the Goal Progress a Turn left behind — rather than a Conversation
 * State pointer. These tests drive it the way practice-page-content.tsx does:
 * hand it the Goal Progress the Judge's report was judged against plus the
 * report itself, and read the sequence back.
 *
 * Issue #48 (docs/ai-configuration.md section 3's "Line composition"): that
 * sequence is ordered and can hold more than one line — a reaction to the
 * learner's Turn, then a steer toward the new Focus Goal. The single-Goal
 * cases must stay exactly one line, identical to what #47 selected.
 *
 * Issue #49 (section 3's `needs_retry` pool rule): a `needs_retry` Turn's one
 * line comes from the first Goal in canonical order its report marked `failed`
 * — the Focus Goal's only when nothing was `failed`. The `failed` cases are
 * grouped in their own `describe` below.
 *
 * Issue #54 (ADR-0013's behaviour change; v2 ticket 4): the reaction is due
 * whenever the learner asked a question back *or*
 * `checkin` was achieved *in this Turn* — so ticket 4's own Turn 3, where the
 * check-in landed a Turn earlier, gets an answer to "How about you?" instead
 * of being steered straight to Closing. The ticket's Turn 3 cases live in
 * their own `describe` below; the `focusGoal === "response"` short-circuit
 * that keeps a reaction from being repeated as the steer now fires whenever a
 * reaction was spoken at all, which the exhaustive invariant at the bottom of
 * this file checks for both `learnerAskedBack` values.
 *
 * Issue #50 (section 3's steps 2 and 3, and its "Emily never ends a Turn
 * silent" guarantee): the steer toward an open `greeting`/`response` Goal, and
 * the Closing line before the Completion line when `closing` landed in an
 * earlier Turn, both live in their own `describe`s below. The invariant they
 * exist to keep — an `accepted` Turn always yields at least one line — is
 * checked exhaustively over the whole prior-Goal-Progress × Goal-Report space,
 * not by named cases: the space is 2⁴ × at most 3⁴ = 256 pairs, cheap enough
 * that "we thought of every shape" is a proof rather than a claim.
 *
 * Issue #55 re-authors the Closing and Completion pools (v2 ticket 5's table),
 * which shrinks both: Closing 4 → 3, Completion still 3 but two of its lines
 * are now shared with Explore's recordings. The counts below are recomputed
 * from the pools, and one new named case pins the hazard the re-authoring
 * introduces — both pools are farewells, so step 3's Farewell line and its
 * Completion line could be the same text.
 *
 * The helper below mirrors the call site, deriving the Verdict exactly as
 * production derives it (src/lib/goal-progress.ts's `deriveVerdict`).
 */
function selectLines(progressBeforeTurn: GoalProgress, goalReport: GoalReport, learnerAskedBack = false) {
  return selectEmilyLinesForTurn(
    GREETING_SOMEBODY_LESSON,
    {
      verdict: deriveVerdict(progressBeforeTurn, goalReport),
      progressBeforeTurn,
      goalReport,
      learnerAskedBack,
    },
    fixedRandom(0),
  );
}

/**
 * Every Goal Progress state a Turn can be judged against — all 2⁴ subsets of
 * the four Conversation Goals *except* the complete one — paired with every
 * Goal Report that can be made against it (each open Goal independently
 * `achieved`/`failed`/`untouched`, and — since an absent key is read as no
 * attempt — every assignment of those values). 255 pairs in total, which is
 * why issue #50 asks for exhaustion here: the shape nobody thought of is
 * exactly the one a named-case test misses, and the cost of not missing it is
 * a nested loop.
 *
 * The complete state is left out deliberately, not overlooked: with no open
 * Goal the Judge has nothing to report on, the client stops submitting once
 * Practice is complete, and `selectEmilyLinesForTurn` treats the resulting
 * empty report as the programming error it is.
 */
function everyPriorProgressAndReport(): { progressBeforeTurn: GoalProgress; goalReport: GoalReport }[] {
  const cases: { progressBeforeTurn: GoalProgress; goalReport: GoalReport }[] = [];
  for (let mask = 0; mask < 1 << ACTIVE_CONVERSATION_STATES.length; mask++) {
    const progressBeforeTurn: GoalProgress = ACTIVE_CONVERSATION_STATES.filter(
      (_, index) => (mask & (1 << index)) !== 0,
    );
    const openGoals = ACTIVE_CONVERSATION_STATES.filter(
      (goal) => !progressBeforeTurn.includes(goal),
    );
    if (openGoals.length === 0) continue;
    const combinations = GOAL_REPORT_VALUES.length ** openGoals.length;
    for (let combination = 0; combination < combinations; combination++) {
      const goalReport: GoalReport = {};
      let rest = combination;
      for (const goal of openGoals) {
        goalReport[goal] = GOAL_REPORT_VALUES[rest % GOAL_REPORT_VALUES.length];
        rest = Math.floor(rest / GOAL_REPORT_VALUES.length);
      }
      cases.push({ progressBeforeTurn, goalReport });
    }
  }
  return cases;
}

/**
 * Every pool a `selectEmilyLinesForTurn` sequence can draw from, in the Lesson
 * whose sizes decide how far the sweep below has to reach. Typed by `length`
 * alone because the Completion pool holds bare strings while every other pool
 * holds `ScriptLine`s.
 */
function sequencePools(lesson: Lesson): readonly { readonly length: number }[] {
  return [
    lesson.checkinLines,
    lesson.responseLines.didNotAskBack,
    lesson.responseLines.askedBack,
    lesson.closingLines,
    lesson.completionMessages,
    ...ACTIVE_CONVERSATION_STATES.map((goal) => lesson.script[goal].needsRetryLines),
  ];
}

/**
 * The same pools' English texts, flattened — the *distinct* count of them is
 * what the sweep's `spoken` set below has to reach, and since issue #55 that
 * count is one lower than the number of pool entries: "See you!" is in both
 * the Closing and the Completion pool (both are farewells now). Kept beside
 * `sequencePools` rather than merged into it, because the pools above are
 * typed by `length` alone (the Completion pool holds bare strings) and the
 * sweep's width only ever needs sizes.
 */
function sequencePoolTexts(lesson: Lesson): string[] {
  return [
    ...lesson.checkinLines.map((line) => line.en),
    ...lesson.responseLines.didNotAskBack.map((line) => line.en),
    ...lesson.responseLines.askedBack.map((line) => line.en),
    ...lesson.closingLines.map((line) => line.en),
    ...lesson.completionMessages,
    ...ACTIVE_CONVERSATION_STATES.flatMap((goal) =>
      lesson.script[goal].needsRetryLines.map((line) => line.en),
    ),
  ];
}

/**
 * RNGs spanning index 0..largest-pool-length-1 of every pool a sequence can
 * draw from, so the audio-manifest sweep below reaches every entry the
 * selector is able to speak — not just the pool's first line.
 *
 * Generated from the *current* lesson's pools rather than a hard-coded list
 * (issue #54: the old `[0, 0.25, 0.5, 0.75]` was documented as spanning
 * "index 0..3 of every pool a sequence can draw from (the largest is 4
 * lines)", and the did-not-ask-back Response sub-pool growing from 3 to 6
 * lines would have left half of it silently unreached — the sweep would still
 * have passed, having checked less).
 *
 * `(index + 0.5) / largestPoolSize` rather than `index / largestPoolSize`,
 * because `pickOne` grounds with `Math.floor(random() * pool.length)`: the
 * half-step lands strictly inside the index-`index` slot of a pool that *is*
 * the largest, where a bare `index / largestPoolSize` can come out a hair
 * under `index` in floating point. For a smaller pool of length L, consecutive
 * random values are L/largestPoolSize <= 1 slot apart and the first one is
 * below 1 while the last is at or above L - 1, so the sweep still visits every
 * index 0..L-1.
 */
const SPANNING_RANDOMS: (() => number)[] = (() => {
  const largestPoolSize = Math.max(
    ...sequencePools(GREETING_SOMEBODY_LESSON).map((pool) => pool.length),
  );
  return Array.from({ length: largestPoolSize }, (_, index) => {
    const value = (index + 0.5) / largestPoolSize;
    return () => value;
  });
})();

describe("selectEmilyLinesForTurn", () => {
  it("needs_retry with nothing failed picks one line from the Focus Goal's own needsRetryLines pool, leaving Goal Progress alone", () => {
    const cases: [GoalProgress, ActiveConversationState][] = [
      [[], "greeting"],
      [["greeting"], "checkin"],
      [["greeting", "checkin"], "response"],
      [["greeting", "checkin", "response"], "closing"],
    ];
    for (const [progressBeforeTurn, focusGoal] of cases) {
      // A report that attempts nothing on any open Goal derives needs_retry,
      // and with no `failed` Goal the Focus Goal's pool is the one used
      // (issue #49 — the `failed` cases are below).
      const lines = selectLines(progressBeforeTurn, {});
      expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script[focusGoal].needsRetryLines[0]]);
    }
  });

  describe("needs_retry speaks from the first failed Goal's pool (issue #49)", () => {
    it("nudges the failed Goal, not the Focus Goal: Focus Goal checkin, but closing failed", () => {
      // The ticket's example — "I'm fine. See you later alligator crocodile"
      // against a Focus Goal of Check-in. `checkin` was achieved, `closing`
      // failed, all-or-nothing leaves Goal Progress at ["greeting"], and the
      // nudge has to come from the Closing pool: pointing at the goodbye the
      // learner did not get, never at the check-in they just got right.
      const lines = selectLines(["greeting"], { checkin: "achieved", closing: "failed" });

      expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.closing.needsRetryLines[0]]);
      expect(GREETING_SOMEBODY_LESSON.script.checkin.needsRetryLines).not.toContainEqual(lines[0]);
    });

    it("uses a failed Goal's pool even when the Focus Goal itself was left untouched", () => {
      // Check-in (the Focus Goal) was not attempted at all; `response` was
      // attempted and missed. "Untouched" is not a failure, so the retry line
      // is `response`'s even though `response` is the later Goal.
      const lines = selectLines(["greeting"], { checkin: "untouched", response: "failed" });

      expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.response.needsRetryLines[0]]);
      expect(GREETING_SOMEBODY_LESSON.script.checkin.needsRetryLines).not.toContainEqual(lines[0]);
    });

    it("takes the earliest failed Goal in canonical order when a Turn fails several", () => {
      // Canonical order is greeting → checkin → response → closing: `response`
      // wins over `closing` however the report happens to be keyed, so the
      // next Turn's retry starts on the earliest Goal still wrong.
      const lines = selectLines([], { closing: "failed", response: "failed" });

      expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.response.needsRetryLines[0]]);
      expect(GREETING_SOMEBODY_LESSON.script.closing.needsRetryLines).not.toContainEqual(lines[0]);
    });

    it("never lets a `failed` key outside the open Goals redirect the line", () => {
      // The Judge is only asked about open Goals (ADR-0012), so a report key
      // naming an already-achieved Goal neither fails the Turn nor changes
      // which pool Emily speaks from — Goal Progress decides that.
      const lines = selectLines(["greeting", "checkin"], { greeting: "failed" });

      expect(deriveVerdict(["greeting", "checkin"], { greeting: "failed" })).toBe("needs_retry");
      expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.response.needsRetryLines[0]]);
    });

    it("falls back to the Focus Goal's pool when every open Goal was untouched", () => {
      // Off-topic chatter touches no Goal (docs/ai-configuration.md section 4):
      // nothing failed, so this is the Focus Goal's own retry pool.
      const lines = selectLines(["greeting", "checkin"], {
        response: "untouched",
        closing: "untouched",
      });

      expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.response.needsRetryLines[0]]);
    });
  });

  it("accepted greeting advances the Focus Goal to checkin and picks one line from checkinLines", () => {
    const lines = selectLines([], { greeting: "achieved" });
    expect(lines).toEqual([GREETING_SOMEBODY_LESSON.checkinLines[0]]);
  });

  it("accepted checkin with learnerAskedBack=false picks one line from responseLines.didNotAskBack, never askedBack", () => {
    for (let i = 0; i < 20; i++) {
      const lines = selectEmilyLinesForTurn(
        GREETING_SOMEBODY_LESSON,
        {
          verdict: "accepted",
          progressBeforeTurn: ["greeting"],
          goalReport: { checkin: "achieved" },
          learnerAskedBack: false,
        },
        () => i / 20,
      );
      // One line: the reaction to `checkin` *is* the steer toward `response`,
      // so it is never spoken twice.
      expect(lines).toHaveLength(1);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).not.toContainEqual(lines[0]);
    }
  });

  it("accepted checkin with learnerAskedBack=true always picks from responseLines.askedBack, never didNotAskBack", () => {
    for (let i = 0; i < 20; i++) {
      const lines = selectEmilyLinesForTurn(
        GREETING_SOMEBODY_LESSON,
        {
          verdict: "accepted",
          progressBeforeTurn: ["greeting"],
          goalReport: { checkin: "achieved" },
          learnerAskedBack: true,
        },
        () => i / 20,
      );
      expect(lines).toHaveLength(1);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).not.toContainEqual(lines[0]);
    }
  });

  it("accepted response advances the Focus Goal to closing and picks one line from closingLines", () => {
    const lines = selectLines(["greeting", "checkin"], { response: "achieved" });
    expect(lines).toEqual([GREETING_SOMEBODY_LESSON.closingLines[0]]);
  });

  it("accepted closing completes Goal Progress and picks one line from completionMessages", () => {
    const lines = selectLines(["greeting", "checkin", "response"], { closing: "achieved" });
    expect(lines).toHaveLength(1);
    expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(lines[0].en);
    expect(lines[0].zh).toBe("");
  });

  it("an accepted Turn that leaves `greeting` open steers back with one of greeting's needs_retry lines", () => {
    // Non-contiguous Goal Progress — the shape #48's multi-Goal Turns produce:
    // `greeting` has no steer pool of its own, so per docs/ai-configuration.md
    // section 3's Line composition it borrows one of its needs_retry lines as
    // the steer. It must not throw.
    const lines = selectLines([], { checkin: "achieved" });
    expect(lines).toHaveLength(2);
    expect(GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines).toContainEqual(lines[1]);
  });

  describe("the ticket's headline Turn: greeting + checkin + response achieved at once", () => {
    const TICKET_TURN_REPORT: GoalReport = {
      greeting: "achieved",
      checkin: "achieved",
      response: "achieved",
    };

    it("speaks a reaction, then a Closing steer — two lines, in that order", () => {
      const lines = selectLines([], TICKET_TURN_REPORT, true);

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(lines[1]);
      // Never the Check-in pool: Emily must not ask the learner how they are
      // right after they told her.
      expect(GREETING_SOMEBODY_LESSON.checkinLines).not.toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.checkinLines).not.toContainEqual(lines[1]);
    });

    it("picks the didNotAskBack reaction sub-pool when the learner did not ask back", () => {
      const lines = selectLines([], TICKET_TURN_REPORT, false);

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).not.toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(lines[1]);
    });

    it("reacts, says goodbye, then completes when the same Turn also achieves the last Goal", () => {
      // All four Goals in one message, with `closing` already achieved before
      // it: reaction, then the Farewell line (#50's step 3, which the earlier
      // version of this test asserted was still absent), then the Completion
      // pool. See the step 3 `describe` below for the rule itself.
      const lines = selectLines(["closing"], { ...TICKET_TURN_REPORT });

      expect(lines).toHaveLength(3);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(lines[1]);
      expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(lines[2].en);
    });

    it("reacts without repeating itself when `response` is the new Focus Goal", () => {
      // The reaction line is spoken once: it both reacts to `checkin` and
      // steers toward the only Focus Goal left, `response` — so a Turn that
      // achieves just `checkin` (the ordinary one-Goal check-in Turn) still
      // produces exactly one line, the Response-pool line #47 produced.
      const lines = selectLines(["greeting"], { checkin: "achieved" });
      expect(lines).toHaveLength(1);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
    });

    it("steers with response's needs_retry line when `closing` lands while `checkin` is already achieved", () => {
      // Non-contiguous: `response` is the Focus Goal but no reaction is due, so
      // — per section 3 — its needs_retry pool supplies the steer. (For this
      // one case §3 and #47 disagree: #47 sent a `response` Focus Goal to the
      // Response pool, which reacts to a check-in this Turn didn't achieve.
      // See `selectSteerLineForFocusGoal`.)
      const lines = selectLines(["greeting", "checkin"], { closing: "achieved" });
      expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.response.needsRetryLines[0]]);
    });

    it("reacts and steers separately while `greeting` is still the Focus Goal", () => {
      // `greeting` is first in canonical order, so it stays the Focus Goal even
      // though `checkin` and `closing` are now achieved: the reaction is due
      // (checkin landed this Turn) and the steer is greeting's borrowed one.
      const lines = selectLines([], { checkin: "achieved", closing: "achieved" }, false);
      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines).toContainEqual(lines[1]);
    });
  });

  describe("the ask-back reaction: ticket 4's Turn 3 (issue #54, ADR-0013)", () => {
    // The Turn the rule change is about:
    //   Turn 1  Emily: "How are you today?"  Learner: "I'm good."      → checkin
    //   Turn 2  Emily: "That's good!"        Learner: "How about you?" → this
    // `checkin` is already in Goal Progress, so nothing *this* Turn moved it —
    // but the learner put a question to Emily, and she owes them an answer
    // before she steers on. The old rule keyed the reaction to "`checkin`
    // achieved in this Turn" and left her silently steering to Closing, never
    // answering the question.

    it("answers the question back even though `checkin` landed in an earlier Turn", () => {
      const lines = selectLines(["greeting", "checkin"], { response: "achieved" }, true);

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(lines[1]);
      // The reaction is the *asked back* sub-pool — she is answering, not
      // acknowledging a check-in this Turn never carried.
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).not.toContainEqual(lines[0]);
    });

    it("steers with a greeting needs_retry line when `greeting` is still the open Goal", () => {
      const lines = selectLines([], { response: "achieved" }, true);

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines).toContainEqual(lines[1]);
    });

    it("reacts from askedBack and steers from checkinLines while `checkin` is still open", () => {
      // `greeting` achieved (so `checkin` is the Focus Goal), the learner asked
      // back, and `response` is what this Turn achieved. The question back is
      // answered from the askedBack sub-pool, then Emily steers toward the
      // Check-in Goal still open — the Check-in pool supplies *only* the steer:
      // it is not an answer to "How about you?".
      const lines = selectLines(["greeting"], { response: "achieved" }, true);

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.checkinLines).toContainEqual(lines[1]);
      expect(GREETING_SOMEBODY_LESSON.checkinLines).not.toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).not.toContainEqual(lines[1]);
    });

    it("still waits after a plain check-in answer: exactly one line, no steer (unchanged)", () => {
      // The complementary half (ADR-0013, v2 ticket 3): a check-in acknowledged
      // without an ask-back gets one line and no steer toward `response`,
      // because `response` is a question the learner has to decide to ask.
      const lines = selectLines(["greeting"], { checkin: "achieved" }, false);

      expect(lines).toHaveLength(1);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).not.toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.checkinLines).not.toContainEqual(lines[0]);
    });

    it("resolves a self-contradictory report by `learner_asked_back`, not by `response` achieved", () => {
      // ADR-0013 makes `learner_asked_back` the channel the reaction rule
      // reads, because it is the field whose meaning *is* "Emily owes the
      // learner an answer" and it is also what picks the sub-pool — so the two
      // halves of the rule cannot disagree. Both fields come from one model
      // call and the Judge is asked to keep them consistent (`response` is
      // achieved by asking a question back and by nothing else), but a report
      // that credited `response` while reporting no question back is still
      // answerable, and this pins which way it falls: no question back, no
      // answer. Reading `response: "achieved"` instead would speak a
      // didNotAskBack *acknowledgement* at a check-in this Turn never carried —
      // the one thing the sub-pool split exists to prevent.
      const lines = selectLines(["greeting", "checkin"], { response: "achieved" }, false);

      expect(lines).toHaveLength(1);
      expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).not.toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).not.toContainEqual(lines[0]);
    });
  });

  it("walks a whole one-Goal-at-a-time conversation through the same pools as before", () => {
    // The learner-visible behaviour #47 must preserve exactly: greet, answer
    // the check-in, respond, say goodbye — one Goal per Turn, each answer from
    // the pool the old state-machine pointer would have picked, and never more
    // than one line.
    const turns: { report: GoalReport; pool: ScriptLine[] }[] = [
      { report: { greeting: "achieved" }, pool: GREETING_SOMEBODY_LESSON.checkinLines },
      {
        report: { checkin: "achieved" },
        pool: GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack,
      },
      { report: { response: "achieved" }, pool: GREETING_SOMEBODY_LESSON.closingLines },
    ];

    let goalProgress: GoalProgress = [];
    for (const turn of turns) {
      const lines = selectLines(goalProgress, turn.report);
      expect(lines).toHaveLength(1);
      expect(turn.pool).toContainEqual(lines[0]);
      goalProgress = applyGoalReport(goalProgress, turn.report, "accepted");
    }

    const completion = selectLines(goalProgress, { closing: "achieved" });
    expect(completion).toHaveLength(1);
    expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(completion[0].en);
  });

  it("random source spans the full pool (deterministic coverage, not just index 0)", () => {
    const seenTexts = new Set<string>();
    const pool = GREETING_SOMEBODY_LESSON.checkinLines;
    for (let i = 0; i < pool.length; i++) {
      const lines = selectEmilyLinesForTurn(
        GREETING_SOMEBODY_LESSON,
        {
          verdict: "accepted",
          progressBeforeTurn: [],
          goalReport: { greeting: "achieved" },
          learnerAskedBack: false,
        },
        () => i / pool.length,
      );
      seenTexts.add(lines[0].en);
    }
    expect(seenTexts.size).toBe(pool.length);
  });

  describe("step 3 — a Closing line before the Completion line (issue #50)", () => {
    it("says goodbye before completing when `closing` was achieved in an earlier Turn", () => {
      // The ticket's scenario: "Hi! Bye!" cleared greeting and closing two
      // Turns ago, the check-in was answered, and this Turn's "Thanks" clears
      // the last Goal. Practice completes, but `closing` was *not* achieved
      // this Turn — so Emily says goodbye (a Closing-pool line) and only then
      // the Completion line. Since issue #55 both of those are farewells, so
      // the pair reads as two goodbyes, at this fixed random draw ("Have a
      // nice day!" then "Thanks! See you!").
      const lines = selectLines(["greeting", "checkin", "closing"], { response: "achieved" });

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(lines[1].en);
      expect(lines[1].zh).toBe("");
    });

    it("never repeats the Farewell line as the Completion line (issue #55)", () => {
      // Issue #55's re-authoring puts "See you!" in both pools, so step 3 —
      // the one place two pools are drawn from in a row — can pick the same
      // text twice. The random source below is chosen to do exactly that if
      // the selector did not exclude: 0.9 into the Closing pool's 3 lines is
      // "See you!" (index 2), and 0.5 into the Completion pool's 3 lines is
      // also "See you!" (index 1). The invariant this pins is the file-wide
      // one — a Turn never repeats a line — which the exhaustive sweep at the
      // bottom of this file happens not to hit, because its spanning randoms
      // draw the same *index* from pools of the same size.
      const alternatingRandom = (() => {
        const values = [0.9, 0.5];
        let call = 0;
        return () => values[call++ % values.length];
      })();
      const lines = selectEmilyLinesForTurn(
        GREETING_SOMEBODY_LESSON,
        {
          verdict: "accepted",
          progressBeforeTurn: ["greeting", "checkin", "closing"],
          goalReport: { response: "achieved" },
          learnerAskedBack: false,
        },
        alternatingRandom,
      );

      expect(lines).toHaveLength(2);
      expect(lines[0].en).toBe("See you!");
      expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(lines[1].en);
      expect(lines[1].en).not.toBe(lines[0].en);
    });

    it("speaks only the Completion line when `closing` was achieved in this Turn (unchanged)", () => {
      // The ordinary end of a one-Goal-per-Turn conversation: the goodbye *is*
      // this Turn's achievement, so there is nothing left to say it with.
      const lines = selectLines(["greeting", "checkin", "response"], { closing: "achieved" });

      expect(lines).toHaveLength(1);
      expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(lines[0].en);
    });

    it("never says goodbye early: `closing` already in Goal Progress does not add a line until Practice completes", () => {
      // `closing` landed earlier, but Goals are still open — so this Turn's
      // reply is the ordinary composition (here: the reaction to `checkin`,
      // which is also the steer toward `response`), with no Farewell line
      // bolted on. The Closing line is for *completing*, not for having said
      // goodbye at some point.
      const lines = selectLines(["greeting", "closing"], { checkin: "achieved" });

      expect(lines).toHaveLength(1);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.closingLines).not.toContainEqual(lines[0]);
    });
  });
});

/**
 * docs/ai-configuration.md section 3: "Emily never ends a Turn silent: the
 * composition above always yields at least one line" (issue #50's invariant).
 * Checked over every prior-Goal-Progress × Goal-Report pair there is, and for
 * both `learner_asked_back` values, rather than over the shapes this ticket
 * happens to name — the failure mode it guards against is a Goal Progress set
 * some composition branch did not expect, which is exactly what a
 * hand-picked case list cannot rule out.
 */
describe("selectEmilyLinesForTurn — Emily never ends a Turn silent (issue #50)", () => {
  it("gives every `accepted` Turn at least one line, over the whole prior-Progress × Report space", () => {
    let acceptedTurns = 0;
    let needsRetryTurns = 0;

    for (const { progressBeforeTurn, goalReport } of everyPriorProgressAndReport()) {
      for (const learnerAskedBack of [false, true]) {
        const lines = selectLines(progressBeforeTurn, goalReport, learnerAskedBack);
        const label = JSON.stringify({ progressBeforeTurn, goalReport, learnerAskedBack });

        if (deriveVerdict(progressBeforeTurn, goalReport) === "accepted") {
          acceptedTurns += 1;
          expect(lines.length, `an accepted Turn spoke nothing: ${label}`).toBeGreaterThan(0);
        } else {
          // docs/ai-configuration.md section 3: a `needs_retry` Turn is a
          // single line, whatever the report's shape (issue #49).
          needsRetryTurns += 1;
          expect(lines.length, `a needs_retry Turn must be one line: ${label}`).toBe(1);
        }
      }
    }

    // 255 pairs, each run twice (asked back / not); 65 of the pairs are
    // accepted, and with k open Goals a pair is accepted in 2^k - 1 ways
    // (`achieved`/`untouched` each, less the all-`untouched` one). Pinned so
    // a future edit that stops enumerating part of the space is visible here
    // instead of silently shrinking the invariant's coverage.
    expect(acceptedTurns).toBe(130);
    expect(needsRetryTurns).toBe(380);
  });

  it("never speaks an empty line, and never repeats a line within one Turn", () => {
    for (const { progressBeforeTurn, goalReport } of everyPriorProgressAndReport()) {
      // Both `learner_asked_back` values, because the flag changes the sequence
      // shape, not just the sub-pool (issue #54): an ask-back adds a reaction
      // line to Turns where the check-in landed earlier, so the shapes a repeat
      // could hide in are now reachable on this branch too.
      for (const learnerAskedBack of [false, true]) {
        const lines = selectLines(progressBeforeTurn, goalReport, learnerAskedBack);
        const label = JSON.stringify({ progressBeforeTurn, goalReport, learnerAskedBack });
        for (const line of lines) {
          expect(line.en.length, `empty English line: ${label}`).toBeGreaterThan(0);
        }
        // Two Goals can only ever produce two *different* pool lines, and the
        // one case where the same text could plausibly be picked twice — a
        // reaction followed by a steer toward the `response` Goal the reaction
        // itself achieved — is short-circuited precisely so the reaction is
        // not repeated as its own steer. That short-circuit now fires whenever
        // a reaction was spoken at all (issue #54), not only when `checkin`
        // landed in this Turn.
        expect(new Set(lines.map((line) => line.en)).size, `a line was repeated: ${label}`).toBe(
          lines.length,
        );
      }
    }
  });
});

/**
 * Issue #50's "no new audio" criterion (ADR-0005's pre-generated-audio
 * guarantee): every line in every sequence the selector can produce must
 * already be an entry in src/lib/audio-manifest.ts. The runtime resolves a
 * pre-generated file by *exact text*, so a pool line that lost its manifest
 * entry would not fail loudly — src/lib/speech-synthesis.ts would quietly fall
 * back to live/browser synthesis, and the ticket's whole "existing lines only"
 * claim would be false in production while every other test stayed green.
 */
describe("selectEmilyLinesForTurn — every line it can produce already has audio (issue #50)", () => {
  it("covers every sequence over the whole prior-Progress × Report space", () => {
    const cases = everyPriorProgressAndReport();
    const pools = sequencePools(GREETING_SOMEBODY_LESSON);
    const manifestTexts = new Set(AUDIO_MANIFEST.map((entry) => entry.text));
    const spoken = new Set<string>();
    const missing = new Set<string>();
    let sequences = 0;

    for (const { progressBeforeTurn, goalReport } of cases) {
      for (const learnerAskedBack of [false, true]) {
        for (const random of SPANNING_RANDOMS) {
          const lines = selectEmilyLinesForTurn(
            GREETING_SOMEBODY_LESSON,
            {
              verdict: deriveVerdict(progressBeforeTurn, goalReport),
              progressBeforeTurn,
              goalReport,
              learnerAskedBack,
            },
            random,
          );
          sequences += 1;
          for (const line of lines) {
            spoken.add(line.en);
            if (!manifestTexts.has(line.en)) missing.add(line.en);
          }
        }
      }
    }

    // 255 prior-Progress × Report pairs, each swept for both
    // `learner_asked_back` values and once per index of the largest pool a
    // sequence can draw from (3060 sequences today: 255 × 2 × 6, the 6 being
    // the did-not-ask-back Response sub-pool's 6 lines). Read off what the
    // loops above actually iterate (issue #54 replaced the fixed
    // `[0, 0.25, 0.5, 0.75]` sweep with a lesson-derived one, so the count is
    // no longer a 4 any more than it is a 2040) rather than restating a
    // literal: a future edit that drops a position or an asked-back value has
    // to shrink this count with it, and the widths it multiplies are pinned
    // where they belong: the 255 pairs by the exhaustive invariant above, the
    // sweep's 6 by the pool sizes below.
    expect(sequences).toBe(cases.length * 2 * SPANNING_RANDOMS.length);
    expect([...missing]).toEqual([]);
    // Every line in every pool the selector may speak from: Check-in (3), the
    // did-not-ask-back Response sub-pool (6 — v2 ticket 3's table), the
    // asked-back Response sub-pool (4 — the distinct first halves of v2 ticket
    // 4's table), Closing (3 — issue #55 re-authored this from v2 ticket 5's
    // table, which is one line shorter than before), Completion (3), and the
    // four `needs_retry` pools (4 × 3, which serve both retry Turns and the
    // `greeting`/`response` steers) = 31 entries. Pinned as the literal total so
    // a pool quietly losing a line is never invisible, and cross-checked
    // against the live pools so the sweep can never pass by producing too few
    // lines to have checked anything; the per-pool sizes are asserted in their
    // own `describe` below.
    expect(pools.reduce((total, pool) => total + pool.length, 0)).toBe(31);
    // Lines, not entries: 31 entries hold 30 distinct texts since issue #55,
    // because "See you!" is in both the Closing and the Completion pool. The
    // sweep reaches every entry — including both of those, from either side —
    // so this is the count it has to reach, derived from the live pools rather
    // than restated.
    expect(spoken.size).toBe(new Set(sequencePoolTexts(GREETING_SOMEBODY_LESSON)).size);
    expect(spoken.size).toBe(30);
  });
});

/**
 * The pool sizes every other count in this file is computed from (issue #54):
 * ADR-0013 re-authors five of these pools for v2 tickets 2/3/4/6, issue #55
 * re-authors Closing and Completion for v2 ticket 5, and the audio
 * pre-generation covers exactly these entries, so an unintended size change
 * should be visible here — as a named failure — rather than as a smaller
 * `spoken` sweep or a shorter `SPANNING_RANDOMS`.
 */
describe("the Lesson's pool sizes — the composition's whole input space (issues #54/#55)", () => {
  it("has the sizes this file's assertions are computed from", () => {
    const lesson = GREETING_SOMEBODY_LESSON;
    expect(lesson.checkinLines).toHaveLength(3);
    expect(lesson.responseLines.didNotAskBack).toHaveLength(6);
    expect(lesson.responseLines.askedBack).toHaveLength(4);
    expect(lesson.closingLines).toHaveLength(3);
    expect(lesson.completionMessages).toHaveLength(3);
    for (const goal of ACTIVE_CONVERSATION_STATES) {
      expect(lesson.script[goal].needsRetryLines, `${goal}'s needs_retry pool`).toHaveLength(3);
    }
    // The sweep's width follows the largest pool, so the audio sweep above
    // visits 6 indices rather than the 4 a literal `[0, 0.25, 0.5, 0.75]` list
    // covered — pinned here so a shrink of that sweep is visible as a number,
    // not as a test that passes having reached fewer entries.
    expect(SPANNING_RANDOMS).toHaveLength(6);
  });
});

describe("selectSilenceNudge", () => {
  it("picks from the silenceNudgeLines pool", () => {
    const result = selectSilenceNudge(GREETING_SOMEBODY_LESSON, undefined, fixedRandom(0));
    expect(GREETING_SOMEBODY_LESSON.silenceNudgeLines).toContainEqual(result);
  });

  it("never repeats the immediately preceding nudge's text", () => {
    const pool = GREETING_SOMEBODY_LESSON.silenceNudgeLines;
    for (const excluded of pool) {
      for (let i = 0; i < pool.length; i++) {
        const result = selectSilenceNudge(GREETING_SOMEBODY_LESSON, excluded.en, () => i / pool.length);
        expect(result.en).not.toBe(excluded.en);
      }
    }
  });

  it("with no prior nudge, every pool entry is reachable", () => {
    const pool = GREETING_SOMEBODY_LESSON.silenceNudgeLines;
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      seen.add(selectSilenceNudge(GREETING_SOMEBODY_LESSON, undefined, () => i / pool.length).en);
    }
    expect(seen.size).toBe(pool.length);
  });
});
