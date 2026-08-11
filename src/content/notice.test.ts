import { describe, expect, it } from "vitest";
import { CULTURAL_INSIGHT_CARDS } from "@/content/notice";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

describe("Notice collapsed-card previews", () => {
  it("gives each culture exactly two emoji and no text symbols", () => {
    for (const card of CULTURAL_INSIGHT_CARDS) {
      for (const preview of [card.preview.us, card.preview.china]) {
        const emoji = Array.from(graphemes.segment(preview), ({ segment }) => segment);
        expect(emoji).toHaveLength(2);
        expect(emoji.every((value) => /^\p{Extended_Pictographic}/u.test(value))).toBe(true);
      }
    }
  });
});
