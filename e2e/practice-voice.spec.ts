import { test, expect, type Page, type Route } from "@playwright/test";
import { mockSpeechApis, resetStorage } from "./fixtures";

/**
 * E2E coverage for the Practice page's voice input (ticket 09; spec.md
 * "Practice 页交互模型" — "必须回显识别结果" — and user stories 44-47).
 *
 * Reuses the same two stubbed boundaries as practice-conversation.spec.ts
 * (ticket 08): the LLM proxy route's network response, and the Web Speech
 * API via e2e/fixtures.ts's `mockSpeechApis`. Everything else — routing,
 * the Conversation State Machine, the practice store — runs real code
 * against a real `next build && next start` server.
 *
 * A local copy of the LLM proxy stub helper lives here rather than importing
 * practice-conversation.spec.ts's, since that file belongs to ticket 08 and
 * shouldn't need to change for this ticket to land.
 */

const PRACTICE_URL = "/practice?debug=1";
const TURN_ENDPOINT = "**/api/practice/turn";

type ScriptedTurnResponse = {
  verdict: "accepted" | "needs_retry" | "off_topic";
  reply_en: string;
  reply_zh: string;
  highlight_key: string;
};

/**
 * `delayMs` mirrors practice-conversation.spec.ts's (ticket 08) own scripted
 * stub: without it, this mocked route resolves fast enough that a turn can
 * fully complete (replacing the learner bubble with Emily's next line)
 * before an assertion on the *transient* learner bubble even gets its first
 * poll — a real race, not a flaky test. Any test that asserts the learner
 * bubble mid-turn needs a delay; tests that only assert the eventual Emily
 * reply don't.
 */
async function installScriptedPracticeApi(
  page: Page,
  responses: ScriptedTurnResponse[],
  options: { delayMs?: number } = {},
): Promise<void> {
  let callIndex = 0;
  await page.route(TURN_ENDPOINT, async (route: Route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex += 1;
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

/**
 * Forces both the standard and vendor-prefixed Web Speech recognition
 * constructors to be absent, simulating a browser with no speech-recognition
 * support at all — distinct from `mockSpeechApis` (which installs a working
 * fake). Must run before `page.goto()` so the app's very first client render
 * already sees the unsupported browser.
 */
async function mockSpeechRecognitionUnsupported(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });
}

test.describe("Practice page — voice input", () => {
  test("a final recognition result is echoed back as the learner's bubble", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(
      page,
      [
        {
          verdict: "accepted",
          reply_en: "Great, how are you today?",
          reply_zh: "太好了，你今天怎么样？",
          highlight_key: "natural-paraphrase",
        },
      ],
      { delayMs: 300 },
    );
    await page.goto(PRACTICE_URL);

    // Mic is the default, primary input mode with a visible idle state.
    const micButton = page.getByTestId("practice-mic-button");
    await expect(micButton).toBeVisible();
    await expect(micButton).toHaveAttribute("data-state", "idle");

    await micButton.click();
    await expect(micButton).toHaveAttribute("data-state", "listening");

    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi there", { isFinal: true }));

    // The recognized text is echoed verbatim in the learner bubble — the
    // same pipeline the text form already uses — so a misrecognition would
    // be visible here rather than silently swallowed.
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi there");

    // Once submitted, the mic returns to idle rather than staying "listening".
    await expect(micButton).toHaveAttribute("data-state", "idle");

    // The conversation actually advanced through the same logic text input
    // would have triggered.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
  });

  test("an interim result is shown live near the mic before the final result is submitted", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(
      page,
      [
        {
          verdict: "accepted",
          reply_en: "Great, how are you today?",
          reply_zh: "太好了，你今天怎么样？",
          highlight_key: "natural-paraphrase",
        },
      ],
      { delayMs: 300 },
    );
    await page.goto(PRACTICE_URL);

    await page.getByTestId("practice-mic-button").click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi th", { isFinal: false }));

    // Interim text is visible but nothing has been submitted yet.
    await expect(page.getByTestId("practice-mic-status")).toHaveText("Hi th");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);

    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi there", { isFinal: true }));
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi there");
  });

  test("microphone permission denial auto-falls back to text input with an explanation, and text still works", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    await page.goto(PRACTICE_URL);

    await page.getByTestId("practice-mic-button").click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("not-allowed"));

    await expect(page.getByTestId("practice-input-fallback-reason")).toBeVisible();
    await expect(page.getByTestId("practice-text-input")).toBeVisible();
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);

    await page.getByTestId("practice-text-input").fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();

    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
  });

  test("when speech recognition is unsupported, the page auto-degrades to text input with an explanation, and the text path still fully works", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechRecognitionUnsupported(page);
    await installScriptedPracticeApi(
      page,
      [
        {
          verdict: "accepted",
          reply_en: "Great, how are you today?",
          reply_zh: "太好了，你今天怎么样？",
          highlight_key: "natural-paraphrase",
        },
      ],
      { delayMs: 300 },
    );
    await page.goto(PRACTICE_URL);

    // No mic UI at all; text input is already the active mode with an
    // explanation of why, and there's no point offering a manual switch
    // back to a mode that doesn't work.
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);
    await expect(page.getByTestId("practice-input-fallback-reason")).toBeVisible();
    await expect(page.getByTestId("practice-input-fallback-reason")).toContainText("语音识别");
    await expect(page.getByTestId("practice-input-mode-toggle")).toHaveCount(0);

    const textInput = page.getByTestId("practice-text-input");
    await expect(textInput).toBeVisible();

    await textInput.fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();

    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
  });

  test("the manual mode toggle switches between voice and text even when the mic works fine", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-mic-button")).toBeVisible();

    await page.getByTestId("practice-input-mode-toggle").click();
    await expect(page.getByTestId("practice-text-input")).toBeVisible();
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);
    // A deliberate manual switch isn't a "fallback" — no explanation shown.
    await expect(page.getByTestId("practice-input-fallback-reason")).toHaveCount(0);

    // Text mode works exactly like the standalone text form.
    await page.getByTestId("practice-text-input").fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");

    // Switching back to voice is available too.
    await page.getByTestId("practice-input-mode-toggle").click();
    await expect(page.getByTestId("practice-mic-button")).toBeVisible();
  });
});
