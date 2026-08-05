import { test, expect, type Page } from "@playwright/test";
import { installScriptedPracticeApi, mockSpeechApis, PRACTICE_URL, resetStorage } from "./fixtures";

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
 * The scripted LLM proxy stub helper (`installScriptedPracticeApi`) also
 * lives in e2e/fixtures.ts, shared with practice-conversation.spec.ts,
 * practice-support.spec.ts, and review.spec.ts (consolidated by issue #10 —
 * this file used to keep its own copy per ticket 08's file-ownership
 * boundary, which no longer applies now that both tickets are long since
 * merged).
 */

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
