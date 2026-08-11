import { expect, test, type Page } from "@playwright/test";
import {
  installScriptedPracticeApi,
  mockSpeechApis,
  PRACTICE_URL,
  resetStorage,
  startSpeaking,
  submitReply,
} from "./fixtures";

async function playedSources(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__mockAudio?.getPlayedSources() ?? []);
}

async function expectPlaybackCount(page: Page, count: number): Promise<void> {
  await expect.poll(() => playedSources(page)).toHaveLength(count);
}

async function finishEmilyLine(page: Page): Promise<void> {
  await page.evaluate(() => window.__mockAudio?.endCurrent());
}

test.describe("Practice page — iOS audio element reuse", () => {
  test("a microphone gesture unlocks audio without replaying Emily, then delayed programmatic playback still starts", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    // Chromium's transient user activation lasts several seconds. Waiting
    // beyond it proves the reply is authorized by the reused element, not by
    // the Send click that began this turn.
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }], { delayMs: 5_500 });
    await page.goto(PRACTICE_URL);

    await startSpeaking(page);
    await expect.poll(() => page.evaluate(() => window.__mockAudio?.isUnlocked())).toBe(true);
    // Only the muted unlock source entered playback. The opening line's
    // assertive retry deliberately ignores the microphone gesture.
    await expectPlaybackCount(page, 1);

    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi Emily!", { isFinal: true }));

    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current", {
      timeout: 10_000,
    });
    await expectPlaybackCount(page, 2);
    expect((await playedSources(page))[1]).toContain("/audio/checkin-");
  });

  test("every Emily reply in a four-turn voice conversation enters playback", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [
      { verdict: "accepted" },
      { verdict: "accepted", learner_asked_back: true },
      { verdict: "accepted" },
      { verdict: "accepted" },
    ]);
    await page.goto(PRACTICE_URL);

    const replies = ["Hi there!", "I'm good, and you?", "Heading to work.", "Take care!"];
    for (let turn = 0; turn < replies.length; turn += 1) {
      await startSpeaking(page);
      await page.evaluate((reply) => {
        window.__mockSpeechRecognition?.emitResult(reply, { isFinal: true });
      }, replies[turn]);
      // Count includes the one muted unlock play from the first mic gesture.
      await expectPlaybackCount(page, turn + 2);
      await finishEmilyLine(page);
    }

    await expect(page.getByTestId("view-summary-button")).toBeEnabled();
  });

  test("every Emily reply in a four-turn text conversation enters playback", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [
      { verdict: "accepted" },
      { verdict: "accepted", learner_asked_back: true },
      { verdict: "accepted" },
      { verdict: "accepted" },
    ]);
    await page.goto(PRACTICE_URL);

    await startSpeaking(page);
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("not-allowed"));
    await expect(page.getByTestId("practice-text-input")).toBeVisible();

    const replies = ["Hi there!", "I'm good, and you?", "Heading to work.", "Take care!"];
    const expectedAudioPaths = ["/audio/checkin-", "/audio/response-", "/audio/closing-", "/audio/completion-"];
    for (let turn = 0; turn < replies.length; turn += 1) {
      await submitReply(page, replies[turn]);
      await expect
        .poll(async () => (await playedSources(page)).some((source) => source.includes(expectedAudioPaths[turn])))
        .toBe(true);
      await finishEmilyLine(page);
      // Let speakAssertively observe the ended event and disarm its retry
      // before the next turn's typing produces another interaction.
      await page.waitForTimeout(50);
    }

    await expect(page.getByTestId("view-summary-button")).toBeEnabled();
  });
});
