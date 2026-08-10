import { describe, expect, it } from "vitest";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import {
  CLOSING_TEMPLATES,
  GENERIC_GROWTH_SUGGESTION_TEMPLATES,
  GENERIC_HIGHLIGHT_TEMPLATES,
  HIGHLIGHT_TEMPLATES,
  NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES,
  PRAISE_TEMPLATES,
} from "@/content/review";

const CONTAINS_CHINESE = /[\u3400-\u9fff]/u;
const CONTAINS_ENGLISH_LETTER = /[A-Za-z]/u;

function conversationScriptEnglishLines(): string[] {
  const lesson = GREETING_SOMEBODY_LESSON;
  return [
    ...lesson.openingLines.map((line) => line.en),
    ...lesson.checkinLines.map((line) => line.en),
    ...lesson.responseLines.didNotAskBack.map((line) => line.en),
    ...lesson.responseLines.askedBack.map((line) => line.en),
    ...lesson.closingLines.map((line) => line.en),
    ...lesson.completionMessages,
    ...Object.values(lesson.script).flatMap((state) => state.needsRetryLines.map((line) => line.en)),
    ...lesson.silenceNudgeLines.map((line) => line.en),
  ];
}

function leadingEnglishFragment(template: string): string {
  const chineseStart = template.search(CONTAINS_CHINESE);
  return template.slice(0, chineseStart).trim();
}

describe("Learning Summary language invariants", () => {
  it("keeps both Suggestion pools entirely in Chinese", () => {
    const suggestions = [
      ...NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES,
      ...GENERIC_GROWTH_SUGGESTION_TEMPLATES,
    ];

    for (const suggestion of suggestions) {
      expect(suggestion).toMatch(CONTAINS_CHINESE);
      expect(suggestion).not.toMatch(CONTAINS_ENGLISH_LETTER);
    }
  });

  it("keeps Praise and Closing mixed-language without reusing a Conversation Script line", () => {
    const scriptLines = conversationScriptEnglishLines();

    for (const template of [...PRAISE_TEMPLATES, ...CLOSING_TEMPLATES]) {
      expect(template).toMatch(CONTAINS_CHINESE);
      expect(template).toMatch(CONTAINS_ENGLISH_LETTER);
      expect(scriptLines).not.toContain(leadingEnglishFragment(template));
    }
  });

  it("keeps every Highlight template in a Chinese sentence", () => {
    const highlights = [...Object.values(HIGHLIGHT_TEMPLATES).flat(), ...GENERIC_HIGHLIGHT_TEMPLATES];

    for (const highlight of highlights) {
      expect(highlight).toMatch(CONTAINS_CHINESE);
    }
  });
});
