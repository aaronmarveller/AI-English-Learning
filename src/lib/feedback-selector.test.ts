import { describe, expect, it } from "vitest";
import { selectFeedback } from "@/lib/feedback-selector";
import type { StateTurnRecord } from "@/lib/turn-record";
import {
  GENERIC_GROWTH_SUGGESTION_TEMPLATES,
  HIGHLIGHT_TEMPLATES,
  NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES,
} from "@/content/review";

/** Cycles through `values` on every call — lets a single test drive several distinct pickOne()/shuffle decisions deterministically without hand-tracking call order. */
function sequencedRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function record(
  state: StateTurnRecord["state"],
  overrides: Partial<StateTurnRecord> = {},
): StateTurnRecord {
  return {
    state,
    passedFirstTry: true,
    matchedAcceptedResponse: true,
    learnerAskedBack: false,
    ...overrides,
  };
}

function groupOfText(text: string): keyof typeof HIGHLIGHT_TEMPLATES | undefined {
  return (Object.keys(HIGHLIGHT_TEMPLATES) as (keyof typeof HIGHLIGHT_TEMPLATES)[]).find((group) =>
    HIGHLIGHT_TEMPLATES[group].includes(text),
  );
}

function highlightTexts(lines: ReturnType<typeof selectFeedback>): string[] {
  return lines.filter((line) => line.kind === "highlight").map((line) => line.text);
}

describe("selectFeedback", () => {
  it("always produces exactly praise -> 2-3 highlights -> suggestion -> closing, in that order", () => {
    const allFour = [record("greeting"), record("checkin"), record("response"), record("closing")];
    for (let i = 0; i < 25; i++) {
      const random = () => i / 25;
      const lines = selectFeedback(allFour, random);
      expect(lines[0].kind).toBe("praise");
      expect(lines[lines.length - 1].kind).toBe("closing");
      expect(lines[lines.length - 2].kind).toBe("suggestion");
      const highlights = lines.filter((line) => line.kind === "highlight");
      expect(highlights.length).toBeGreaterThanOrEqual(2);
      expect(highlights.length).toBeLessThanOrEqual(3);
    }
  });

  it("shows the fixed 2-3 highlight count even with no turnRecords at all (falls back to generic copy)", () => {
    for (let i = 0; i < 10; i++) {
      const lines = selectFeedback([], () => i / 10);
      const highlights = lines.filter((line) => line.kind === "highlight");
      expect(highlights.length).toBeGreaterThanOrEqual(2);
      expect(highlights.length).toBeLessThanOrEqual(3);
    }
  });

  describe("the Overall guarantee", () => {
    it("always contributes one Overall highlight when all four active states have a record, across every random seed", () => {
      const allFour = [record("greeting"), record("checkin"), record("response"), record("closing")];
      for (let i = 0; i < 30; i++) {
        const random = () => i / 30;
        const texts = highlightTexts(selectFeedback(allFour, random));
        const groups = texts.map(groupOfText);
        expect(groups).toContain("overall");
      }
    });

    it("never contributes an Overall highlight when a state is missing (conversation not completed)", () => {
      const missingClosing = [record("greeting"), record("checkin"), record("response")];
      for (let i = 0; i < 30; i++) {
        const random = () => i / 30;
        const texts = highlightTexts(selectFeedback(missingClosing, random));
        const groups = texts.map(groupOfText);
        expect(groups).not.toContain("overall");
      }
    });
  });

  describe("at most one highlight per group", () => {
    it("never shows two highlights from the same group, even when every group is eligible", () => {
      const allFour = [record("greeting"), record("checkin"), record("response"), record("closing")];
      for (let i = 0; i < 30; i++) {
        const random = () => i / 30;
        const texts = highlightTexts(selectFeedback(allFour, random));
        const groups = texts.map(groupOfText);
        expect(new Set(groups).size).toBe(groups.length);
      }
    });

    it("the Conversation group contributes at most one highlight even though both response and closing feed it", () => {
      // No greeting/checkin records, and not all 4 states, so Overall is not
      // eligible either — the only possible candidate is "conversation",
      // fed by both response and closing. There must never be 2 highlights
      // both mapping to "conversation".
      const responseAndClosing = [record("response"), record("closing")];
      for (let i = 0; i < 20; i++) {
        const random = () => i / 20;
        const texts = highlightTexts(selectFeedback(responseAndClosing, random));
        const conversationCount = texts.map(groupOfText).filter((group) => group === "conversation").length;
        expect(conversationCount).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("first-try ranking", () => {
    it("ranks states passed first-try above states that needed a retry when slots are limited", () => {
      // 3 eligible non-Overall candidates (greeting, checkin, conversation);
      // only 2 of them passed first try. With exactly 2 highlight slots
      // (forced via a fixed low random value picking HIGHLIGHT_COUNT_OPTIONS[0] = 2),
      // the retry-needing "greeting" group must never be selected.
      const turnRecords = [
        record("greeting", { passedFirstTry: false }),
        record("checkin", { passedFirstTry: true }),
        record("response", { passedFirstTry: true }),
      ];
      for (let i = 0; i < 20; i++) {
        // selectFeedback's random() calls, in order: praise, then
        // highlightCount, then the rest. The 2nd value (index 1) is pinned
        // to 0 so highlightCount always resolves to
        // HIGHLIGHT_COUNT_OPTIONS[0] = 2; the others vary across the loop to
        // exercise different shuffle/pickOne outcomes for the remaining
        // selection.
        const random = sequencedRandom([i / 20, 0, ((i + 7) % 20) / 20, ((i + 13) % 20) / 20, ((i + 3) % 20) / 20]);
        const texts = highlightTexts(selectFeedback(turnRecords, random));
        const groups = texts.map(groupOfText);
        expect(groups).not.toContain("greeting");
      }
    });

    it("falls back to the retry-needing group only when there aren't enough first-try groups to fill the slots", () => {
      // Only one eligible non-Overall candidate, and it needed a retry — it
      // must still appear (backfilled by the generic pool otherwise would
      // leave only 1 real highlight, but the group itself, being the only
      // candidate, must still be picked to fill the top-priority slot).
      const turnRecords = [record("greeting", { passedFirstTry: false })];
      const texts = highlightTexts(selectFeedback(turnRecords, () => 0));
      const groups = texts.map(groupOfText);
      expect(groups).toContain("greeting");
    });
  });

  describe("suggestion branching", () => {
    it("picks from the needs-more-practice pool when any state needed a retry", () => {
      const turnRecords = [record("greeting", { passedFirstTry: false }), record("checkin")];
      for (let i = 0; i < 10; i++) {
        const lines = selectFeedback(turnRecords, () => i / 10);
        const suggestion = lines.find((line) => line.kind === "suggestion");
        expect(NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES).toContain(suggestion?.text);
      }
    });

    it("picks from the generic growth pool when every state passed first try", () => {
      const turnRecords = [record("greeting"), record("checkin"), record("response"), record("closing")];
      for (let i = 0; i < 10; i++) {
        const lines = selectFeedback(turnRecords, () => i / 10);
        const suggestion = lines.find((line) => line.kind === "suggestion");
        expect(GENERIC_GROWTH_SUGGESTION_TEMPLATES).toContain(suggestion?.text);
      }
    });

    it("picks from the generic growth pool when there are no turnRecords at all", () => {
      const lines = selectFeedback([], () => 0);
      const suggestion = lines.find((line) => line.kind === "suggestion");
      expect(GENERIC_GROWTH_SUGGESTION_TEMPLATES).toContain(suggestion?.text);
    });
  });
});
