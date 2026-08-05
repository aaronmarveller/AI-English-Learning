import { test, expect } from "@playwright/test";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import { ASK_IN_CHINESE_HELP, PRACTICE_SCRIPT } from "@/content/practice";

/**
 * Content-layer guard for the Ask-in-Chinese sheet (issue #1: "修复
 * Ask-in-Chinese 示例泄漏标准答案").
 *
 * `ASK_IN_CHINESE_HELP[state].example` is meant to illustrate the KIND of
 * thing to say — never the literal expected answer. `PRACTICE_SCRIPT[state]
 * .acceptedResponses` (src/content/practice.ts) is what the judge LLM treats
 * as example correct answers for that state; if `example` is word-for-word
 * identical to (or contains verbatim) one of those entries, a learner can
 * copy-paste it straight out of the help sheet and get graded "accepted"
 * without ever producing their own English.
 *
 * This spec never touches Playwright's `page` fixture — it just imports the
 * content modules directly and runs a plain assertion — so no browser
 * context is spun up for it; it runs as a normal, fast part of
 * `npm run test:e2e` and fails loudly the moment this invariant regresses.
 */
test.describe("Ask-in-Chinese content — no literal Accepted Response leaks", () => {
  for (const state of ACTIVE_CONVERSATION_STATES) {
    test(`${state}: example does not contain any Accepted Response verbatim`, () => {
      const example = ASK_IN_CHINESE_HELP[state].example.toLowerCase();
      const acceptedResponses = PRACTICE_SCRIPT[state].acceptedResponses;

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
