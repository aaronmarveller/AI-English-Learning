import { describe, expect, it } from "vitest";
import { buildChineseExplanationSystemPrompt } from "@/lib/chinese-explanation";

describe("Chinese explanation prompt", () => {
  it("limits spoken follow-up answers to no more than three sentences", () => {
    const prompt = buildChineseExplanationSystemPrompt("greeting");

    expect(prompt).toContain("no more than 3 sentences");
  });
});
