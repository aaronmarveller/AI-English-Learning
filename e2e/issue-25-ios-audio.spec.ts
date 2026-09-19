import { expect, test, type Page } from "@playwright/test";
import {
  absoluteAudioUrls,
  audioPathsForTexts,
  installScriptedPracticeApi,
  mockSpeechApis,
  PRACTICE_URL,
  resetStorage,
  startSpeaking,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

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
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 5_500 });
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
    // Issue #47: one Goal Report per Turn, each naming the one Goal that
    // reply below communicates (`greeting`, then `checkin`, and so on).
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: true },
      { goalReport: { response: "achieved" } },
      { goalReport: { closing: "achieved" } },
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
    // Issue #47: one Goal Report per Turn, each naming the one Goal that
    // reply below communicates (`greeting`, then `checkin`, and so on).
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: true },
      { goalReport: { response: "achieved" } },
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await startSpeaking(page);
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("not-allowed"));
    await expect(page.getByTestId("practice-text-input")).toBeVisible();

    const replies = ["Hi there!", "I'm good, and you?", "Heading to work.", "Take care!"];
    // The first three Turns' lines each come from one pool, and every id in
    // those pools shares a prefix, so a prefix is enough there. The final
    // Turn's Line comes from the Completion pool, which issue #55 re-authored
    // into farewells: "See you!" is also Explore's `closing-see-you`, so a
    // `/audio/completion-` prefix is wrong about a third of the time. Derived
    // from the pool instead — still an assertion that the final Line produced
    // playback (an empty or missing source fails the poll), just not one that
    // assumes which recording it is.
    //
    // Every poll below looks only at plays that started *after* this Turn's
    // Send click (`playedBefore`): the Completion pool sharing a recording with
    // the Closing pool means the final Turn's URL can already be in the list
    // from the Turn before it, and a poll that matched that stale entry would
    // call `endCurrent()` before the final line had even started — leaving it
    // playing and the summary button disabled.
    const expectedAudioPathPrefixes = ["/audio/checkin-", "/audio/response-", "/audio/closing-"];
    // Absolute URLs, derived from the page's own origin (this repo's e2e
    // pattern — see practice-multi-goal.spec.ts's `page.url()`), because
    // assigning a relative path to `HTMLMediaElement.src` resolves it against
    // the document and the `<audio>` stub records the resolved value.
    const completionAudioUrls = absoluteAudioUrls(
      audioPathsForTexts(GREETING_SOMEBODY_LESSON.completionMessages),
      page.url(),
    );
    for (let turn = 0; turn < replies.length; turn += 1) {
      const playedBefore = (await playedSources(page)).length;
      await submitReply(page, replies[turn]);
      const isFinalTurn = turn === replies.length - 1;
      await expect
        .poll(async () => {
          const sources = (await playedSources(page)).slice(playedBefore);
          return isFinalTurn
            ? sources.some((source) => completionAudioUrls.includes(source))
            : sources.some((source) => source.includes(expectedAudioPathPrefixes[turn]));
        })
        .toBe(true);
      await finishEmilyLine(page);
      // Let speakAssertively observe the ended event and disarm its retry
      // before the next turn's typing produces another interaction.
      await page.waitForTimeout(50);
    }

    await expect(page.getByTestId("view-summary-button")).toBeEnabled();
  });
});
