import { test, expect } from "@playwright/test";
import {
  installScriptedChineseExplanationApi,
  installScriptedPracticeApi,
  mockSpeechApis,
  PRACTICE_URL,
  resetStorage,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * E2E coverage for issue #19 ("Chinese help becomes a spoken mode with its
 * own seam"). Same primary seam as the rest of the Practice suite: a real
 * browser drives the whole app, with exactly two boundaries stubbed — the
 * turn endpoint (`/api/practice/turn`, via `installScriptedPracticeApi`)
 * and, new for this ticket, the Chinese-explanation endpoint
 * (`/api/practice/explain`, via `installScriptedChineseExplanationApi`) —
 * plus the Web Speech API stub for the language-switching assertions.
 *
 * Complements e2e/practice-support.spec.ts's existing "opening and closing
 * Ask in Chinese leaves the conversation state untouched" test, which
 * covers the sheet's pre-#19 baseline (initial tap, close button, no turn
 * calls) and is left unchanged.
 */

const GREETING_HELP = GREETING_SOMEBODY_LESSON.chineseHelp.greeting;

test.describe("Practice page — Chinese help mode", () => {
  test("initial tap plays the canned text with no model call", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    let explainCalls = 0;
    await installScriptedChineseExplanationApi(page, [{ answerZh: "不应该被调用" }]);
    page.on("request", (request) => {
      if (/\/api\/practice\/explain/.test(request.url())) explainCalls += 1;
    });

    await page.goto(PRACTICE_URL);
    await page.getByTestId("ask-in-chinese-button").click();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toBeVisible();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toContainText(GREETING_HELP.meaning);

    expect(explainCalls).toBe(0);
  });

  test("a Chinese follow-up (typed) gets a model-generated Chinese answer", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await installScriptedChineseExplanationApi(page, [{ answerZh: "这句话的意思是打招呼。" }]);

    await page.goto(PRACTICE_URL);
    await page.getByTestId("ask-in-chinese-button").click();

    await page.getByTestId("ask-in-chinese-text-input").fill("能再解释一下吗？");
    await page.getByTestId("ask-in-chinese-send-button").click();

    await expect(page.getByTestId("ask-in-chinese-followup-answer")).toHaveText("这句话的意思是打招呼。");
    await expect(page.getByTestId("ask-in-chinese-followup-answer")).toHaveAttribute("data-fallback", "false");

    // Conversation State is untouched by a Chinese follow-up.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
  });

  test("a failed explanation call degrades to the canned four-part text", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await installScriptedChineseExplanationApi(page, [{ fail: true }]);

    await page.goto(PRACTICE_URL);
    await page.getByTestId("ask-in-chinese-button").click();

    await page.getByTestId("ask-in-chinese-text-input").fill("能再解释一下吗？");
    await page.getByTestId("ask-in-chinese-send-button").click();

    const answer = page.getByTestId("ask-in-chinese-followup-answer");
    await expect(answer).toHaveAttribute("data-fallback", "true");
    await expect(answer).toContainText(GREETING_HELP.meaning);
  });

  test("speech recognition switches to Chinese in help mode and back to English on exit", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await installScriptedChineseExplanationApi(page, [{ answerZh: "解释内容。" }]);
    await mockSpeechApis(page);

    await page.goto(PRACTICE_URL);

    // Outside help mode: the main mic listens in English.
    await page.getByTestId("practice-mic-button").click();
    const outsideLang = await page.evaluate(() => window.__mockSpeechRecognition?.getLang());
    expect(outsideLang).toBe("en-US");
    await page.evaluate(() => window.__mockSpeechRecognition?.emitEnd());

    // Inside help mode: the sheet's own mic listens in Chinese.
    await page.getByTestId("ask-in-chinese-button").click();
    await page.getByTestId("ask-in-chinese-mic-button").click();
    const insideLang = await page.evaluate(() => window.__mockSpeechRecognition?.getLang());
    expect(insideLang).toBe("zh-CN");

    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("这是什么意思", { isFinal: true }),
    );
    await expect(page.getByTestId("ask-in-chinese-followup-answer")).toHaveText("解释内容。");

    // Closing help mode and using the main mic again reverts to English.
    await page.getByTestId("ask-in-chinese-close-button").click();
    await page.getByTestId("practice-mic-button").click();
    const backToEnglishLang = await page.evaluate(() => window.__mockSpeechRecognition?.getLang());
    expect(backToEnglishLang).toBe("en-US");
  });

  test("speaking/typing English while in help mode exits help mode and submits the turn", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await installScriptedChineseExplanationApi(page, [{ answerZh: "解释内容。" }]);

    await page.goto(PRACTICE_URL);
    await page.getByTestId("ask-in-chinese-button").click();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toBeVisible();

    await page.getByTestId("ask-in-chinese-text-input").fill("Hi Emily!");
    await page.getByTestId("ask-in-chinese-send-button").click();

    // Help mode closed itself, and the English text was submitted as a
    // normal turn — advancing the conversation past greeting.
    await expect(page.getByTestId("ask-in-chinese-sheet")).toHaveCount(0);
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
  });
});
