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
import type { ScriptLine } from "@/content/lesson";

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
 * sequence is ordered and can hold more than one line — a reaction to
 * `checkin` being achieved in this Turn, then a steer toward the new Focus
 * Goal. The single-Goal cases must stay exactly one line, identical to what
 * #47 selected.
 *
 * Issue #49 (section 3's `needs_retry` pool rule): a `needs_retry` Turn's one
 * line comes from the first Goal in canonical order its report marked `failed`
 * — the Focus Goal's only when nothing was `failed`. The `failed` cases are
 * grouped in their own `describe` below.
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
 * RNGs spanning index 0..3 of every pool a sequence can draw from (the largest
 * is 4 lines), so the audio-manifest sweep below reaches every entry the
 * selector is able to speak — not just the pool's first line.
 */
const SPANNING_RANDOMS = [0, 0.25, 0.5, 0.75].map((value) => () => value);

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
      // Never the Check-in pool: Emily must not ask "How are you doing today?"
      // of a learner who just told her.
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
      // the Completion line: "See you! Great job! Let's check your summary."
      const lines = selectLines(["greeting", "checkin", "closing"], { response: "achieved" });

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(lines[1].en);
      expect(lines[1].zh).toBe("");
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
      const lines = selectLines(progressBeforeTurn, goalReport);
      const label = JSON.stringify({ progressBeforeTurn, goalReport });
      for (const line of lines) {
        expect(line.en.length, `empty English line: ${label}`).toBeGreaterThan(0);
      }
      // Two Goals can only ever produce two *different* pool lines, and the
      // one case where the same text could plausibly be picked twice —
      // `response` being the new Focus Goal right after a reaction — is
      // short-circuited precisely so the reaction is not repeated.
      expect(new Set(lines.map((line) => line.en)).size, `a line was repeated: ${label}`).toBe(
        lines.length,
      );
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
    const manifestTexts = new Set(AUDIO_MANIFEST.map((entry) => entry.text));
    const spoken = new Set<string>();
    const missing = new Set<string>();
    let sequences = 0;

    for (const { progressBeforeTurn, goalReport } of everyPriorProgressAndReport()) {
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

    // 255 pairs x asked-back/not x 4 RNG positions: every call produces a
    // sequence, and the RNG sweep reaches index 0..3 of every pool a sequence
    // draws from (the largest is 4 lines).
    expect(sequences).toBe(2040);
    expect([...missing]).toEqual([]);
    // Every line in every pool the selector may speak from: Check-in (3), the
    // two Response sub-pools (3 + 3), Closing (4), Completion (3), and the four
    // `needs_retry` pools (4 x 3, which serve both retry Turns and the
    // `greeting`/`response` steers). Pinned so this sweep can never pass by
    // producing too few lines to have checked anything.
    expect(spoken.size).toBe(28);
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
