import { expect, test } from "@playwright/test";
import {
  FAKE_SUMMARY,
  PRACTICE_URL,
  REVIEW_URL,
  installFakeCall,
  makeCall,
  resetStorage,
  seedPractice,
} from "./fixtures";

/**
 * Review unlocks after a spoken Call, and the Learning Summary is written
 * from everything the learner said across all Calls (issue #64). The summary
 * itself is a fake: this suite checks what is sent to it and how the page
 * presents what comes back.
 */

test.describe("Practice — 查看学习总结 gating", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
  });

  test("stays disabled until a Call has ended with a learner line in English or Chinese", async ({ page }) => {
    const summaryButton = page.getByTestId("view-summary-button");
    await expect(summaryButton).toBeDisabled();

    // A Call where the learner said nothing does not enable it.
    await makeCall(page, null, 1);
    await expect(summaryButton).toBeDisabled();

    // Nor does one in which they only spoke another language.
    await makeCall(page, "こんにちは", 2);
    await expect(summaryButton).toBeDisabled();

    await makeCall(page, "Hello, Emily.", 3);
    await expect(summaryButton).toBeEnabled();
  });

  test("a line in Chinese counts too", async ({ page }) => {
    await makeCall(page, "我想问一下怎么回答", 1);
    await expect(page.getByTestId("view-summary-button")).toBeEnabled();
  });

  test("tapping it marks Practice complete and opens Review", async ({ page }) => {
    await makeCall(page, "Hello, Emily.", 1);

    await page.getByTestId("view-summary-button").click();

    await expect(page).toHaveURL(/\/review(\?|$)/);
    await expect(page.getByTestId("progress-dot-practice")).toHaveAttribute("data-state", "done");
  });
});

test.describe("Review — the Learning Summary", () => {
  test("shows Praise, 2–3 Highlights, Suggestion and Closing, written from every Call", async ({ page }) => {
    await resetStorage(page);
    const network = await installFakeCall(page);
    await page.goto(PRACTICE_URL);

    await makeCall(page, "Hello, Emily.", 1);
    await makeCall(page, "我想问怎么回答", 2);
    await makeCall(page, "ありがとう", 3);
    await page.getByTestId("view-summary-button").click();
    await expect(page.getByTestId("retry-button")).toBeEnabled({ timeout: 15_000 });

    const lines = page.getByTestId("review-line");
    const kinds = await lines.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-kind")));
    expect(kinds).toEqual(["praise", "highlight", "highlight", "suggestion", "closing"]);
    await expect(lines.first()).toHaveText(FAKE_SUMMARY.praise);
    await expect(lines.last()).toHaveText(FAKE_SUMMARY.closing);

    // One request, carrying all three Calls' lines; a line in an unsupported
    // language is dropped before the model ever sees it (server-side too, but
    // the page does not rely on that).
    expect(network.summaryRequests).toHaveLength(1);
    const sent = network.summaryRequests[0].calls;
    expect(sent).toHaveLength(3);
    const learnerTexts = sent.flatMap((c) => c.lines.filter((l) => l.role === "learner").map((l) => l.text));
    expect(learnerTexts).toContain("Hello, Emily.");
    expect(learnerTexts).toContain("我想问怎么回答");
  });

  test("never shows scores, and the Anthropic key is not part of the page", async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await seedPractice(page, [
      { id: "c1", ended: true, lines: [{ id: "u1", role: "learner", text: "Hello, Emily." }] },
    ]);
    await page.goto(REVIEW_URL);
    await expect(page.getByTestId("retry-button")).toBeEnabled({ timeout: 15_000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).not.toMatch(/\d+\s*(分|%|points?|score)/i);
    expect(pageText).not.toMatch(/发音|口音|流利/);
  });

  test("falls back to the learner's own English and Chinese lines when generating the summary fails", async ({
    page,
  }) => {
    await resetStorage(page);
    await installFakeCall(page, { summary: "fail" });
    await seedPractice(page, [
      {
        id: "c1",
        ended: true,
        lines: [
          { id: "e1", role: "emily", text: "Hi!" },
          { id: "u1", role: "learner", text: "Hello, Emily." },
          { id: "u2", role: "learner", text: "こんにちは" },
        ],
      },
      { id: "c2", ended: true, lines: [{ id: "u3", role: "learner", text: "我想问怎么说" }] },
    ]);
    await page.goto(REVIEW_URL);
    await expect(page.getByTestId("retry-button")).toBeEnabled({ timeout: 15_000 });

    await expect(page.getByTestId("review-line")).toHaveText([
      "学习总结暂时没能生成，先看看你自己说过的话吧：",
      "Hello, Emily.",
      "我想问怎么说",
    ]);
    await expect(page.getByTestId("review-line").first()).toHaveAttribute("data-kind", "fallback");
  });

  test("clicking 重练 resets Practice to three Calls with no transcripts", async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    await makeCall(page, "Hello, Emily.", 1);
    await makeCall(page, "I'm good.", 2);
    await page.getByTestId("view-summary-button").click();
    await expect(page.getByTestId("retry-button")).toBeEnabled({ timeout: 15_000 });

    await page.getByTestId("retry-button").click();

    await expect(page).toHaveURL(/\/practice(\?|$)/);
    await expect(page.getByTestId("call-counter")).toContainText("第 1 / 3 通");
    await expect(page.getByTestId("call-button")).toBeEnabled();
    await expect(page.getByTestId("emily-message-bubble")).toHaveCount(0);
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    await expect(page.getByTestId("view-summary-button")).toBeDisabled();
  });

  test("Retry and Continue stay disabled while the summary is revealing", async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await seedPractice(page, [
      { id: "c1", ended: true, lines: [{ id: "u1", role: "learner", text: "Hello, Emily." }] },
    ]);
    await page.goto(REVIEW_URL);

    await expect(page.getByRole("heading", { name: "Learning Summary" })).toBeVisible();
    await expect(page.getByTestId("stage-tag")).toHaveText(/^\s*✨\s*Learning Summary$/);
    await expect(page.getByTestId("retry-button")).toBeDisabled();
    await expect(page.getByTestId("review-continue-button")).toBeDisabled();
    await expect(page.getByTestId("review-typing-indicator")).toBeVisible();

    await expect(page.getByTestId("retry-button")).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("review-continue-button")).toBeEnabled();
  });
});
