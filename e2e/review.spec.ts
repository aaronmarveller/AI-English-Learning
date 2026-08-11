import { test, expect, type Page } from "@playwright/test";
import { installScriptedPracticeApi, PRACTICE_URL, resetStorage, submitReply } from "./fixtures";

/**
 * E2E coverage for the learner-facing Learning Summary on the internal
 * Review route.
 *
 * Same seam as e2e/practice-conversation.spec.ts / practice-support.spec.ts:
 * a real browser drives the whole app; the only stubbed boundary is the LLM
 * proxy route's network response (`/api/practice/turn`), via e2e/fixtures
 * .ts's `installScriptedPracticeApi` (shared with those two files and
 * practice-voice.spec.ts; consolidated by issue #10).
 *
 * Issue #16 removed `highlight_key` from the wire contract entirely — the
 * model no longer reports it. Issue #20 ("Derive the Learning Summary on
 * the client") replaced it with a client-built per-state `turnRecords` list
 * (src/lib/practice-state.ts) and rewrote src/lib/feedback-selector.ts to
 * derive highlight groups from it — that module's own unit tests
 * (src/lib/feedback-selector.test.ts) pin the deterministic selection rules
 * (the Overall guarantee, one-per-group, first-try ranking) with an
 * injected random source, which a real browser driving a stubbed API can't
 * do precisely. This file keeps the tests that hold regardless of which
 * exact highlights a given run produces: the fixed 4-part shape (praise →
 * highlights → suggestion → closing), the reveal/disable mechanics, and
 * Retry's navigation + clean-slate guarantee.
 */

/**
 * Drives a full 4-turn Practice conversation to completion via a scripted
 * "accepted" response per active state, then clicks View Summary to land on
 * /review.
 */
async function completeConversation(page: Page): Promise<void> {
  await resetStorage(page);
  await installScriptedPracticeApi(page, [
    { verdict: "accepted" },
    { verdict: "accepted" },
    { verdict: "accepted" },
    { verdict: "accepted" },
  ]);
  await page.goto(PRACTICE_URL);

  await submitReply(page, "Hi there!");
  await submitReply(page, "Good, and you?");
  await submitReply(page, "Good, thanks! And you? I'm doing pretty good, just heading to work.");
  await submitReply(page, "Have a good one!");

  await expect(page.getByTestId("view-summary-button")).toBeEnabled();
  await page.getByTestId("view-summary-button").click();
  await expect(page).toHaveURL(/\/review(\?|$)/);
}

/** Waits until every feedback line has revealed (the typing indicator is gone). */
async function waitForFeedbackComplete(page: Page): Promise<void> {
  await expect(page.getByTestId("review-typing-indicator")).toHaveCount(0);
}

test.describe("Review page", () => {
  test("Retry and Continue stay disabled while feedback is revealing, and enable once it's done", async ({
    page,
  }) => {
    await completeConversation(page);

    await expect(page.getByRole("heading", { name: "Learning Summary" })).toBeVisible();

    // The very first render: at least the praise line is still
    // pending or just landed, and more lines remain — both buttons must be
    // disabled the whole time feedback is still being revealed.
    await expect(page.getByTestId("retry-button")).toBeDisabled();
    await expect(page.getByTestId("review-continue-button")).toBeDisabled();
    await expect(page.getByTestId("review-typing-indicator")).toBeVisible();

    // Fewer lines are visible than the final total while still revealing.
    const linesWhileRevealing = await page.getByTestId("review-line").count();
    expect(linesWhileRevealing).toBeLessThan(6);

    await waitForFeedbackComplete(page);

    // Fixed order: praise (1) → highlights (2-3) → suggestion (1) →
    // closing (1) — first line is always the praise, last is always
    // the closing line.
    const kinds = await page.getByTestId("review-line").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-kind")),
    );
    expect(kinds.length).toBeGreaterThanOrEqual(5);
    expect(kinds.length).toBeLessThanOrEqual(6);
    expect(kinds[0]).toBe("praise");
    expect(kinds[kinds.length - 1]).toBe("closing");
    expect(kinds[kinds.length - 2]).toBe("suggestion");
    expect(kinds.filter((kind) => kind === "highlight").length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((kind) => kind === "highlight").length).toBeLessThanOrEqual(3);

    await expect(page.getByTestId("retry-button")).toBeEnabled();
    await expect(page.getByTestId("review-continue-button")).toBeEnabled();

    // No scores, levels, or stats anywhere on the page (spec.md user story
    // 81: "不会看到分数、等级或详细数据统计").
    const pageText = await page.locator("body").innerText();
    expect(pageText).not.toMatch(/\d+\s*(分|%|\/\s*4|points?|score)/i);
  });

  test("clicking Retry navigates to /practice with a genuinely clean, freshly-started conversation", async ({
    page,
  }) => {
    await completeConversation(page);
    await waitForFeedbackComplete(page);

    await page.getByTestId("retry-button").click();
    await expect(page).toHaveURL(/\/practice(\?|$)/);

    // Fresh opening line rendered, greeting is current again, no leftover
    // learner turn from the previous run.
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "upcoming");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    await expect(page.getByTestId("view-summary-button")).toBeDisabled();

  });
});
