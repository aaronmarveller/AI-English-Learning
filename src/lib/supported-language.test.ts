import { describe, expect, it } from "vitest";
import { isSupportedLearnerText } from "@/lib/supported-language";

describe("isSupportedLearnerText", () => {
  it("accepts English and Chinese lines", () => {
    expect(isSupportedLearnerText("Hello, how are you?")).toBe(true);
    expect(isSupportedLearnerText("我想知道怎么回答")).toBe(true);
    expect(isSupportedLearnerText("你好 hello")).toBe(true);
  });

  it("rejects blank and punctuation-only transcripts", () => {
    expect(isSupportedLearnerText("")).toBe(false);
    expect(isSupportedLearnerText("   ")).toBe(false);
    expect(isSupportedLearnerText("...")).toBe(false);
  });

  it("rejects lines in clearly unsupported scripts", () => {
    expect(isSupportedLearnerText("こんにちは")).toBe(false);
    expect(isSupportedLearnerText("안녕하세요")).toBe(false);
    expect(isSupportedLearnerText("Привет")).toBe(false);
    expect(isSupportedLearnerText("hello こんにちは")).toBe(false);
  });
});
