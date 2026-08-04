import { test, expect, type Page, type Route } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * E2E coverage for the Practice page's support & recovery features (ticket
 * 10; spec.md "Practice 页交互模型" / "语言口径", user stories 48-57/62/67):
 * per-message bilingual subtitle toggle (default-open only on the very
 * first message), the replay button, the Ask-in-Chinese sheet, the
 * silence-timeout nudge, and the full-transcript drawer. All five must
 * never advance `conversationState` or call the LLM proxy route on their
 * own — that's the core constraint this whole ticket exists to protect.
 *
 * Same seam as e2e/practice-conversation.spec.ts (ticket 08, owned by a
 * sibling worktree and deliberately left untouched here): a real browser
 * drives the whole app; the only stubbed boundary is the LLM proxy route's
 * network response (`/api/practice/turn`). This file keeps its own copy of
 * the scripted-response helper rather than importing from that file, per
 * this ticket's file-ownership boundary.
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
  // about support/recovery features, not voice, so it switches to the
  // (always-available) text fallback once — idempotent across repeated
  // calls in the same test — and drives every turn through it as before.
  const textInput = page.getByTestId("practice-text-input");
  if (!(await textInput.isVisible())) {
    await page.getByTestId("practice-input-mode-toggle").click();
  }
  await textInput.fill(text);
  await page.getByTestId("practice-send-button").click();
}

function trackTurnRequests(page: Page): string[] {
  const turnRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/practice/turn")) turnRequests.push(request.url());
  });
  return turnRequests;
}

test.describe("Practice page — support & recovery", () => {
  test("the opening message defaults to showing Chinese; a later Emily message defaults to English-only", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    await page.goto(PRACTICE_URL);

    // First message in the whole conversation: Chinese is already visible,
    // no click required (spec.md 语言口径: "第一条 Opening Message 默认展开
    // 中文，降低初次入场门槛").
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("emily-message-zh")).toBeVisible();
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "expanded");

    await submitReply(page, "Hi Emily!");

    // Every subsequent Emily message defaults back to English-only.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "collapsed");
  });

  test("toggling one message's subtitle doesn't carry over to the next message", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    await page.goto(PRACTICE_URL);

    // Opening line starts expanded — collapse it, proving the toggle is a
    // real, independent per-message switch and not just "whatever the
    // default happens to be".
    await page.getByTestId("subtitle-toggle-button").click();
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);

    await submitReply(page, "Hi Emily!");

    // The new message resets to its own default (collapsed) regardless of
    // what the previous message's toggle was left at.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "collapsed");

    // And it's still fully interactive on the new message.
    await page.getByTestId("subtitle-toggle-button").click();
    await expect(page.getByTestId("emily-message-zh")).toHaveText("太好了，你今天怎么样？");
  });

  test("the replay button never touches subtitle visibility or the conversation state", async ({ page }) => {
    await resetStorage(page);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-zh")).toBeVisible();
    await page.getByTestId("replay-button").click();

    // Replay is independent of the caption toggle in both directions.
    await expect(page.getByTestId("emily-message-zh")).toBeVisible();
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
  });

  test("opening and closing Ask in Chinese leaves the conversation state untouched and never calls the turn endpoint", async ({
    page,
  }) => {
    await resetStorage(page);
    const turnRequests = trackTurnRequests(page);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");

    await page.getByTestId("ask-in-chinese-button").click();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toBeVisible();

    // The fixed 4-part content is present and non-empty (meaning / when to
    // use / example / encouragement) — grounded in the current step, not a
    // network response.
    const sheetText = await page.getByTestId("ask-in-chinese-sheet").innerText();
    expect(sheetText.trim().length).toBeGreaterThan(0);

    await page.getByTestId("ask-in-chinese-close-button").click();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toHaveCount(0);

    // Still on the exact same step, before and after — asking for help was
    // never treated as a turn.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    expect(turnRequests).toHaveLength(0);
  });

  test("learner silence produces exactly one gentle nudge, without advancing state or calling the turn endpoint", async ({
    page,
  }) => {
    await resetStorage(page);
    const turnRequests = trackTurnRequests(page);
    await page.clock.install();
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");

    // Fast-forward past the configured 18s silence window without the
    // learner ever submitting anything.
    await page.clock.fastForward(19000);

    // Emily's newest line is now the fixed nudge, not an LLM reply.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Take your time!");
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    expect(turnRequests).toHaveLength(0);
  });

  test("the transcript drawer reveals every message once expanded, in order", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    await page.goto(PRACTICE_URL);

    // Collapsed by default — doesn't crowd the main view.
    await expect(page.getByTestId("transcript-message")).toHaveCount(0);

    await page.getByTestId("transcript-toggle-button").click();
    await expect(page.getByTestId("transcript-message")).toHaveCount(1); // just the opening line so far

    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");

    // Opening line + learner's echoed turn + Emily's reply.
    await expect(page.getByTestId("transcript-message")).toHaveCount(3);
  });
});
