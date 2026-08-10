import { expect, test } from "@playwright/test";
import {
  installScriptedPracticeApi,
  mockSpeechApis,
  PRACTICE_URL,
  resetStorage,
} from "./fixtures";
import { PLAYBACK_START_TIMEOUT_MS } from "@/lib/speech-synthesis";

test.describe("Practice turn-taking", () => {
  test("Practice mic waits for Emily while text input remains available", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await page.goto(PRACTICE_URL);

    await page.getByTestId("practice-mic-button").click();
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("Hi Emily!", { isFinal: true }),
    );
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBe(2);

    const micButton = page.getByTestId("practice-mic-button");
    await expect(micButton).toBeDisabled();
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");

    await page.getByTestId("practice-input-mode-toggle").click();
    await expect(page.getByTestId("practice-text-input")).toBeEnabled();
    await page.getByTestId("practice-input-mode-toggle").click();
    await expect(micButton).toBeDisabled();

    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled();
  });

  test("Ask-in-Chinese mic waits for Emily while Chinese text input remains available", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await page.goto(PRACTICE_URL);

    await page.getByTestId("ask-in-chinese-button").click();
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBe(2);

    const micButton = page.getByTestId("ask-in-chinese-mic-button");
    await expect(micButton).toBeDisabled();
    await expect(page.getByTestId("ask-in-chinese-mic-status")).toContainText("Emily is speaking");
    await expect(page.getByTestId("ask-in-chinese-text-input")).toBeEnabled();

    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled();
    await micButton.click();
    await expect(micButton).toHaveAttribute("data-state", "listening");
    expect(await page.evaluate(() => window.__mockSpeechRecognition?.getLang())).toBe("zh-CN");
  });

  test("Practice mic recovers after every audio playback tier fails", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await page.goto(PRACTICE_URL);

    await page.getByTestId("practice-mic-button").click();
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("Hi Emily!", { isFinal: true }),
    );

    const micButton = page.getByTestId("practice-mic-button");
    await expect(micButton).toBeDisabled();

    // The fixed-file failure falls through to live audio; failing that tier
    // too reaches the fixture's immediately-ending browser synthesis rung.
    await page.evaluate(() => window.__mockAudio?.failCurrent());
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBe(3);
    await page.evaluate(() => window.__mockAudio?.failCurrent());

    await expect(micButton).toBeEnabled();
  });

  test("Practice mic recovers when audio never starts before the watchdog expires", async ({
    page,
  }) => {
    test.setTimeout(PLAYBACK_START_TIMEOUT_MS + 15_000);
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
    await page.goto(PRACTICE_URL);

    await page.getByTestId("practice-mic-button").click();
    await page.evaluate(() => window.__mockAudio?.stallNext());
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("Hi Emily!", { isFinal: true }),
    );

    const micButton = page.getByTestId("practice-mic-button");
    await expect(micButton).toBeDisabled();

    await expect(micButton).toBeEnabled({ timeout: PLAYBACK_START_TIMEOUT_MS + 5_000 });
  });
});
