import { expect, test, type Page } from "@playwright/test";
import {
  installScriptedPracticeApi,
  mockSpeechApis,
  PRACTICE_URL,
  resetStorage,
  startSpeaking,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON, type ScriptLine } from "@/content/lesson";
import { AUDIO_MANIFEST } from "@/lib/audio-manifest";

/**
 * Issue #49's headline scenario, end to end (ADR-0012; docs/ai-configuration.md
 * section 3's `needs_retry` pool rule and section 4's "Verdict derivation —
 * all-or-nothing").
 *
 * The Focus Goal is Check-in and the learner says "I'm fine. See you later
 * alligator crocodile". The Judge reports `checkin: achieved` and `closing:
 * failed`, so the client derives `needs_retry` and none of the Turn is saved:
 * Goal Progress does not move and the progress steps keep their states. Emily
 * then speaks one line from the **Closing** `needs_retry` pool — the first
 * `failed` Goal in canonical order — never the Check-in pool written for the
 * Focus Goal whose Goal the learner just got right.
 *
 * The attempt still counts against the Focus Goal (src/lib/practice-state.ts
 * keys `attemptCounts` by the Goal a Turn was judged against), which is what
 * makes the following Turn's Check-in credit *not* first try — and what keeps
 * the failed Closing attempt out of the Learning Summary entirely.
 *
 * The Judge is stubbed (`installScriptedPracticeApi`, whose
 * `ScriptedTurnResponse` is exactly the report a real Judge returns);
 * everything else — Verdict derivation, Goal Progress, the retry-pool rule,
 * pool selection, the store, turn-taking and playback gating — runs real code
 * against a real `next build && next start` server.
 */

const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const CHECKIN_RETRY_TEXTS = GREETING_SOMEBODY_LESSON.script.checkin.needsRetryLines.map(
  (line) => line.en,
);
const CLOSING_RETRY_TEXTS = GREETING_SOMEBODY_LESSON.script.closing.needsRetryLines.map(
  (line) => line.en,
);
const RESPONSE_TEXTS = [
  ...GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack,
  ...GREETING_SOMEBODY_LESSON.responseLines.askedBack,
].map((line) => line.en);

/**
 * Each Closing `needs_retry` line's pre-generated file, from the same manifest
 * src/lib/speech-synthesis.ts resolves against at runtime — looked up rather
 * than hard-coded, so the playback test fails loudly if a pool line ever loses
 * its audio.
 */
const AUDIO_PATH_BY_TEXT = new Map(AUDIO_MANIFEST.map(({ id, text }) => [text, `/audio/${id}.mp3`]));

function audioPathsFor(lines: readonly ScriptLine[]): string[] {
  return lines.map((line) => {
    const path = AUDIO_PATH_BY_TEXT.get(line.en);
    if (!path) throw new Error(`no pre-generated audio in the manifest for "${line.en}"`);
    return path;
  });
}

const CLOSING_RETRY_AUDIO_PATHS = audioPathsFor(GREETING_SOMEBODY_LESSON.script.closing.needsRetryLines);

/** The persisted Practice snapshot — the store's own account of what the Turn saved (src/lib/practice-state.ts). */
async function persistedState(page: Page): Promise<{
  goalProgress: string[];
  attemptCounts: Record<string, number>;
  turnRecords: { state: string; passedFirstTry: boolean }[];
}> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("greeting-somebody:practice");
    if (raw === null) throw new Error("no persisted Practice snapshot");
    const snapshot = JSON.parse(raw) as {
      goalProgress: string[];
      attemptCounts: Record<string, number>;
      turnRecords: { state: string; passedFirstTry: boolean }[];
    };
    return {
      goalProgress: snapshot.goalProgress,
      attemptCounts: snapshot.attemptCounts,
      turnRecords: snapshot.turnRecords.map((record) => ({
        state: record.state,
        passedFirstTry: record.passedFirstTry,
      })),
    };
  });
}

async function playedSources(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__mockAudio?.getPlayedSources() ?? []);
}

