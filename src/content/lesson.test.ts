import { describe, expect, it } from "vitest";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * Content-layer guard for the Ask-in-Chinese sheet (issue #1: "修复
 * Ask-in-Chinese 示例泄漏标准答案"; moved down from e2e per issue #20 —
 * this content invariant needs no browser, and #12's own "Testing
 * Decisions" section calls this move out explicitly).
 *
 * `GREETING_SOMEBODY_LESSON.chineseHelp[state].example` is meant to
 * illustrate the KIND of thing to say — never the literal expected answer.
 * `GREETING_SOMEBODY_LESSON.script[state].acceptedResponses`
 * (src/content/lesson.ts) is what the judge LLM treats as example correct
 * answers for that state; if `example` is word-for-word identical to (or
 * contains verbatim) one of those entries, a learner can copy-paste it
 * straight out of the help sheet and get graded "accepted" without ever
 * producing their own English.
 */
describe("Ask-in-Chinese content — no literal Accepted Response leaks", () => {
  for (const state of ACTIVE_CONVERSATION_STATES) {
    it(`${state}: example does not contain any Accepted Response verbatim`, () => {
      const example = GREETING_SOMEBODY_LESSON.chineseHelp[state].example.toLowerCase();
      const acceptedResponses = GREETING_SOMEBODY_LESSON.script[state].acceptedResponses;

      for (const phrase of acceptedResponses) {
        const normalizedPhrase = phrase.toLowerCase();
        expect(
          example.includes(normalizedPhrase),
          `ASK_IN_CHINESE_HELP.${state}.example leaks PRACTICE_SCRIPT.${state}.acceptedResponses entry "${phrase}" verbatim`,
        ).toBe(false);
      }
    });
  }
});
