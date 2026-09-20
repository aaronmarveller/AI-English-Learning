import { describe, expect, it } from "vitest";
import { selectEmilyLinesForTurn, selectSilenceReminder } from "@/lib/emily-reply-selector";
import { GREETING_SOMEBODY_LESSON, RECOVERY_UNCLEAR_NUDGE } from "@/content/lesson";
import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import {
  applyGoalReport,
  deriveVerdict,
  unexpectedGoalReportKeys,
  type GoalProgress,
} from "@/lib/goal-progress";
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
 * Issue #49 (section 3's `needs_retry` pool rule): a `needs_retry` Turn speaks
 * for the first Goal in canonical order its report marked `failed` — the Focus
 * Goal's only when nothing was `failed`. Since issue #56 what it speaks is that
 * Goal's **Recovery** (the `needs_retry` describe below), but which Goal it is
 * for is still #49's rule, so those cases stay grouped in their own `describe`.
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
 * exist to keep — a Turn always yields at least one line — is checked
 * exhaustively over the whole prior-Goal-Progress × Goal-Report space, not by
 * named cases: the space is 2⁴ × at most 3⁴ = 256 pairs, cheap enough that "we
 * thought of every shape" is a proof rather than a claim.
 *
 * Issue #55 re-authors the Closing and Completion pools (v2 ticket 5's table),
 * which shrinks both: Closing 4 → 3, Completion still 3 but two of its lines
 * are now shared with Explore's recordings. The counts below are recomputed
 * from the pools, and one new named case pins the hazard the re-authoring
 * introduces — both pools are farewells, so step 3's Farewell line and its
 * Completion line could be the same text.
 *
 * Issue #56 (v2 tickets 8, 10 and 9; ADR-0014) splits the old flat
 * `needsRetryLines` pool in two. A `needs_retry` Turn now speaks a two-tier
 * **Recovery** — tier 1 is a nudge followed by the Goal's question, tier 2
 * (from the second consecutive retry on the Focus Goal) is one direct example
 * — and the old pool survives, in `greeting` and `response` alone, as the
 * borrowed `steerLines`: that field is optional now, and the other two Goals'
 * pools were deleted with their recordings rather than left as content no Turn
 * could speak. The tier is the caller's `focusRetryStreak`, so `selectLines`
 * below defaults it to `0` (the learner's first attempt) and the exhaustive
 * sweeps run every case at both tiers.
 *
 * The helper below mirrors the call site, deriving the Verdict exactly as
 * production derives it (src/lib/goal-progress.ts's `deriveVerdict`).
 */
function selectLines(
  progressBeforeTurn: GoalProgress,
  goalReport: GoalReport,
  learnerAskedBack = false,
  focusRetryStreak = 0,
) {
  return selectEmilyLinesForTurn(
    GREETING_SOMEBODY_LESSON,
    {
      verdict: deriveVerdict(progressBeforeTurn, goalReport),
      progressBeforeTurn,
      goalReport,
      learnerAskedBack,
      focusRetryStreak,
    },
    fixedRandom(0),
  );
}

/**
 * One Goal's Accepted Responses reduced to the words a quoted Recovery line and
 * the whitelist share (issue #56) — the unit ADR-0014 decision 1's reveal rule
 * is really about. Trailing punctuation is exactly what the two sides disagree
 * about: the Response example quotes `How about you?` verbatim, while Closing's
 * writes the same farewells without their exclamation marks
 * (`You can say "See you" or "Take care."`, v2 ticket 10's own wording), so
 * "does this line hand the answer over?" is a question about the words, not
 * about byte equality.
 */
function acceptedResponseCores(goal: ActiveConversationState): string[] {
  return GREETING_SOMEBODY_LESSON.script[goal].acceptedResponses.map((accepted) =>
    accepted.replace(/[.!?]+$/u, ""),
  );
}

/**
 * The Retry Streak values the sweeps below select every Turn with (issue #56):
 * `0` is the learner's first `needs_retry` Turn on the current Focus Goal
 * (tier 1), and anything above is a consecutive retry (tier 2). `1` is the
 * whole of that second case — the tier test is `> 0`, not a count — so two
 * values cover the space.
 */
const FOCUS_RETRY_STREAKS = [0, 1] as const;

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
 * One of the two Goals' borrowed steer pools — the `steerLines` only
 * `greeting` and `response` carry (see `PracticeStateScript.steerLines`).
 * Asserted rather than defaulted to `[]`, and restricted to those two Goals by
 * its parameter type, because *which* Goals carry a pool is the content rule
 * this file's pool list is built on: `checkin` steers from `checkinLines` and
 * `closing` from `closingLines`, so #56's follow-up deleted their pools (six
 * lines, six recordings) instead of leaving content no Turn could speak. A
 * Goal that lost its pool fails here by name; a third Goal that gained one
 * fails at the type level and has to be added to this signature deliberately.
 */
function borrowedSteerLines(goal: "greeting" | "response"): ScriptLine[] {
  const pool = GREETING_SOMEBODY_LESSON.script[goal].steerLines;
  if (pool === undefined) throw new Error(`${goal} carries no borrowed steer pool`);
  return pool;
}

/**
 * Every pool `selectEmilyLinesForTurn` can draw from, in the Lesson whose
 * sizes decide how far the sweep below has to reach. Typed by `length` alone
 * because the Completion pool holds bare strings while every other pool holds
 * `ScriptLine`s.
 *
 * Three groups, all of them reachable from that one function — and since
 * #56's follow-up, together they are also the whole of the Lesson's Script
 * content, with nothing generated that no Turn can speak:
 * - the five named pools the composition's three steps draw from: Check-in,
 *   both Response sub-pools, Closing, Completion;
 * - the six `steerLines` entries of `greeting` and `response` — the two Goals
 *   with no steer pool of their own, so the borrowed steer is the only place
 *   those pools are spent (issue #50; ADR-0014 decision 5);
 * - the Recovery's lines (issue #56): the one shared `unclear` nudge, the two
 *   per-Goal off-topic nudges, the three authored Goal questions and the four
 *   direct examples. The shared nudge is one entry because all four Goals
 *   point at one value (`RECOVERY_UNCLEAR_NUDGE`) — the same reason the audio
 *   manifest emits it once. `checkin`'s Recovery question is not a line of its
 *   own (it is the Check-in pool's, already listed) and `response`'s and
 *   `closing`'s off-topic variants have no nudge at all.
 *
 * `checkin` and `closing` contribute no `steerLines` group because they carry
 * no pool at all — that Goal→pool shape is pinned by this file's pool-size
 * describe, not here.
 */
function sequencePools(lesson: Lesson): readonly { readonly length: number }[] {
  return [
    lesson.checkinLines,
    lesson.responseLines.didNotAskBack,
    lesson.responseLines.askedBack,
    lesson.closingLines,
    lesson.completionMessages,
    borrowedSteerLines("greeting"),
    borrowedSteerLines("response"),
    [RECOVERY_UNCLEAR_NUDGE],
    ...ACTIVE_CONVERSATION_STATES.flatMap((goal) => {
      const recovery = lesson.script[goal].recovery;
      return [
        ...(recovery.offTopicNudge === null ? [] : [[recovery.offTopicNudge]]),
        ...(recovery.question === null ? [] : [[recovery.question]]),
        [recovery.directExample],
      ];
    }),
  ];
}

/**
 * The same pools' English texts, flattened — the *distinct* count of them is
 * what the sweep's `spoken` set below has to reach, and since issue #55 that
 * count is one lower than the number of pool entries: "See you!" is in both
 * the Closing and the Completion pool (both are farewells now). Entry for
 * entry it mirrors `sequencePools` above — the two have to move together for
 * the sweep to mean what it says — and it stays beside it rather than merged
 * into it, because the pools above are typed by `length` alone (the Completion
 * pool holds bare strings) and the sweep's width only ever needs sizes.
 */
function sequencePoolTexts(lesson: Lesson): string[] {
  return [
    ...lesson.checkinLines.map((line) => line.en),
    ...lesson.responseLines.didNotAskBack.map((line) => line.en),
    ...lesson.responseLines.askedBack.map((line) => line.en),
    ...lesson.closingLines.map((line) => line.en),
    ...lesson.completionMessages,
    ...borrowedSteerLines("greeting").map((line) => line.en),
    ...borrowedSteerLines("response").map((line) => line.en),
    RECOVERY_UNCLEAR_NUDGE.en,
    ...ACTIVE_CONVERSATION_STATES.flatMap((goal) => {
      const recovery = lesson.script[goal].recovery;
      return [
        ...(recovery.offTopicNudge === null ? [] : [recovery.offTopicNudge.en]),
        ...(recovery.question === null ? [] : [recovery.question.en]),
        recovery.directExample.en,
      ];
    }),
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
 * have passed, having checked less). Issue #56's Recovery lines are single
 * values rather than alternative picks, so each contributes a one-entry pool
 * and none of them widens the sweep.
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
          focusRetryStreak: 0,
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
          focusRetryStreak: 0,
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

  it("an accepted Turn that leaves `greeting` open steers back with one of greeting's steerLines", () => {
    // Non-contiguous Goal Progress — the shape #48's multi-Goal Turns produce:
    // `greeting` has no steer pool of its own, so per docs/ai-configuration.md
    // section 3's Line composition it borrows one of its steerLines as the
    // steer, which since #56 is the only job that pool has left (ADR-0014
    // decision 5). It must not throw.
    const lines = selectLines([], { checkin: "achieved" });
    expect(lines).toHaveLength(2);
    expect(borrowedSteerLines("greeting")).toContainEqual(lines[1]);
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

    it("steers with a response steerLines entry when `closing` lands while `checkin` is already achieved", () => {
      // Non-contiguous: `response` is the Focus Goal but no reaction is due, so
      // — per section 3 — its steerLines supply the steer. (For this one case
      // §3 and #47 disagree: #47 sent a `response` Focus Goal to the Response
      // pool, which reacts to a check-in this Turn didn't achieve. See
      // `selectSteerLineForFocusGoal`.)
      const lines = selectLines(["greeting", "checkin"], { closing: "achieved" });
      expect(lines).toEqual([borrowedSteerLines("response")[0]]);
    });

    it("reacts and steers separately while `greeting` is still the Focus Goal", () => {
      // `greeting` is first in canonical order, so it stays the Focus Goal even
      // though `checkin` and `closing` are now achieved: the reaction is due
      // (checkin landed this Turn) and the steer is greeting's borrowed one.
      const lines = selectLines([], { checkin: "achieved", closing: "achieved" }, false);
      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(borrowedSteerLines("greeting")).toContainEqual(lines[1]);
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

    it("steers with a greeting steerLines entry when `greeting` is still the open Goal", () => {
      const lines = selectLines([], { response: "achieved" }, true);

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(lines[0]);
      expect(borrowedSteerLines("greeting")).toContainEqual(lines[1]);
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
          focusRetryStreak: 0,
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
          focusRetryStreak: 0,
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

  /**
   * Issue #56 (v2 tickets 8 and 10; docs/ai-configuration.md section 3's
   * "Recovery"; ADR-0014): what a `needs_retry` Turn speaks, instead of one
   * line from the flat pool it used to. Two tiers, chosen by the learner's
   * Retry Streak — `focusRetryStreak > 0` means the learner is on their second
   * consecutive retry of the current Focus Goal.
   *
   * Which Goal's Recovery it is stays #49's rule (the `describe` right after
   * this one); what the tier and the Goal Report decide is the *shape*:
   * tier 1 is a nudge followed by the Goal's question, tier 2 is the Goal's
   * direct example and nothing else. Tier 1 is two lines rather than the one
   * combined sentence v2 ticket 10's table writes ("Let's keep going. How are
   * you today?") because the question half already exists as the Goal's
   * question, and re-authoring it would be the composed line ADR-0013
   * decision 2 rejects (ADR-0014 decision 2).
   */
  describe("needs_retry speaks a two-tier Recovery (issue #56)", () => {
    describe("tier 1 — the nudge, then the Goal's question", () => {
      it("opens with the shared unclear nudge, then the Goal's authored question, when an open Goal failed", () => {
        const cases: [GoalProgress, GoalReport, "greeting" | "response" | "closing"][] = [
          [[], { greeting: "failed" }, "greeting"],
          [["greeting", "checkin"], { response: "failed" }, "response"],
          [["greeting", "checkin", "response"], { closing: "failed" }, "closing"],
        ];

        for (const [progressBeforeTurn, goalReport, goal] of cases) {
          const recovery = GREETING_SOMEBODY_LESSON.script[goal].recovery;
          const lines = selectLines(progressBeforeTurn, goalReport);

          expect(lines, `${goal}: a tier-1 Recovery is two lines`).toHaveLength(2);
          // One sentence in all four of v2 ticket 8's rows, so the Goal's own
          // `unclearNudge` is the shared value rather than a copy (which is
          // also why the manifest can give it one recording).
          expect(lines[0]).toEqual(recovery.unclearNudge);
          expect(lines[0]).toEqual(RECOVERY_UNCLEAR_NUDGE);
          expect(lines[1]).toEqual(recovery.question);
        }
      });

      it("asks the Check-in Goal with the Check-in pool's own question, because it authors none", () => {
        // `checkin` is the one Goal whose Recovery question is `null`, and only
        // it: the question already exists as the Check-in steer pool ("How are
        // you today?"), so ADR-0014 decision 2 keeps that pool the single
        // source of the wording instead of authoring a second copy — the same
        // pool an `accepted` Turn steers with, one Goal asked for one way.
        const recovery = GREETING_SOMEBODY_LESSON.script.checkin.recovery;
        expect(recovery.question).toBeNull();

        const lines = selectLines(["greeting"], { checkin: "failed" });

        expect(lines).toHaveLength(2);
        expect(lines[0]).toEqual(RECOVERY_UNCLEAR_NUDGE);
        expect(GREETING_SOMEBODY_LESSON.checkinLines).toContainEqual(lines[1]);
        expect(lines[1]).toEqual(GREETING_SOMEBODY_LESSON.checkinLines[0]);
      });

      it("opens with the Goal's off-topic nudge when nothing was attempted, or with the question alone where the table authors none", () => {
        const lesson = GREETING_SOMEBODY_LESSON;
        const greeting = lesson.script.greeting.recovery;
        const checkin = lesson.script.checkin.recovery;
        const response = lesson.script.response.recovery;
        const closing = lesson.script.closing.recovery;

        // Two Goals author an off-topic nudge (v2 ticket 10's "First Redirect"
        // column), so their recoveries are a pair: the nudge, then the question.
        expect(selectLines([], {})).toEqual([greeting.offTopicNudge, greeting.question]);
        expect(selectLines(["greeting"], {})).toEqual([checkin.offTopicNudge, lesson.checkinLines[0]]);

        // The other two author none, so the question is the whole of their
        // first redirect — never a nudge borrowed from another Goal, which
        // would be the composed line ADR-0014 decision 2 rejects one level down.
        expect(response.offTopicNudge).toBeNull();
        expect(closing.offTopicNudge).toBeNull();
        expect(selectLines(["greeting", "checkin"], {})).toEqual([response.question]);
        expect(selectLines(["greeting", "checkin", "response"], {})).toEqual([closing.question]);
      });

      it("never names an Accepted Response, on either variant (ADR-0014 decision 1)", () => {
        // Tier 1's rule, and the part of it that survived section 1's Global
        // Constraint: the learner gets another chance at the Goal, never the
        // answer. Both tier-1 variants are swept — the `failed` report
        // (`unclear`) and the untouched one (off-topic) — for every Goal, and
        // "names" includes quoting: a line that merely *contained* an Accepted
        // Response is the hazard the tier boundary exists to keep on tier 2's
        // side (see the tier-2 counterpart below).
        const progressBeforeGoal: GoalProgress[] = [
          [],
          ["greeting"],
          ["greeting", "checkin"],
          ["greeting", "checkin", "response"],
        ];
        const failedReports: GoalReport[] = [
          { greeting: "failed" },
          { checkin: "failed" },
          { response: "failed" },
          { closing: "failed" },
        ];

        for (const [index, goal] of ACTIVE_CONVERSATION_STATES.entries()) {
          for (const goalReport of [{}, failedReports[index] satisfies GoalReport]) {
            const lines = selectLines(progressBeforeGoal[index], goalReport);
            expect(lines.length, `${goal}: a tier-1 Recovery speaks`).toBeLessThanOrEqual(2);
            for (const line of lines) {
              for (const accepted of acceptedResponseCores(goal)) {
                expect(line.en, `${goal}'s tier-1 line names "${accepted}": ${line.en}`).not.toContain(
                  accepted,
                );
              }
            }
          }
        }
      });
    });

    describe("tier 2 — one direct example, whatever the report says", () => {
      it("speaks only the retry Goal's direct example, whichever Goal it is and whatever the Turn attempted", () => {
        const lesson = GREETING_SOMEBODY_LESSON;
        const cases: {
          progressBeforeTurn: GoalProgress;
          goalReport: GoalReport;
          goal: ActiveConversationState;
        }[] = [
          // The off-topic report (nothing attempted) and the `failed` one, for
          // each of the four Goals in turn.
          { progressBeforeTurn: [], goalReport: {}, goal: "greeting" },
          { progressBeforeTurn: [], goalReport: { greeting: "failed" }, goal: "greeting" },
          { progressBeforeTurn: ["greeting"], goalReport: {}, goal: "checkin" },
          {
            progressBeforeTurn: ["greeting"],
            goalReport: { checkin: "failed" },
            goal: "checkin",
          },
          { progressBeforeTurn: ["greeting", "checkin"], goalReport: {}, goal: "response" },
          {
            progressBeforeTurn: ["greeting", "checkin"],
            goalReport: { response: "failed" },
            goal: "response",
          },
          { progressBeforeTurn: ["greeting", "checkin", "response"], goalReport: {}, goal: "closing" },
          {
            progressBeforeTurn: ["greeting", "checkin", "response"],
            goalReport: { closing: "failed" },
            goal: "closing",
          },
        ];

        for (const { progressBeforeTurn, goalReport, goal } of cases) {
          const lines = selectLines(progressBeforeTurn, goalReport, false, 1);

          // The whole reply, and nothing after it: tier 2 asks no question
          // (ADR-0014 decision 1 — the tenth nudge is not what a stuck learner
          // needs, so the example replaces the tier-1 pair outright).
          expect(lines, `${goal}: tier 2 is one line`).toHaveLength(1);
          expect(lines).toEqual([lesson.script[goal].recovery.directExample]);
        }
      });

      it("is the tier that hands the answer over: each Goal's example quotes one of its Accepted Responses", () => {
        // The positive half of ADR-0014 decision 1, and the reason the tier-1
        // test above is worth writing: the reveal is deliberate here and only
        // here. A Goal whose example stopped quoting one would be a silent
        // regression of the tier-2 contract, not a wording tweak.
        for (const goal of ACTIVE_CONVERSATION_STATES) {
          const example = GREETING_SOMEBODY_LESSON.script[goal].recovery.directExample;
          const quotesAnAcceptedResponse = acceptedResponseCores(goal).some((accepted) =>
            example.en.includes(accepted),
          );

          expect(quotesAnAcceptedResponse, `${goal}'s direct example quotes no Accepted Response`).toBe(
            true,
          );
        }
      });

      it("keeps the shared unclear nudge out of tier 2: the example is never preceded by a nudge", () => {
        // `[nudge, example]` would be three lines' worth of apology for a
        // learner who has already been nudged once — the upper bound the
        // exhaustive line-count check at the bottom of this file enforces for
        // every report shape.
        const lines = selectLines([], { greeting: "failed" }, false, 1);

        expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.greeting.recovery.directExample]);
        expect(lines).not.toContainEqual(RECOVERY_UNCLEAR_NUDGE);
      });
    });

    /**
     * Issue #49's rule, which #56 does not change: a `needs_retry` Turn points
     * at the first Goal in canonical order the report marked `failed`, or at
     * the Focus Goal when nothing was `failed`. What changed is what that Goal
     * is used for — its Recovery now, rather than one flat pool line — and the
     * mixed Turn is where the two readings of the report have to agree: which
     * Goal the Recovery talks about (`selectRecoveryGoal`) and whether the
     * Turn attempted anything (`unclear` versus off-topic) are both read over
     * the *open* Goals only.
     */
    describe("the Recovery's Goal is the first failed Goal (issue #49, unchanged)", () => {
      it("answers the failed Goal, not the Focus Goal: Focus Goal checkin, but closing failed", () => {
        // The ticket's example — "I'm fine. See you later alligator crocodile"
        // against a Focus Goal of Check-in. `checkin` was achieved, `closing`
        // failed, all-or-nothing leaves Goal Progress at ["greeting"], and both
        // halves of the Recovery have to be Closing's: the nudge points at the
        // goodbye the learner did not get, and the question asks for it — never
        // at the check-in they just got right.
        const lines = selectLines(["greeting"], { checkin: "achieved", closing: "failed" });

        expect(lines).toEqual([
          GREETING_SOMEBODY_LESSON.script.closing.recovery.unclearNudge,
          GREETING_SOMEBODY_LESSON.script.closing.recovery.question,
        ]);
        // Not Check-in's question, and not the pool that asks it ("How are you
        // today?") — Emily does not ask how the learner is right after they
        // told her.
        expect(GREETING_SOMEBODY_LESSON.checkinLines).not.toContainEqual(lines[1]);
        expect(lines).not.toContainEqual(GREETING_SOMEBODY_LESSON.script.checkin.recovery.directExample);
      });

      it("hands over the Closing direct example at tier 2, still not Check-in's", () => {
        const lines = selectLines(["greeting"], { checkin: "achieved", closing: "failed" }, false, 1);

        expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.closing.recovery.directExample]);
        expect(lines).not.toContainEqual(GREETING_SOMEBODY_LESSON.script.checkin.recovery.directExample);
      });

      it("uses a failed Goal's Recovery even when the Focus Goal itself was left untouched", () => {
        // Check-in (the Focus Goal) was not attempted at all; `response` was
        // attempted and missed. "Untouched" is not a failure, so the Recovery
        // is `response`'s even though `response` is the later Goal.
        const lines = selectLines(["greeting"], { checkin: "untouched", response: "failed" });

        expect(lines).toEqual([
          GREETING_SOMEBODY_LESSON.script.response.recovery.unclearNudge,
          GREETING_SOMEBODY_LESSON.script.response.recovery.question,
        ]);
        expect(GREETING_SOMEBODY_LESSON.checkinLines).not.toContainEqual(lines[1]);
      });

      it("takes the earliest failed Goal in canonical order when a Turn fails several", () => {
        // Canonical order is greeting → checkin → response → closing: `response`
        // wins over `closing` however the report happens to be keyed, so the
        // next Turn's retry starts on the earliest Goal still wrong.
        const lines = selectLines([], { closing: "failed", response: "failed" });

        expect(lines).toEqual([
          GREETING_SOMEBODY_LESSON.script.response.recovery.unclearNudge,
          GREETING_SOMEBODY_LESSON.script.response.recovery.question,
        ]);
        expect(lines).not.toContainEqual(
          GREETING_SOMEBODY_LESSON.script.closing.recovery.directExample,
        );
      });

      it("never lets a `failed` key outside the open Goals pick the Goal or flip the variant", () => {
        // The Judge is only asked about open Goals (ADR-0012), so a report key
        // naming an already-achieved Goal neither fails the Turn nor moves
        // Emily's line — Goal Progress decides which Goals the report is read
        // against, and `unexpectedGoalReportKeys` is where the rest of the app
        // says the same thing (`response` is the Focus Goal here, not
        // `greeting`).
        const progressBeforeTurn: GoalProgress = ["greeting", "checkin"];
        const goalReport: GoalReport = { greeting: "failed" };

        expect(deriveVerdict(progressBeforeTurn, goalReport)).toBe("needs_retry");
        expect(unexpectedGoalReportKeys(progressBeforeTurn, goalReport)).toEqual(["greeting"]);

        // Nothing *open* was attempted, so this is the off-topic variant, and
        // `response` authors no off-topic nudge: the question is the whole
        // Recovery. A `failed` on an achieved Goal must not turn it into the
        // unclear variant.
        const lines = selectLines(progressBeforeTurn, goalReport);
        expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.response.recovery.question]);
      });

      it("falls back to the Focus Goal's Recovery when every open Goal was untouched", () => {
        // Off-topic chatter touches no Goal (docs/ai-configuration.md section
        // 4): nothing failed, so this is the Focus Goal's own Recovery — and
        // `response`, having no off-topic nudge, opens straight onto its
        // question.
        const lines = selectLines(["greeting", "checkin"], {
          response: "untouched",
          closing: "untouched",
        });

        expect(lines).toEqual([GREETING_SOMEBODY_LESSON.script.response.recovery.question]);
      });
    });
  });
});

