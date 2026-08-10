import { describe, expect, it } from "vitest";
import { selectEmilyLineForTurn, selectSilenceNudge } from "@/lib/emily-reply-selector";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";

/** Deterministic RNG returning a fixed value every call — picks the pool's first entry via `pickOne`'s floor(). */
function fixedRandom(value: number) {
  return () => value;
}

describe("selectEmilyLineForTurn", () => {
  it("needs_retry stays on the same state and picks from that state's own needsRetryLines pool", () => {
    for (const state of ACTIVE_CONVERSATION_STATES) {
      const result = selectEmilyLineForTurn(GREETING_SOMEBODY_LESSON, state, "needs_retry", false, fixedRandom(0));
      expect(result.resultingState).toBe(state);
      expect(GREETING_SOMEBODY_LESSON.script[state].needsRetryLines).toContainEqual(result.line);
    }
  });

  it("accepted greeting advances to checkin and picks from checkinLines", () => {
    const result = selectEmilyLineForTurn(GREETING_SOMEBODY_LESSON, "greeting", "accepted", false, fixedRandom(0));
    expect(result.resultingState).toBe("checkin");
    expect(GREETING_SOMEBODY_LESSON.checkinLines).toContainEqual(result.line);
  });

  it("accepted checkin with learnerAskedBack=false picks from responseLines.didNotAskBack, never askedBack", () => {
    for (let i = 0; i < 20; i++) {
      const result = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        "checkin",
        "accepted",
        false,
        () => i / 20,
      );
      expect(result.resultingState).toBe("response");
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).toContainEqual(result.line);
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).not.toContainEqual(result.line);
    }
  });

  it("accepted checkin with learnerAskedBack=true always picks from responseLines.askedBack, never didNotAskBack", () => {
    for (let i = 0; i < 20; i++) {
      const result = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        "checkin",
        "accepted",
        true,
        () => i / 20,
      );
      expect(result.resultingState).toBe("response");
      expect(GREETING_SOMEBODY_LESSON.responseLines.askedBack).toContainEqual(result.line);
      expect(GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack).not.toContainEqual(result.line);
    }
  });

  it("accepted response advances to closing and picks from closingLines", () => {
    const result = selectEmilyLineForTurn(GREETING_SOMEBODY_LESSON, "response", "accepted", false, fixedRandom(0));
    expect(result.resultingState).toBe("closing");
    expect(GREETING_SOMEBODY_LESSON.closingLines).toContainEqual(result.line);
  });

  it("accepted closing advances to complete and picks from completionMessages", () => {
    const result = selectEmilyLineForTurn(GREETING_SOMEBODY_LESSON, "closing", "accepted", false, fixedRandom(0));
    expect(result.resultingState).toBe("complete");
    expect(GREETING_SOMEBODY_LESSON.completionMessages).toContain(result.line.en);
  });

  it("passes verdict and learnerAskedBack straight through, unburied", () => {
    const accepted = selectEmilyLineForTurn(GREETING_SOMEBODY_LESSON, "checkin", "accepted", true, fixedRandom(0));
    expect(accepted.verdict).toBe("accepted");
    expect(accepted.learnerAskedBack).toBe(true);

    const retry = selectEmilyLineForTurn(GREETING_SOMEBODY_LESSON, "checkin", "needs_retry", false, fixedRandom(0));
    expect(retry.verdict).toBe("needs_retry");
    expect(retry.learnerAskedBack).toBe(false);
  });

  it("random source spans the full pool (deterministic coverage, not just index 0)", () => {
    const seenTexts = new Set<string>();
    const pool = GREETING_SOMEBODY_LESSON.checkinLines;
    for (let i = 0; i < pool.length; i++) {
      const result = selectEmilyLineForTurn(
        GREETING_SOMEBODY_LESSON,
        "greeting",
        "accepted",
        false,
        () => i / pool.length,
      );
      seenTexts.add(result.line.en);
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
