import { describe, expect, it } from "vitest";
import { selectEmilyLinesForTurn, selectSilenceNudge } from "@/lib/emily-reply-selector";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import { applyGoalReport, deriveVerdict, type GoalProgress } from "@/lib/goal-progress";
import type { GoalReport } from "@/lib/practice-turn-protocol";
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

    it("reacts, then completes, when the same Turn also achieves the last Goal", () => {
      // All four Goals in one message: reaction first, then the Completion
      // pool. A Farewell line before it is #50's rule, not this ticket's.
      const lines = selectLines(["closing"], { ...TICKET_TURN_REPORT });

      expect(lines).toHaveLength(2);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(lines[0]);
      expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(lines[1].en);
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
