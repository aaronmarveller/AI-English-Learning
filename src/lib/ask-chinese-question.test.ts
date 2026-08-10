import { afterEach, describe, expect, it, vi } from "vitest";
import { askChineseQuestion } from "@/lib/ask-chinese-question";

/**
 * Issue #19: `askChineseQuestion` is the client-side deep module for the
 * Chinese-explanation seam — the symmetric counterpart to
 * `submitPracticeTurn`. Unlike `submitPracticeTurn`, this module DOES throw
 * on failure (network error, non-2xx status, malformed response) rather
 * than resolving a discriminated result — the parent epic's acceptance
 * criteria puts the fallback-to-canned-text behavior at the client CALL
 * SITE (ask-in-chinese-sheet.tsx's try/catch), not inside this module, so
 * every failure mode collapsing to a thrown error is exactly what that call
 * site's catch block is built to handle uniformly.
 */
describe("askChineseQuestion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the state and question to the explanation endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ answerZh: "这是一个解释。" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await askChineseQuestion({ state: "checkin", question: "怎么区分这两句话？" });

    expect(result).toBe("这是一个解释。");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/practice/explain",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ state: "checkin", question: "怎么区分这两句话？" }),
      }),
    );
  });

  it("throws when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network error")),
    );

    await expect(askChineseQuestion({ state: "greeting", question: "你好是什么意思？" })).rejects.toThrow();
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 })),
    );

    await expect(askChineseQuestion({ state: "greeting", question: "你好是什么意思？" })).rejects.toThrow();
  });

  it("throws on a malformed response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ notAnswerZh: "oops" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(askChineseQuestion({ state: "greeting", question: "你好是什么意思？" })).rejects.toThrow();
  });

  it("throws when the response body isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );

    await expect(askChineseQuestion({ state: "greeting", question: "你好是什么意思？" })).rejects.toThrow();
  });
});
