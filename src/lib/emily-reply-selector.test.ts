import { describe, expect, it } from "vitest";
import { selectEmilyLineForTurn, selectSilenceNudge } from "@/lib/emily-reply-selector";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import { applyGoalReport, type GoalProgress } from "@/lib/goal-progress";
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
 * apply the Turn's Goal Report to Goal Progress (all-or-nothing), then ask for
 * Emily's line.
 */
describe("selectEmilyLineForTurn", () => {
  it("needs_retry picks from the Focus Goal's own needsRetryLines pool, leaving Goal Progress alone", () => {
    const cases: [GoalProgress, ActiveConversationState][] = [
      [[], "greeting"],
      [["greeting"], "checkin"],
      [["greeting", "checkin"], "response"],
      [["greeting", "checkin", "response"], "closing"],
    ];
    for (const [progressAfterTurn, focusGoal] of cases) {
      const line = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        { verdict: "needs_retry", progressAfterTurn, learnerAskedBack: false },
        fixedRandom(0),
      );
      expect(GREETING_SOMEBODY_LESSON.script[focusGoal].needsRetryLines).toContainEqual(line);
    }
  });

  it("needs_retry keys off the Focus Goal even when the Turn achieved a later Goal and failed another", () => {
    // All-or-nothing: Goal Progress is where it started, so the line is still
    // written for `greeting`, the Focus Goal — not for what the report
    // happened to mark achieved.
    const progressAfterTurn: GoalProgress = [];
    const line = selectEmilyLineForTurn(
      GREETING_SOMEBODY_LESSON,
      { verdict: "needs_retry", progressAfterTurn, learnerAskedBack: false },
      fixedRandom(0),
    );
    expect(GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines).toContainEqual(line);
  });

  it("accepted greeting advances the Focus Goal to checkin and picks from checkinLines", () => {
    const line = selectEmilyLineForTurn(
      GREETING_SOMEBODY_LESSON,
      { verdict: "accepted", progressAfterTurn: ["greeting"], learnerAskedBack: false },
      fixedRandom(0),
    );
    expect(GREETING_SOMEBODY_LESSON.checkinLines).toContainEqual(line);
  });

  it("accepted checkin with learnerAskedBack=false picks from responseLines.didNotAskBack, never askedBack", () => {
    for (let i = 0; i < 20; i++) {
      const line = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        { verdict: "accepted", progressAfterTurn: ["greeting", "checkin"], learnerAskedBack: false },
        () => i / 20,
      );
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(line);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).not.toContainEqual(line);
    }
  });

  it("accepted checkin with learnerAskedBack=true always picks from responseLines.askedBack, never didNotAskBack", () => {
    for (let i = 0; i < 20; i++) {
      const line = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        { verdict: "accepted", progressAfterTurn: ["greeting", "checkin"], learnerAskedBack: true },
        () => i / 20,
      );
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(line);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).not.toContainEqual(line);
    }
  });

  it("accepted response advances the Focus Goal to closing and picks from closingLines", () => {
    const line = selectEmilyLineForTurn(
      GREETING_SOMEBODY_LESSON,
      { verdict: "accepted", progressAfterTurn: ["greeting", "checkin", "response"], learnerAskedBack: false },
      fixedRandom(0),
    );
    expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(line);
  });

  it("an accepted Turn that leaves `greeting` open steers back with one of greeting's needs_retry lines", () => {
    // Non-contiguous Goal Progress (reachable only once a Turn can achieve a
    // later Goal than the Focus Goal — #48's multi-Goal Turns, and #50's
    // steering-back rule): `greeting` has no steer pool of its own, so per
    // docs/ai-configuration.md section 3's Line composition it borrows one of
    // its needs_retry lines as the steer. It must not throw.
    const line = selectEmilyLineForTurn(
      GREETING_SOMEBODY_LESSON,
      { verdict: "accepted", progressAfterTurn: ["checkin"], learnerAskedBack: false },
      fixedRandom(0),
    );
    expect(GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines).toContainEqual(line);
  });

  it("accepted closing completes Goal Progress and picks from completionMessages", () => {
    const line = selectEmilyLineForTurn(
      GREETING_SOMEBODY_LESSON,
      {
        verdict: "accepted",
        progressAfterTurn: ["greeting", "checkin", "response", "closing"],
        learnerAskedBack: false,
      },
      fixedRandom(0),
    );
    expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(line.en);
  });

  it("walks a whole one-Goal-at-a-time conversation through the same pools as before", () => {
    // The learner-visible behaviour #47 must preserve exactly: greet, answer
    // the check-in, respond, say goodbye — one Goal per Turn, each answer from
    // the pool the old state-machine pointer would have picked.
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
      goalProgress = applyGoalReport(goalProgress, turn.report, "accepted");
      const line = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        { verdict: "accepted", progressAfterTurn: goalProgress, learnerAskedBack: false },
        fixedRandom(0),
      );
      expect(turn.pool).toContainEqual(line);
    }

    goalProgress = applyGoalReport(goalProgress, { closing: "achieved" }, "accepted");
    const completion = selectEmilyLineForTurn(
      GREETING_SOMEBODY_LESSON,
      { verdict: "accepted", progressAfterTurn: goalProgress, learnerAskedBack: false },
      fixedRandom(0),
    );
    expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(completion.en);
  });

  it("random source spans the full pool (deterministic coverage, not just index 0)", () => {
    const seenTexts = new Set<string>();
    const pool = GREETING_SOMEBODY_LESSON.checkinLines;
    for (let i = 0; i < pool.length; i++) {
      const line = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        { verdict: "accepted", progressAfterTurn: ["greeting"], learnerAskedBack: false },
        () => i / pool.length,
      );
      seenTexts.add(line.en);
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
