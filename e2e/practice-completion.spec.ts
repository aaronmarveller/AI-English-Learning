import { expect, test, type Page } from "@playwright/test";
import {
  absoluteAudioUrls,
  audioPathsForTexts,
  installScriptedPracticeApi,
  mockSpeechApis,
  persistedMessages,
  playedSources,
  PRACTICE_URL,
  resetStorage,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { HANDOFF_GAP_MS } from "@/lib/speech-synthesis";

/**
 * Issue #55's completion behaviour, end to end (v2 tickets 5 and 11; AC 3, 4
 * and 5): what happens on the Turn that finally puts all four Goals in Goal
 * Progress.
 *
 * - **One final line, and nothing after it.** The Turn that completes Practice
 *   persists exactly one new Emily message — the Completion pool's line — and
 *   once Practice is complete nothing further is requested: the spec reads the
 *   stub's own request count (`installScriptedPracticeApi`'s handle) before and
 *   after a wait, and watches the transcript for an extra Emily line as the
 *   visible consequence.
 * - **Review unlocks after she has finished speaking, not before.** The
 *   `view-summary-button` is gated on Turn-Taking's "speaking" state rather
 *   than on completion alone: while the final line is still playing, all four
 *   progress steps read `completed` (Practice *is* complete) and the button is
 *   still disabled. Ending the playback enables it — deliberately *during* the
 *   Handoff Gap that follows, because that gap is a microphone rule and Review
 *   is navigation (see practice-page-content.tsx's comment on the button).
 * - **Practice never completes with fewer than four Goals.** A Turn that
 *   achieves `closing` while earlier Goals are still open speaks the ordinary
 *   composition — a steer toward the first open Goal — and completes nothing.
 *   (A Closing-pool *steer* on a non-completing Turn is ordinary, and
 *   practice-multi-goal.spec.ts asserts one: it appears whenever the new Focus
 *   Goal is `closing`. On *this* Turn — the one that achieved `closing` rather
 *   than one that awaits it — `closing` is already in Goal Progress, so the only
 *   Closing line the composition could add is #50's Farewell, and that exists
 *   only on the completing Turn — practice-steering-back.spec.ts covers it.)
 *
 * The Judge is stubbed (e2e/fixtures.ts's `installScriptedPracticeApi`, whose
 * `ScriptedTurnResponse` is exactly the report a real Judge would return);
 * everything else — Verdict derivation, Goal Progress, line composition, the
 * store, Turn-Taking, and the progress steps — runs real code against a real
 * `next build && next start` server. Audio is the fixture's controllable fake,
 * so "Emily is still speaking" is a real Turn-Taking state rather than a
 * timing guess.
 */

const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const RESPONSE_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.map((line) => line.en);
const CLOSING_TEXTS = GREETING_SOMEBODY_LESSON.closingLines.map((line) => line.en);
const COMPLETION_TEXTS = [...GREETING_SOMEBODY_LESSON.completionMessages];

/**
 * The manifest path (relative — absolute URLs are built per test from the
 * page's own origin, this repo's e2e pattern) every line of a pool can play.
 * Deriving them from the manifest rather than hard-coding is necessary rather
 * than tidy here: the Completion pool's "See you!" is Explore's
 * `closing-see-you` recording (issue #55), so there is no one
 * `/audio/completion-` prefix to assert on.
 */
const COMPLETION_AUDIO_PATHS = audioPathsForTexts(COMPLETION_TEXTS);

/**
 * The audio the Turn at `index` of the four-turn conversation below speaks.
 * The pools are distinct per Turn except for their overlap with the previous
 * one (issue #55: the Completion pool's "See you!" is the Closing pool's third
 * line), which the polling helpers below handle by only ever looking at plays
 * that started *after* a given Turn's Send click.
 */
const TURN_AUDIO_PATHS = [
  audioPathsForTexts(CHECKIN_TEXTS),
  audioPathsForTexts(RESPONSE_TEXTS),
  audioPathsForTexts(CLOSING_TEXTS),
  COMPLETION_AUDIO_PATHS,
];

/** Emily's spoken lines, in order — one persisted message per Conversation Script line. */
async function emilyLines(page: Page): Promise<string[]> {
  const messages = await persistedMessages(page);
  return messages.filter((message) => message.role === "emily").map((message) => message.textEn);
}

/**
 * Waits until one of `urls` enters playback, considering only the plays that
 * started after `playedBefore` — the count read immediately before the Send
 * click being tested. Without that slice a pool that shares a recording with an
 * earlier Turn's (which is exactly what #55 introduced) would satisfy the poll
 * on a stale entry.
 */
async function expectNewPlayback(page: Page, playedBefore: number, urls: string[]): Promise<void> {
  await expect
    .poll(async () => (await playedSources(page)).slice(playedBefore).some((source) => urls.includes(source)))
    .toBe(true);
}

test.describe("Practice completion — one final line, then Review unlocks", () => {
  test("the closing Turn completes Practice, speaks one Completion line, and gates Review on her finishing it", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    // One Goal per Turn, in canonical order, so the fourth Turn is the one that
    // puts the last Goal in Goal Progress and completes Practice.
    const practiceApi = await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" } },
      { goalReport: { response: "achieved" } },
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    const turnAudioUrls = TURN_AUDIO_PATHS.map((paths) => absoluteAudioUrls(paths, page.url()));
    const completionAudioUrls = absoluteAudioUrls(COMPLETION_AUDIO_PATHS, page.url());

    const replies = ["Hi Emily!", "I'm good, thanks.", "How about you?", "Bye!"];
    for (let turn = 0; turn < replies.length - 1; turn += 1) {
      const playedBefore = (await playedSources(page)).length;
      await submitReply(page, replies[turn]);
      await expectNewPlayback(page, playedBefore, turnAudioUrls[turn]);
      await page.evaluate(() => window.__mockAudio?.endCurrent());
      // Let speakAssertively observe the ended event and disarm its retry
      // before the next turn's typing produces another interaction.
      await page.waitForTimeout(50);
    }

    // Everything Emily has said so far, to diff against after the final Turn.
    const beforeFinalTurn = await emilyLines(page);
    expect(beforeFinalTurn.length).toBeGreaterThan(0);

    const playedBeforeFinalTurn = (await playedSources(page)).length;
    await submitReply(page, replies[replies.length - 1]);

    // Her final line is playing right now (the poll below is what proves it),
    // so this is the moment AC 4 is about: Practice IS complete — all four
    // steps read `completed` — and the Review action is still withheld,
    // because she has not finished speaking.
    await expectNewPlayback(page, playedBeforeFinalTurn, completionAudioUrls);
    for (const goal of ["greeting", "checkin", "response", "closing"]) {
      await expect(page.getByTestId(`practice-step-${goal}`)).toHaveAttribute("data-state", "completed");
    }
    await expect(page.getByTestId("view-summary-button")).toBeDisabled();

    // AC 3: exactly one new Emily message on the completing Turn, and it is a
    // Completion-pool line — not a farewell, not a "Great job! Let's
    // review...", and not two messages.
    const afterFinalTurn = await emilyLines(page);
    expect(afterFinalTurn.slice(0, -1)).toEqual(beforeFinalTurn);
    expect(afterFinalTurn).toHaveLength(beforeFinalTurn.length + 1);
    expect(COMPLETION_TEXTS).toContain(afterFinalTurn[afterFinalTurn.length - 1]);

    // AC 3's other half, read off the stub instead of inferred from the
    // transcript: the client submitted exactly one request per learner Turn —
    // four — and the count below is unchanged after the wait.
    expect(practiceApi.turnRequestCount()).toBe(4);

    await page.evaluate(() => window.__mockAudio?.endCurrent());

    // AC 4: the action appears the moment she stops speaking — still inside the
    // Handoff Gap, which is a microphone rule rather than a navigation one.
    await expect(page.getByTestId("view-summary-button")).toBeEnabled({
      timeout: HANDOFF_GAP_MS - 500,
    });

    // AC 3, second half: with Practice complete the client sends no further AI
    // message. The request count is the direct assertion ("still 4"); the
    // transcript and the (now disabled — Practice is over) reply box are the
    // learner-visible consequence of it, checked over the same wait.
    await expect(page.getByTestId("practice-text-input")).toBeDisabled();
    const completedSnapshot = await emilyLines(page);
    await page.waitForTimeout(2_500);
    expect(practiceApi.turnRequestCount()).toBe(4);
    expect(await emilyLines(page)).toEqual(completedSnapshot);
    await expect(page.getByTestId("practice-text-input")).toBeDisabled();

    await page.getByTestId("view-summary-button").click();
    await expect(page).toHaveURL(/\/review$/);
  });

  test("`closing` achieved while earlier Goals are still open completes nothing", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      // Two Goals in Goal Progress out of four: `closing` landed early, which
      // is allowed (ADR-0012) and is exactly the shape AC 5 is about.
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    const turnAudioUrls = TURN_AUDIO_PATHS.map((paths) => absoluteAudioUrls(paths, page.url()));
    const completionAudioUrls = absoluteAudioUrls(COMPLETION_AUDIO_PATHS, page.url());

    const playedBeforeFirstTurn = (await playedSources(page)).length;
    await submitReply(page, "Hi Emily!");
    await expectNewPlayback(page, playedBeforeFirstTurn, turnAudioUrls[0]);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await page.waitForTimeout(50);

    await submitReply(page, "Bye!");

    // The Turn's Line is the ordinary composition — here the steer toward the
    // open Check-in Goal, the earliest open Goal in canonical order — and never
    // a Completion line. Three Emily messages so far: her opening line and one
    // line per Turn.
    await expect.poll(async () => (await emilyLines(page)).length).toBe(3);
    const lines = await emilyLines(page);
    expect(CHECKIN_TEXTS).toContain(lines[lines.length - 1]);
    expect(COMPLETION_TEXTS).not.toContain(lines[lines.length - 1]);

    // Two Goals in Goal Progress, not four: `closing` completed, the check-in
    // is the Focus Goal, and Practice is not over.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "upcoming");

    // AC 5's gate is completion, not speech: the button stays disabled once
    // she has finished talking, unlike the completing Turn's brief wait.
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await page.waitForTimeout(200);
    await expect(page.getByTestId("view-summary-button")).toBeDisabled();

    // No Completion recording was ever played in this conversation.
    expect((await playedSources(page)).filter((source) => completionAudioUrls.includes(source))).toEqual([]);
  });
});
