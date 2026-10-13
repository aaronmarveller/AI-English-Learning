import { describe, expect, it } from "vitest";
import {
  buildSummaryTranscript,
  fallbackLines,
  isSummaryRequest,
  parseLearningSummary,
  summaryToLines,
} from "@/lib/learning-summary";

const valid = {
  praise: "你今天说得很棒！",
  highlights: ["你会用 \"Hello.\" 打招呼。", "你说了 \"I'm good.\"。"],
  suggestion: "下次试试把问题问回给 Emily。",
  closing: "继续加油！",
};

describe("parseLearningSummary", () => {
  it("reads a plain JSON reply", () => {
    expect(parseLearningSummary(JSON.stringify(valid))).toEqual(valid);
  });

  it("tolerates a Markdown fence and surrounding prose", () => {
    const reply = "Here you go:\n```json\n" + JSON.stringify(valid) + "\n```";
    expect(parseLearningSummary(reply)).toEqual(valid);
  });

  it("keeps at most three Highlights", () => {
    const four = { ...valid, highlights: ["a", "b", "c", "d"] };
    expect(parseLearningSummary(JSON.stringify(four))?.highlights).toEqual(["a", "b", "c"]);
  });

  it("rejects a reply missing a part or with fewer than two Highlights", () => {
    expect(parseLearningSummary(JSON.stringify({ ...valid, closing: "" }))).toBeNull();
    expect(parseLearningSummary(JSON.stringify({ ...valid, highlights: ["only one"] }))).toBeNull();
    expect(parseLearningSummary(JSON.stringify({ ...valid, highlights: "nope" }))).toBeNull();
  });

  it("rejects text that is not JSON", () => {
    expect(parseLearningSummary("I could not do that")).toBeNull();
    expect(parseLearningSummary("{ broken")).toBeNull();
  });
});

describe("summaryToLines", () => {
  it("presents Praise, Highlights, Suggestion, Closing in that order", () => {
    expect(summaryToLines(valid).map((l) => l.kind)).toEqual([
      "praise",
      "highlight",
      "highlight",
      "suggestion",
      "closing",
    ]);
  });
});

describe("fallbackLines", () => {
  it("lists the learner's own lines", () => {
    const lines = fallbackLines(["Hello", "我想问怎么说"]);
    expect(lines.map((l) => l.text).slice(1)).toEqual(["Hello", "我想问怎么说"]);
    expect(lines[0].kind).toBe("fallback");
  });

  it("says kindly that nothing was recognised when the learner said nothing", () => {
    const lines = fallbackLines([]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain("没有识别到");
  });
});

describe("buildSummaryTranscript", () => {
  it("covers every Call and drops unsupported-language and empty learner lines", () => {
    const transcript = buildSummaryTranscript([
      {
        lines: [
          { role: "emily", text: "Hi!" },
          { role: "learner", text: "Hello" },
          { role: "learner", text: "こんにちは" },
          { role: "learner", text: "" },
        ],
      },
      { lines: [{ role: "learner", text: "我想问怎么说" }] },
    ]);
    expect(transcript).toBe("Call 1\nEmily: Hi!\nLearner: Hello\n\nCall 2\nLearner: 我想问怎么说");
  });
});

describe("isSummaryRequest", () => {
  it("accepts up to three Calls of role + text lines", () => {
    expect(isSummaryRequest({ calls: [{ lines: [{ role: "learner", text: "Hi" }] }] })).toBe(true);
  });

  it("rejects malformed bodies", () => {
    expect(isSummaryRequest(null)).toBe(false);
    expect(isSummaryRequest({ calls: "x" })).toBe(false);
    expect(isSummaryRequest({ calls: [{ lines: [{ role: "robot", text: "Hi" }] }] })).toBe(false);
    expect(isSummaryRequest({ calls: [1, 2, 3, 4].map(() => ({ lines: [] })) })).toBe(false);
  });
});
