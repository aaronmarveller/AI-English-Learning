import { expect, test } from "@playwright/test";
import {
  absoluteAudioUrls,
  audioPathsFor,
  installScriptedPracticeApi,
  mockSpeechApis,
  persistedMessages,
  playedSources,
  PRACTICE_URL,
  resetStorage,
  startSpeaking,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * Issue #48's headline scenario, end to end (ADR-0012;
 * docs/ai-configuration.md section 3's "Line composition").
 *
 * One learner Turn — "Hi Emily! I'm good, thanks. How are you?" — achieves
 * three Conversation Goals at once, so the Judge's Goal Report names all three
 * (the shape #47's protocol already allows, and this ticket is the first to
 * exercise). Emily's reply is then a *sequence* of existing Conversation
 * Script lines: the Response pool's reaction (her answer to "How are you?"),
 * then the Closing pool's steer toward the new Focus Goal — never the Check-in
 * pool's "How are you doing today?".
 *
 * The Judge is stubbed (e2e/fixtures.ts's `installScriptedPracticeApi`, whose
 * `ScriptedTurnResponse` is exactly the report a real Judge would return);
 * everything else — Verdict derivation, Goal Progress, line selection, the
 * store, turn-taking and playback gating — runs real code against a real
 * `next build && next start` server.
 */

const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const RESPONSE_ASKED_BACK_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.askedBack.map(
  (line) => line.en,
);
const CLOSING_TEXTS = GREETING_SOMEBODY_LESSON.closingLines.map((line) => line.en);
const COMPLETION_TEXTS = [...GREETING_SOMEBODY_LESSON.completionMessages];

/**
 * The pre-generated file each Conversation Script line plays, from the same
 * manifest src/lib/speech-synthesis.ts resolves against at runtime
 * (e2e/fixtures.ts's `audioPathsFor`, which also has `absoluteAudioUrls` for
 * the resolved-form comparison the assertions below need). Looked up rather
 * than hard-coded, so this spec fails loudly if a pool line ever loses its
 * audio — issue #48's "no new audio files are needed" criterion is that this
 * never misses.
 */
const REACTION_AUDIO_PATHS = audioPathsFor(GREETING_SOMEBODY_LESSON.responseLines.askedBack);
const STEER_AUDIO_PATHS = audioPathsFor(GREETING_SOMEBODY_LESSON.closingLines);

test.describe("Practice page — one Turn, several Goals, a sequence of Script lines", () => {
  test("the ticket example: one message achieves three Goals, Emily reacts then steers to Closing, and a goodbye completes Practice", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        goalReport: { greeting: "achieved", checkin: "achieved", response: "achieved" },
        learner_asked_back: true,
      },
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");

    await submitReply(page, "Hi Emily! I'm good, thanks. How are you?");

    // Three steps completed out of one Turn, and the Focus Goal moved on to
    // the one Goal still open.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "current");

    // Both of Emily's lines are in the current-turn bubble, in order: the
    // reaction to the check-in, then the steer toward Closing.
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_ASKED_BACK_TEXTS.some((line) => replyText.startsWith(line))).toBe(true);
    expect(CLOSING_TEXTS.some((line) => replyText.endsWith(line))).toBe(true);
    // Never the Check-in pool: the learner just said how they were doing.
    expect(CHECKIN_TEXTS.some((line) => replyText.includes(line))).toBe(false);

    // The transcript keeps one message per Script line — the two of this Turn
    // are its last two Emily messages, in order, each with its own Chinese
    // subtitle. (Joined into one message, `reactionLine.textEn` would be
    // neither pool's line and would fail below.)
    const messages = await persistedMessages(page);
    const emilyLines = messages.filter((message) => message.role === "emily");
    const [reactionLine, steerLine] = emilyLines.slice(-2);
    expect(RESPONSE_ASKED_BACK_TEXTS).toContain(reactionLine.textEn);
    expect(CLOSING_TEXTS).toContain(steerLine.textEn);
    expect(reactionLine.textZh.length).toBeGreaterThan(0);
    expect(steerLine.textZh.length).toBeGreaterThan(0);

    // The next accepted goodbye completes Practice.
    await submitReply(page, "See you!");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("view-summary-button")).toBeEnabled();

    const completionText = await page.getByTestId("emily-message-bubble").innerText();
    expect(COMPLETION_TEXTS).toContain(completionText);
  });

  test("Emily's two lines play back sequentially, and the microphone waits for the last one's Handoff Gap", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [
      {
        goalReport: { greeting: "achieved", checkin: "achieved", response: "achieved" },
        learner_asked_back: true,
      },
    ]);
    await page.goto(PRACTICE_URL);

    // The mic tap is also the gesture that unlocks the reusable audio element
    // (e2e/fixtures.ts's `<audio>` stub models iOS's per-element rule), so the
    // sequence below plays through the pre-generated files for real.
    await startSpeaking(page);
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("Hi Emily! I'm good, thanks. How are you?", {
        isFinal: true,
      }),
    );

    // Source 1 is the muted unlock play from the mic tap; source 2 is the
    // first line of Emily's sequence.
    await expect.poll(async () => (await playedSources(page)).length).toBe(2);
    const micButton = page.getByTestId("practice-mic-button");
    const baseUrl = page.url();
    const reactionSource = (await playedSources(page))[1];
    expect(absoluteAudioUrls(REACTION_AUDIO_PATHS, baseUrl)).toContain(reactionSource);
    await expect(micButton).toBeDisabled();
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");

    // Line 1 ends. The floor must not come back: line 2 starts, and the mic
    // stays unavailable across the whole sequence.
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect.poll(async () => (await playedSources(page)).length).toBe(3);
    const playedTurn = await playedSources(page);
    const steerSource = playedTurn[2];
    expect(absoluteAudioUrls(STEER_AUDIO_PATHS, baseUrl)).toContain(steerSource);
    await expect(micButton).toBeDisabled();
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");

    // The last line ends → one Handoff Gap, then the learner's turn.
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(page.getByTestId("practice-mic-status")).toContainText("Wait for her voice to settle");
    await expect(micButton).toBeDisabled();
    await expect(micButton).toBeEnabled({ timeout: 10_000 });

    // The 🔊 replay button re-speaks the same two lines, one file at a time —
    // not their joined text, which matches no audio manifest entry and would
    // send the replay to the live-TTS route instead.
    await page.getByTestId("replay-button").click();
    await expect.poll(async () => (await playedSources(page)).length).toBe(4);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect.poll(async () => (await playedSources(page)).length).toBe(5);
    expect((await playedSources(page)).slice(3)).toEqual([reactionSource, steerSource]);
  });

  test("a non-contiguous Goal Progress set renders completed steps with a gap, and steers at the one left open", async ({
    page,
  }) => {
    await resetStorage(page);
    // The learner greeted and acknowledged Emily, but never said how they were
    // doing: `checkin` stays open while `response` is credited, so the
    // completed set has a gap and the Focus Goal sits inside it — the shape
    // ADR-0012 allows and #47's one-Goal-per-Turn conversations never produce.
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved", response: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi Emily! Thanks — and how are you?");

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "upcoming");

    // Emily steers at the Goal still open — the Check-in pool — rather than at
    // the Goal she just watched the learner clear.
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });
});