/**
 * docs/ai-configuration.md section 3: "Emily never ends a Turn silent: the
 * composition above always yields at least one line" (issue #50's invariant).
 * Checked over every prior-Goal-Progress × Goal-Report pair there is, and for
 * both `learner_asked_back` values and both Retry Streak tiers (issue #56 —
 * a `needs_retry` Turn is not composed like an `accepted` one, so the tier-2
 * branch needs the same treatment), rather than over the shapes this ticket
 * happens to name — the failure mode it guards against is a Goal Progress set
 * some composition branch did not expect, which is exactly what a hand-picked
 * case list cannot rule out.
 */
describe("selectEmilyLinesForTurn — Emily never ends a Turn silent (issue #50)", () => {
  it("gives every Turn at least one line: the composition for `accepted`, the Recovery for `needs_retry`", () => {
    let acceptedTurns = 0;
    let needsRetryTurns = 0;

    for (const { progressBeforeTurn, goalReport } of everyPriorProgressAndReport()) {
      for (const learnerAskedBack of [false, true]) {
        // Counted per (prior Progress, Report, asked-back) — the Retry Streak
        // changes what a `needs_retry` Turn *says*, never which Verdict a pair
        // derives — so the totals below stay the 130/380 they have always been.
        const verdict = deriveVerdict(progressBeforeTurn, goalReport);
        if (verdict === "accepted") acceptedTurns += 1;
        else needsRetryTurns += 1;

        for (const focusRetryStreak of FOCUS_RETRY_STREAKS) {
          const lines = selectLines(
            progressBeforeTurn,
            goalReport,
            learnerAskedBack,
            focusRetryStreak,
          );
          const label = JSON.stringify({
            progressBeforeTurn,
            goalReport,
            learnerAskedBack,
            focusRetryStreak,
          });

          expect(lines.length, `a Turn spoke nothing: ${label}`).toBeGreaterThan(0);
          if (verdict === "needs_retry") {
            if (focusRetryStreak > 0) {
              // Tier 2 is the direct example and nothing else (issue #56).
              expect(lines.length, `tier 2 is one line: ${label}`).toBe(1);
            } else {
              // Tier 1 is the nudge and the question, or the question alone
              // where the Goal's row authors no nudge (`response`, `closing`)
              // — never more, because it is a sequence of existing lines rather
              // than the composed sentence ADR-0014 decision 2 rejects.
              expect(lines.length, `tier 1 is one or two lines: ${label}`).toBeLessThanOrEqual(2);
            }
          }
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
      // could hide in are now reachable on this branch too. Both tiers, for the
      // same reason on the Recovery's side (issue #56).
      for (const learnerAskedBack of [false, true]) {
        for (const focusRetryStreak of FOCUS_RETRY_STREAKS) {
          const lines = selectLines(
            progressBeforeTurn,
            goalReport,
            learnerAskedBack,
            focusRetryStreak,
          );
          const label = JSON.stringify({
            progressBeforeTurn,
            goalReport,
            learnerAskedBack,
            focusRetryStreak,
          });
          for (const line of lines) {
            expect(line.en.length, `empty English line: ${label}`).toBeGreaterThan(0);
          }
          // Two or three Goals can only ever produce that many *different* pool
          // lines, and the one case where the same text could plausibly be
          // picked twice — a reaction followed by a steer toward the `response`
          // Goal the reaction itself achieved — is short-circuited precisely so
          // the reaction is not repeated as its own steer. That short-circuit
          // fires whenever a reaction was spoken at all (issue #54), not only
          // when `checkin` landed in this Turn. Tier 1 is the same rule one
          // level down: the nudge and the Goal's question are different texts
          // for every Goal.
          expect(new Set(lines.map((line) => line.en)).size, `a line was repeated: ${label}`).toBe(
            lines.length,
          );
        }
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
 *
 * Issue #56 widens "every line" by the Recovery's ten entries and renames the
 * twelve steer ids, so the sweep runs at both Retry Streak tiers: tier 1 can
 * reach the nudges and questions, tier 2 only the direct examples, and both
 * are manifest entries.
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
          for (const focusRetryStreak of FOCUS_RETRY_STREAKS) {
            const lines = selectEmilyLinesForTurn(
              GREETING_SOMEBODY_LESSON,
              {
                verdict: deriveVerdict(progressBeforeTurn, goalReport),
                progressBeforeTurn,
                goalReport,
                learnerAskedBack,
                focusRetryStreak,
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
    }

    // 255 prior-Progress × Report pairs, each swept for both
    // `learner_asked_back` values, once per index of the largest pool a
    // sequence can draw from, and at both Retry Streak tiers (issue #56) —
    // 6120 sequences today: 255 × 2 × 6 × 2, the 6 being the did-not-ask-back
    // Response sub-pool's 6 lines. Read off what the loops above actually
    // iterate (issue #54 replaced the fixed `[0, 0.25, 0.5, 0.75]` sweep with
    // a lesson-derived one, so the count is no longer a 4 any more than it is
    // a 2040) rather than restating a literal: a future edit that drops a
    // position, an asked-back value or a tier has to shrink this count with
    // it, and the widths it multiplies are pinned where they belong: the 255
    // pairs by the exhaustive invariant above, the sweep's 6 by the pool sizes
    // below.
    expect(sequences).toBe(cases.length * 2 * SPANNING_RANDOMS.length * FOCUS_RETRY_STREAKS.length);
    expect([...missing]).toEqual([]);
    // Every line in every pool the selector may speak from (see
    // `sequencePools`): Check-in (3), the did-not-ask-back Response sub-pool
    // (6 — v2 ticket 3's table), the asked-back Response sub-pool (4 — the
    // distinct first halves of v2 ticket 4's table), Closing (3 — issue #55
    // re-authored this from v2 ticket 5's table, which is one line shorter than
    // before), Completion (3), `greeting`'s and `response`'s steerLines (3 + 3
    // — the borrowed steers issue #50 ratified, and the only two Goals that
    // carry a pool), and issue #56's Recovery lines (the one shared unclear
    // nudge, 2 off-topic nudges, 3 authored questions and 4 direct examples)
    // = 35 entries. Pinned as the literal total so a pool quietly losing a line
    // is never invisible, and cross-checked against the live pools so the sweep
    // can never pass by producing too few lines to have checked anything; the
    // per-pool sizes are asserted in their own `describe` below.
    expect(pools.reduce((total, pool) => total + pool.length, 0)).toBe(35);
    // Lines, not entries: 35 entries hold 34 distinct texts since issue #55,
    // because "See you!" is in both the Closing and the Completion pool. The
    // sweep reaches every entry — including both of those, from either side —
    // so this is the count it has to reach, derived from the live pools rather
    // than restated. Since #56's follow-up this is also the whole of the
    // Lesson's Script content: no pool is generated that no Turn can speak.
    expect(spoken.size).toBe(new Set(sequencePoolTexts(GREETING_SOMEBODY_LESSON)).size);
    expect(spoken.size).toBe(34);
  });
});

/**
 * The pool sizes every other count in this file is computed from (issue #54):
 * ADR-0013 re-authors five of these pools for v2 tickets 2/3/4/6, issue #55
 * re-authors Closing and Completion for v2 ticket 5, issue #56 adds the
 * Recovery and turns `needsRetryLines` into the optional, `greeting`/
 * `response`-only `steerLines` — and the audio pre-generation covers exactly
 * these entries, so an unintended size change should be visible here — as a
 * named failure — rather than as a smaller `spoken` sweep or a shorter
 * `SPANNING_RANDOMS`.
 */
describe("the Lesson's pool sizes — the composition's whole input space (issues #54/#55/#56)", () => {
  it("has the sizes this file's assertions are computed from", () => {
    const lesson = GREETING_SOMEBODY_LESSON;
    expect(lesson.checkinLines).toHaveLength(3);
    expect(lesson.responseLines.didNotAskBack).toHaveLength(6);
    expect(lesson.responseLines.askedBack).toHaveLength(4);
    expect(lesson.closingLines).toHaveLength(3);
    expect(lesson.completionMessages).toHaveLength(3);
    for (const goal of ACTIVE_CONVERSATION_STATES) {
      // The two lines of a Recovery every Goal has: the shared tier-1 nudge,
      // which is one *value* rather than four copies of the text (the manifest
      // relies on that and gives it a single recording), and a tier-2 direct
      // example of its own.
      expect(lesson.script[goal].recovery.unclearNudge, `${goal}'s unclear nudge`).toBe(
        RECOVERY_UNCLEAR_NUDGE,
      );
      expect(
        lesson.script[goal].recovery.directExample.en.length,
        `${goal}'s direct example`,
      ).toBeGreaterThan(0);
    }
    // The tier-1 table's two asymmetries (ADR-0014 decision 2), which are what
    // the selector's `null` branches exist for: only two Goals author an
    // off-topic nudge, and `checkin` alone authors no question of its own —
    // it reuses the Check-in pool's. A new `null` (or a filled-in one) changes
    // which pool a Recovery draws from, so it belongs in this list rather than
    // in a comment.
    expect(
      ACTIVE_CONVERSATION_STATES.filter(
        (goal) => lesson.script[goal].recovery.offTopicNudge !== null,
      ),
    ).toEqual(["greeting", "checkin"]);
    expect(
      ACTIVE_CONVERSATION_STATES.filter((goal) => lesson.script[goal].recovery.question !== null),
    ).toEqual(["greeting", "response", "closing"]);
    // The sweep's width follows the largest pool, so the audio sweep above
    // visits 6 indices rather than the 4 a literal `[0, 0.25, 0.5, 0.75]` list
    // covered — pinned here so a shrink of that sweep is visible as a number,
    // not as a test that passes having reached fewer entries.
    expect(SPANNING_RANDOMS).toHaveLength(6);
  });

  it("carries a borrowed steer pool on `greeting` and `response` only — `checkin`'s and `closing`'s are deleted, not overlooked", () => {
    // The Goal→pool shape `steerLines` being optional encodes: only the two
    // Goals with no steer pool of their own borrow one (`selectSteerLineForFocusGoal`),
    // and `checkin`/`closing` steer from `checkinLines`/`closingLines` instead.
    // #56's follow-up deleted their pools outright — six lines and six
    // recordings that only looked reachable — so their absence here is a
    // deliberate content decision, and a Goal that grew one back would need
    // audio generated for it before any Turn could speak it. That is why the
    // deletion is pinned as a named failure rather than left to the sweep: a
    // pool nothing can draw from is exactly the kind of content this file
    // exists to keep visible.
    const lesson = GREETING_SOMEBODY_LESSON;
    for (const goal of ["greeting", "response"] as const) {
      expect(lesson.script[goal].steerLines, `${goal}'s borrowed steer pool`).toHaveLength(3);
    }
    for (const goal of ["checkin", "closing"] as const) {
      expect(
        lesson.script[goal].steerLines,
        `${goal} steers from its own pool, so it must carry no steerLines`,
      ).toBeUndefined();
    }
  });
});

/**
 * Issue #56 (v2 ticket 9; docs/ai-configuration.md section 3's "Silence
 * reminder"; ADR-0014 decisions 3 and 6): what Emily says when the learner has
 * gone quiet is no longer one bare pool line. It is the nudge followed by the
 * Focus Goal's question — "Take your time. How are you today?" is the ticket's
 * own example — because the question is the Goal's, already authored, and the
 * steer pools stay its single source.
 *
 * The nudge is still the only half the never-twice-in-a-row rule tracks, so
 * the two readings come back separately: `nudge` is what the caller keeps as
 * `lastNudgeText`, `lines` is what it speaks and persists as one Turn.
 */
describe("selectSilenceReminder", () => {
  it("speaks the nudge followed by the Focus Goal's Recovery question", () => {
    const lesson = GREETING_SOMEBODY_LESSON;
    const nudge = lesson.silenceNudgeLines[0];

    // `greeting` is the Goal being asked for, so its authored question follows.
    expect(selectSilenceReminder(lesson, "greeting", undefined, fixedRandom(0))).toEqual({
      nudge,
      lines: [nudge, lesson.script.greeting.recovery.question],
    });
    // `response` likewise, and `closing` — whose question is the one authored
    // *against* its steer rather than reused from it, because the Closing pool
    // says goodbye itself and cannot ask the learner to.
    expect(selectSilenceReminder(lesson, "response", undefined, fixedRandom(0))).toEqual({
      nudge,
      lines: [nudge, lesson.script.response.recovery.question],
    });
    expect(selectSilenceReminder(lesson, "closing", undefined, fixedRandom(0))).toEqual({
      nudge,
      lines: [nudge, lesson.script.closing.recovery.question],
    });
    // ...and never one of the pool's farewells, which would end the
    // conversation rather than ask for the goodbye.
    expect(lesson.closingLines).not.toContainEqual(lesson.script.closing.recovery.question);
  });

  it("asks the Check-in Goal with the Check-in pool's question, exactly as its Recovery does", () => {
    // The `checkin` case by name, because section 3's own example is the
    // Check-in one: the Goal authors no question (`question` is `null`), so
    // both the reminder and the tier-1 Recovery ask it out of the pool Emily
    // asked it from in the first place.
    const lesson = GREETING_SOMEBODY_LESSON;
    expect(lesson.script.checkin.recovery.question).toBeNull();

    const reminder = selectSilenceReminder(lesson, "checkin", undefined, fixedRandom(0));

    expect(reminder.lines).toHaveLength(2);
    expect(lesson.checkinLines).toContainEqual(reminder.lines[1]);
    expect(reminder.lines[1]).toEqual(lesson.checkinLines[0]);
  });

  it("never speaks tier 2's wording: a reminder is not a retry", () => {
    // ADR-0014 decision 6: silence is not a failed attempt, so the Retry Streak
    // is deliberately not consulted and a quiet learner never hears the direct
    // example — a reminder stays on the safe side of section 1's reveal rule
    // by construction. Also worth pinning: no reminder line quotes an Accepted
    // Response, the same rule tier 1 keeps.
    const lesson = GREETING_SOMEBODY_LESSON;

    for (const goal of ACTIVE_CONVERSATION_STATES) {
      const reminder = selectSilenceReminder(lesson, goal, undefined, fixedRandom(0));

      expect(reminder.lines).not.toContainEqual(lesson.script[goal].recovery.directExample);
      for (const line of reminder.lines) {
        for (const accepted of acceptedResponseCores(goal)) {
          expect(line.en, `${goal}'s reminder names "${accepted}": ${line.en}`).not.toContain(accepted);
        }
      }
    }
  });

  it("picks the nudge from the silenceNudgeLines pool", () => {
    const reminder = selectSilenceReminder(
      GREETING_SOMEBODY_LESSON,
      "greeting",
      undefined,
      fixedRandom(0),
    );
    expect(GREETING_SOMEBODY_LESSON.silenceNudgeLines).toContainEqual(reminder.nudge);
    expect(reminder.lines[0]).toEqual(reminder.nudge);
  });

  it("never repeats the immediately preceding nudge's text, and leaves the question alone", () => {
    const pool = GREETING_SOMEBODY_LESSON.silenceNudgeLines;
    const question = GREETING_SOMEBODY_LESSON.script.greeting.recovery.question;
    for (const excluded of pool) {
      for (let i = 0; i < pool.length; i++) {
        const reminder = selectSilenceReminder(
          GREETING_SOMEBODY_LESSON,
          "greeting",
          excluded.en,
          () => i / pool.length,
        );
        expect(reminder.nudge.en).not.toBe(excluded.en);
        // The rule tracks the nudge only (issue #56): the question after it is
        // the Focus Goal's, not part of the pool the exclusion filters.
        expect(reminder.lines[1]).toEqual(question);
      }
    }
  });

  it("with no prior nudge, every pool entry is reachable", () => {
    const pool = GREETING_SOMEBODY_LESSON.silenceNudgeLines;
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      seen.add(
        selectSilenceReminder(GREETING_SOMEBODY_LESSON, "greeting", undefined, () => i / pool.length)
          .nudge.en,
      );
    }
    expect(seen.size).toBe(pool.length);
  });
});
