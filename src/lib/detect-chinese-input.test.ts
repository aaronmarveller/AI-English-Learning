import { describe, expect, it } from "vitest";
import { containsChineseText } from "@/lib/detect-chinese-input";

describe("containsChineseText", () => {
  it("detects mixed Chinese/English input", () => {
    expect(containsChineseText("你好, how are you?")).toBe(true);
    expect(containsChineseText("Hi Emily 你好")).toBe(true);
  });

  it("does not treat punctuation-only input as Chinese", () => {
    expect(containsChineseText("？！")).toBe(false);
    expect(containsChineseText("...")).toBe(false);
    expect(containsChineseText("!?.,")).toBe(false);
    expect(containsChineseText("")).toBe(false);
  });

  it("detects pure Chinese input", () => {
    expect(containsChineseText("你好，最近怎么样？")).toBe(true);
  });

  it("does not flag pure English input", () => {
    expect(containsChineseText("Hi Emily, good morning!")).toBe(false);
    expect(containsChineseText("How are you doing today?")).toBe(false);
  });

  it("detects a single stray Chinese character among otherwise English text", () => {
    expect(containsChineseText("I think 好 means good")).toBe(true);
  });
});
