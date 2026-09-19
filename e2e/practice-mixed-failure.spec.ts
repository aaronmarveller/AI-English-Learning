import { expect, test, type Page } from "@playwright/test";
import {
  absoluteAudioUrls,
  audioPathsFor,
  emilyLines,
  installScriptedPracticeApi,
  mockSpeechApis,
  persistedPracticeSnapshot,
  playedSources,
  PRACTICE_URL,
  recoveryQuestionLine,
  resetStorage,
  startSpeaking,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * Issue #49's headline scenario, end to end (ADR-0012; docs/ai-configuration.md
 * section 3's "Recovery" rule and section 4's "Verdict derivation —
 * all-or-nothing"), re-grained by issue #56 into the two-tier Recovery.
 *
 * The Focus Goal is Check-in and the learner says "I'm fine. See you later
 * alligator crocodile". The Judge reports `checkin: achieved` and `closing:
 * failed`, so the client derives `needs_retry` and none of the Turn is saved:
 * Goal Progress does not move and the progress steps keep their states. Emily
 * then speaks the **Closing** Recovery — the first `failed` Goal in canonical
 * order — never the Check-in one written for the Focus Goal whose Goal the
 * learner just got right. Because the report has a `failed` Goal, that Recovery
 * is the `unclear` variant's two lines: the shared "Sorry, I didn't quite get
 * that." and then Closing's own question (issue #56; v2 ticket 8's "First
 * Try"), and it is the *first* `needs_retry` Turn on this Focus Goal, so the
 * Retry Streak is 0 and tier 1 is what it gets — tier 2's direct example (the
 * `unclear`/`off-topic`-independent single line) would only come on a second
 * consecutive retry, which this spec's three-Turn conversation never reaches.
 *
 * The retry still counts against the Focus Goal (src/lib/practice-state.ts
 * keys `retryCounts` by the Goal a Turn was judged against), which is what
 * makes the following Turn's Check-in credit *not* first try — and what keeps
 * the failed Closing attempt out of the Learning Summary entirely. Turn 1's
 * clean greeting books nothing: only a `needs_retry` Turn is a retry.
 *
 * The Judge is stubbed (`installScriptedPracticeApi`, whose
 * `ScriptedTurnResponse` is exactly the report a real Judge returns);
 * everything else — Verdict derivation, Goal Progress, the retry-pool rule,
 * Recovery selection, the store, turn-taking and playback gating — runs real
 * code against a real `next build && next start` server.
 */

const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const RESPONSE_TEXTS = [
  ...GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack,
  ...GREETING_SOMEBODY_LESSON.responseLines.askedBack,
].map((line) => line.en);

/**
 * The two lines the mixed Turn's Recovery must speak, in order: Closing's
 * `unclear` nudge (the sentence v2 ticket 8 repeats in all four of its rows)
 * and then Closing's question — derived from the Lesson, so neither can drift.
 */
const CLOSING_RECOVERY_TIER_ONE_TEXTS = [
  GREETING_SOMEBODY_LESSON.script.closing.recovery.unclearNudge.en,
  recoveryQuestionLine("closing").en,
];

/**
 * Each of those two lines' pre-generated file, from the same manifest
 * src/lib/speech-synthesis.ts resolves against at runtime (e2e/fixtures.ts's
 * `audioPathsFor`) — looked up rather than hard-coded, so the playback test
 * fails loudly if a Recovery line ever loses its audio. Two entries because a
 * Recovery is a sequence: the shared `unclear` nudge and the Goal's question
 * each have their own recording (issue #56's ten new files).
 */
const CLOSING_RECOVERY_AUDIO_PATHS = [
  audioPathsFor([GREETING_SOMEBODY_LESSON.script.closing.recovery.unclearNudge]),
  audioPathsFor([recoveryQuestionLine("closing")]),
];

/**
 * The fields this spec asserts on, projected off the shared persisted snapshot
 * (e2e/fixtures.ts's `persistedPracticeSnapshot`).
 */
async function persistedState(page: Page): Promise<{
  goalProgress: string[];
  retryCounts: Record<string, number>;
  retryStreak: { goal: string; count: number } | null;
  turnRecords: { state: string; passedFirstTry: boolean }[];
}> {
  const snapshot = await persistedPracticeSnapshot(page);
  return {
    goalProgress: snapshot.goalProgress ?? [],
    retryCounts: snapshot.retryCounts ?? {},
    retryStreak: snapshot.retryStreak ?? null,
    turnRecords: (snapshot.turnRecords ?? []).map((record) => ({
      state: record.state,
      passedFirstTry: record.passedFirstTry,
    })),
  };
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

    // Emily's two lines come from the Closing Recovery — the Goal that failed,
    // not the Focus Goal the learner just got right. Exactly those two, in
    // order, shown as the one bubble a Turn's lines always share: the second
    // line (Closing's own question) is what makes the Goal this Recovery talks
    // about observable at all, because the `unclear` nudge is one shared
    // sentence. Tier 1, not the direct example: this is the first `needs_retry`
    // Turn on Check-in, so the Retry Streak is 0.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(
      CLOSING_RECOVERY_TIER_ONE_TEXTS.join(" "),
    );
    const turnLines = (await emilyLines(page)).slice(-CLOSING_RECOVERY_TIER_ONE_TEXTS.length);
    expect(turnLines).toEqual(CLOSING_RECOVERY_TIER_ONE_TEXTS);

    // Never anything Check-in's — neither the pool the learner was just asked
    // with, nor the half of the Check-in Recovery that is its own (its
    // off-topic nudge and its direct example; its `unclear` nudge is the same
    // shared sentence Closing's is, so that one is not Check-in-specific).
    const checkinRecovery = GREETING_SOMEBODY_LESSON.script.checkin.recovery;
    for (const line of CLOSING_RECOVERY_TIER_ONE_TEXTS) {
      expect(CHECKIN_TEXTS).not.toContain(line);
      expect(line).not.toBe(checkinRecovery.offTopicNudge?.en);
      expect(line).not.toBe(checkinRecovery.directExample.en);
    }

    // Nothing from the Turn reached Goal Progress, and the retry was booked
    // against the Focus Goal — Check-in — while the failed Closing attempt is
    // nowhere in the store at all. That is what keeps the Learning Summary
    // able to say "Check-in wasn't first try" without ever mentioning Closing.
    // Turn 1's accepted greeting is not in `retryCounts`: an accepted Turn is
    // not a retry, so it books nothing. The Retry Streak is now Check-in's own
    // first retry (issue #56) — which is exactly why this Turn got tier 1.
    const afterMixedFailure = await persistedState(page);
    expect(afterMixedFailure.goalProgress).toEqual(["greeting"]);
    expect(afterMixedFailure.retryCounts).toEqual({ checkin: 1 });
    expect(afterMixedFailure.retryStreak).toEqual({ goal: "checkin", count: 1 });
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
    // Still one retry on Check-in — the accepted Turn that followed is not
    // counted, only read — and the streak is cleared by it, which is what
    // returns the learner to the normal flow (issue #56).
    expect(afterRecovery.retryCounts).toEqual({ checkin: 1 });
    expect(afterRecovery.retryStreak).toBeNull();
    expect(afterRecovery.turnRecords).toEqual([
      { state: "greeting", passedFirstTry: true },
      { state: "checkin", passedFirstTry: false },
    ]);
  });

  test("Emily speaks both of the Closing Recovery's own audio files, in order, and the microphone waits for her Handoff Gap", async ({
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
    const closingRecoveryUrls = CLOSING_RECOVERY_AUDIO_PATHS.map((paths) =>
      absoluteAudioUrls(paths, baseUrl),
    );

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

    // The Recovery's FIRST line plays from its own file: the shared `unclear`
    // nudge (an absolute URL — assigning a relative path to
    // `HTMLMediaElement.src` resolves it against the document, which is what
    // the stub records).
    await expect.poll(async () => (await playedSources(page)).length).toBe(3);
    expect(closingRecoveryUrls[0]).toContain((await playedSources(page))[2]);
    await expect(micButton).toBeDisabled();
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");

    // The first line ends and the floor must NOT come back: it is one Turn, so
    // the Goal's question follows immediately, and the mic stays unavailable
    // across both lines.
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect.poll(async () => (await playedSources(page)).length).toBe(4);
    expect(closingRecoveryUrls[1]).toContain((await playedSources(page))[3]);
    await expect(micButton).toBeDisabled();
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");

    // And the floor comes back only after the second line has ended plus one
    // Handoff Gap — the retry Turn does not end Emily's turn any earlier than a
    // clean one does.
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(page.getByTestId("practice-mic-status")).toContainText("Wait for her voice to settle");
    await expect(micButton).toBeEnabled({ timeout: 10_000 });

    // Still the Focus Goal's own step, still nothing saved.
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
  });
});
