import { test, expect, type Page, type Route } from "@playwright/test";
import { resetStorage } from "./fixtures";
import {
  HIGHLIGHT_TEMPLATES,
  NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES,
} from "@/content/review";

/**
 * E2E coverage for the Review page (ticket 11; spec.md "Review 页" + "语言
 * 口径" > "Review 全中文叙述 + 英文例句嵌入"; user stories 69-81).
 *
 * Same seam as e2e/practice-conversation.spec.ts / practice-support.spec.ts:
 * a real browser drives the whole app; the only stubbed boundary is the LLM
 * proxy route's network response (`/api/practice/turn`). To land on /review
 * with real, controllable `highlightKeys` in the store (rather than seeding
 * localStorage directly, which would duplicate the practice store's internal
 * shape), this file drives a full 4-turn Practice conversation to completion
 * via a scripted turn-endpoint response sequence, exactly like those two
 * files' own helpers do.
 */

const PRACTICE_URL = "/practice?debug=1";
const TURN_ENDPOINT = "**/api/practice/turn";

type ScriptedTurnResponse = {
  verdict: "accepted" | "needs_retry" | "off_topic";
  reply_en: string;
  reply_zh: string;
  highlight_key: string;
};

/** Same scripted-response stub as e2e/practice-conversation.spec.ts — see that file's doc comment for why. */
async function installScriptedPracticeApi(page: Page, responses: ScriptedTurnResponse[]): Promise<void> {
  let callIndex = 0;
  await page.route(TURN_ENDPOINT, async (route: Route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

async function submitReply(page: Page, text: string): Promise<void> {
  // Ticket 09 made the microphone the default input mode; this suite is
  // about Review, not voice, so it switches to the (always-available) text
  // fallback once and drives every turn through it.
  const textInput = page.getByTestId("practice-text-input");
  if (!(await textInput.isVisible())) {
    await page.getByTestId("practice-input-mode-toggle").click();
  }
  await textInput.fill(text);
  await page.getByTestId("practice-send-button").click();
}

/**
 * Drives a full 4-turn Practice conversation to completion, one scripted
 * "accepted" response per active state, each tagged with the given
 * `highlightKey` — then clicks View Summary to land on /review. This is how
 * each test below gets deterministic control over which highlightKeys
 * accumulate in the store.
 */
async function completeConversationWithHighlightKey(page: Page, highlightKey: string): Promise<void> {
  await resetStorage(page);
  await installScriptedPracticeApi(page, [
    { verdict: "accepted", reply_en: "How are you today?", reply_zh: "你今天怎么样？", highlight_key: highlightKey },
    {
      verdict: "accepted",
      reply_en: "I'm doing great, thanks! How about you?",
      reply_zh: "我很好，谢谢！你呢？",
      highlight_key: highlightKey,
    },
    {
      verdict: "accepted",
      reply_en: "That's great to hear! Well, I should get going.",
      reply_zh: "太好了！好啦，我该走了。",
      highlight_key: highlightKey,
    },
    {
      verdict: "accepted",
      reply_en: "Bye! Great chatting with you — go check out your summary!",
      reply_zh: "拜拜！很高兴和你聊天——去看看你的学习总结吧！",
      highlight_key: highlightKey,
    },
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
    await completeConversationWithHighlightKey(page, "natural-paraphrase");

    // The very first render: at least the encouragement line is still
    // pending or just landed, and more lines remain — both buttons must be
    // disabled the whole time feedback is still being revealed.
    await expect(page.getByTestId("retry-button")).toBeDisabled();
    await expect(page.getByTestId("review-continue-button")).toBeDisabled();
    await expect(page.getByTestId("review-typing-indicator")).toBeVisible();

    // Fewer lines are visible than the final total while still revealing.
    const linesWhileRevealing = await page.getByTestId("review-line").count();
    expect(linesWhileRevealing).toBeLessThan(6);

    await waitForFeedbackComplete(page);

    // Fixed order: encouragement (1) → highlights (2-3) → suggestion (1) →
    // closing (1) — first line is always the encouragement, last is always
    // the closing line.
    const kinds = await page.getByTestId("review-line").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-kind")),
    );
    expect(kinds.length).toBeGreaterThanOrEqual(5);
    expect(kinds.length).toBeLessThanOrEqual(6);
    expect(kinds[0]).toBe("encouragement");
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
    await completeConversationWithHighlightKey(page, "used-whitelist-phrase");
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

    // The full transcript (ticket 10) confirms the store itself is clean,
    // not just the current-turn bubble: only the freshly picked opening line.
    await page.getByTestId("transcript-toggle-button").click();
    await expect(page.getByTestId("transcript-message")).toHaveCount(1);
  });

  test("highlights reflect the accumulated highlightKeys — different marker sequences produce different highlight content", async ({
    page,
  }) => {
    // Run A: every turn tagged "used-whitelist-phrase".
    await completeConversationWithHighlightKey(page, "used-whitelist-phrase");
    await waitForFeedbackComplete(page);
    const runATexts = await page
      .locator('[data-testid="review-line"][data-kind="highlight"]')
      .allInnerTexts();

    // Run B: fresh conversation, every turn tagged "natural-paraphrase" instead.
    await completeConversationWithHighlightKey(page, "natural-paraphrase");
    await waitForFeedbackComplete(page);
    const runBTexts = await page
      .locator('[data-testid="review-line"][data-kind="highlight"]')
      .allInnerTexts();

    expect(runATexts.length).toBeGreaterThanOrEqual(2);
    expect(runBTexts.length).toBeGreaterThanOrEqual(2);

    // Every highlight rendered in Run A must come from the
    // "used-whitelist-phrase" pool, and every highlight in Run B from the
    // "natural-paraphrase" pool — a real content-reflects-input check
    // against the actual template pools, not a tautology.
    const usedWhitelistPool = HIGHLIGHT_TEMPLATES["used-whitelist-phrase"];
    const naturalParaphrasePool = HIGHLIGHT_TEMPLATES["natural-paraphrase"];
    for (const text of runATexts) {
      expect(usedWhitelistPool).toContain(text);
    }
    for (const text of runBTexts) {
      expect(naturalParaphrasePool).toContain(text);
    }

    // The two pools are disjoint, so the rendered content necessarily
    // differs between the two runs — highlights genuinely reflect the
    // accumulated performance markers, not static copy.
    for (const text of runATexts) {
      expect(runBTexts).not.toContain(text);
    }
  });

  test("a diagnostic marker (needs-more-practice) produces a suggestion drawn from its matching pool", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      // Greeting: one needs_retry (tagged needs-more-practice) before accepted.
      {
        verdict: "needs_retry",
        reply_en: "Almost! Try saying hi back to me.",
        reply_zh: "差一点点！试着跟我打个招呼吧。",
        highlight_key: "needs-more-practice",
      },
      {
        verdict: "accepted",
        reply_en: "How are you today?",
        reply_zh: "你今天怎么样？",
        highlight_key: "recovered-after-retry",
      },
      {
        verdict: "accepted",
        reply_en: "I'm doing great, thanks! How about you?",
        reply_zh: "我很好，谢谢！你呢？",
        highlight_key: "natural-paraphrase",
      },
      {
        verdict: "accepted",
        reply_en: "That's great to hear! Well, I should get going.",
        reply_zh: "太好了！好啦，我该走了。",
        highlight_key: "confident-full-turn",
      },
      {
        verdict: "accepted",
        reply_en: "Bye! Great chatting with you — go check out your summary!",
        reply_zh: "拜拜！很高兴和你聊天——去看看你的学习总结吧！",
        highlight_key: "used-whitelist-phrase",
      },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "banana"); // needs_retry — stays on greeting
    await submitReply(page, "Hi there!"); // accepted — advances to checkin
    await submitReply(page, "Good, and you?");
    await submitReply(page, "Good, thanks! And you? I'm doing pretty good, just heading to work.");
    await submitReply(page, "Have a good one!");

    await expect(page.getByTestId("view-summary-button")).toBeEnabled();
    await page.getByTestId("view-summary-button").click();
    await expect(page).toHaveURL(/\/review(\?|$)/);
    await waitForFeedbackComplete(page);

    const suggestionText = await page.locator('[data-testid="review-line"][data-kind="suggestion"]').innerText();
    expect(NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES).toContain(suggestionText);
  });
});