test.describe("Practice page — a Turn with one Goal right and another wrong is needs_retry", () => {
  test("the ticket example: nothing is saved, Emily nudges the failed Goal, and the next Turn credits Check-in", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      // Turn 1 — the learner just greets, so the Focus Goal becomes Check-in,
      // the Goal the mixed-failure Turn is judged against.
      { goalReport: { greeting: "achieved" } },
      // Turn 2 — the ticket's Turn: Check-in right, Closing wrong.
      { goalReport: { checkin: "achieved", closing: "failed" } },
      // Turn 3 — the learner answers the Check-in cleanly.
      { goalReport: { checkin: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await submitReply(page, "Hi!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");

    await submitReply(page, "I'm fine. See you later alligator crocodile");

    // All-or-nothing (issue #49): every step keeps the state it had before the
    // Turn. Check-in is still the Focus Goal, and the Closing goodbye the
    // learner attempted does *not* complete its step.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "upcoming");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "upcoming");

    // Emily's one line comes from the Closing retry pool — the Goal that
    // failed, not the Focus Goal the learner just got right.
    const retryText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CLOSING_RETRY_TEXTS).toContain(retryText);
    expect(CHECKIN_RETRY_TEXTS).not.toContain(retryText);

    // Nothing from the Turn reached Goal Progress, and the attempt was booked
    // against the Focus Goal — Check-in — while the failed Closing attempt is
    // nowhere in the store at all. That is what keeps the Learning Summary
    // able to say "Check-in wasn't first try" without ever mentioning Closing.
    const afterMixedFailure = await persistedState(page);
    expect(afterMixedFailure.goalProgress).toEqual(["greeting"]);
    expect(afterMixedFailure.attemptCounts).toEqual({ greeting: 1, checkin: 1 });
    expect(afterMixedFailure.turnRecords).toEqual([{ state: "greeting", passedFirstTry: true }]);

    // The next Turn credits Check-in for real — as a second attempt, never a
    // first try, and still with no Closing record to explain.
    await submitReply(page, "I'm fine.");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "upcoming");

    const recoveryText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_TEXTS).toContain(recoveryText);
    expect(CHECKIN_TEXTS).not.toContain(recoveryText);

    const afterRecovery = await persistedState(page);
    expect(afterRecovery.goalProgress).toEqual(["greeting", "checkin"]);
    expect(afterRecovery.attemptCounts).toEqual({ greeting: 1, checkin: 2 });
    expect(afterRecovery.turnRecords).toEqual([
      { state: "greeting", passedFirstTry: true },
      { state: "checkin", passedFirstTry: false },
    ]);
  });

  test("Emily speaks the Closing retry line's own audio, and the microphone waits for her Handoff Gap", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved", closing: "failed" } },
    ]);
    await page.goto(PRACTICE_URL);

    const micButton = page.getByTestId("practice-mic-button");
    const baseUrl = page.url();

    // Turn 1 over voice, so the mic tap is also the gesture that unlocks the
    // reusable audio element (e2e/fixtures.ts's `<audio>` stub models iOS's
    // per-element rule).
    await startSpeaking(page);
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("Hi!", { isFinal: true }),
    );
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    // Source 1 is the muted unlock play from the mic tap; source 2 is Emily's
    // Check-in steer line.
    await expect.poll(async () => (await playedSources(page)).length).toBe(2);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled({ timeout: 10_000 });

    // Turn 2 — the mixed-failure Turn.
    await startSpeaking(page);
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("I'm fine. See you later alligator crocodile", {
        isFinal: true,
      }),
    );

    // The one line she speaks is the Closing retry line, by its own audio file
    // (an absolute URL — assigning a relative path to `HTMLMediaElement.src`
    // resolves it against the document, which is what the stub records).
    await expect.poll(async () => (await playedSources(page)).length).toBe(3);
    const retrySource = (await playedSources(page))[2];
    expect(
      CLOSING_RETRY_AUDIO_PATHS.map((path) => new URL(path, baseUrl).toString()),
    ).toContain(retrySource);
    await expect(micButton).toBeDisabled();
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");

    // And the floor comes back only after her line has ended plus one Handoff
    // Gap — the retry Turn does not end Emily's turn any earlier than a clean
    // one does.
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(page.getByTestId("practice-mic-status")).toContainText("Wait for her voice to settle");
    await expect(micButton).toBeEnabled({ timeout: 10_000 });

    // Still the Focus Goal's own step, still nothing saved.
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
  });
});
