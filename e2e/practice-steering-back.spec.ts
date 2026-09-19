import { expect, test, type Page } from "@playwright/test";
import {
  absoluteAudioUrls,
  audioPathsFor,
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

/**
 * Issue #50's two scenarios, end to end (ADR-0012; docs/ai-configuration.md
 * section 3's "Line composition" steps 2 and 3).
 *
 * Both exist only because an earlier Conversation Goal may be left open:
 *
 * - **Steering back.** A learner whose *first* line answers the check-in
 *   ("I'm fine, thanks!") clears `checkin` while `greeting` is still open, so
 *   the Focus Goal is Greeting. Emily reacts (e.g. "Glad to hear that!") and
 *   then steers back with a Greeting `needs_retry` line, because `greeting` has
 *   no steer pool of its own. The mirror image — Greeting achieved while
 *   Check-in is already in Goal Progress — steers with a *Response*
 *   `needs_retry` line, with no reaction line in front of it: Check-in was not
 *   achieved this Turn, so there is no check-in to react to. Emily never ends a
 *   Turn silent. (Every line quoted in this file is one possible draw from a
 *   randomly-picked pool, never a deterministic one; the assertions below check
 *   pool membership.)
 * - **Goodbye before completion.** A learner who says "Hi! Bye!" up front
 *   clears `closing` in the first Turn, so the Turn that finally completes
 *   Practice has `closing` already in Goal Progress rather than achieved by it.
 *   Emily says a Closing line before the Completion line (e.g. "See you!
 *   Thanks! Take care.") instead of skipping straight to the summary — the
 *   learner hears goodbye. That Turn is the ask-back one (ADR-0013: `response`
 *   is asking Emily back, never thanking her), so it opens with her answer to
 *   the question put to her and then says goodbye. Since issue #55 both of
 *   those closing lines are farewells (v2 ticket 5's table), so this rare Turn
 *   has Emily saying goodbye twice — the selector's job is only to not repeat
 *   the exact same text.
 *
 * The Judge is stubbed (e2e/fixtures.ts's `installScriptedPracticeApi`, whose
 * `ScriptedTurnResponse` is exactly the report a real Judge would return);
 * everything else — Verdict derivation, Goal Progress, line composition, the
 * store, Turn-Taking, and the progress steps — runs real code against a real
 * `next build && next start` server. This file's second test installs
 * `mockSpeechApis` and drives every line of its completing Turn to an end:
 * Review's gate is Turn-Taking (issue #55), so leaving three real mp3s to play
 * out would make that one assertion a wall-clock assumption about audio
 * durations rather than a statement about the gate.
 */

const RESPONSE_TEXTS = [
  ...GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack,
  ...GREETING_SOMEBODY_LESSON.responseLines.askedBack,
].map((line) => line.en);
const RESPONSE_ASKED_BACK_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.askedBack.map(
  (line) => line.en,
);
const GREETING_RETRY_TEXTS = GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines.map(
  (line) => line.en,
);
const RESPONSE_RETRY_TEXTS = GREETING_SOMEBODY_LESSON.script.response.needsRetryLines.map(
  (line) => line.en,
);
const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const CLOSING_TEXTS = GREETING_SOMEBODY_LESSON.closingLines.map((line) => line.en);
const COMPLETION_TEXTS = [...GREETING_SOMEBODY_LESSON.completionMessages];

/**
 * The completing Turn's three lines, in order, as manifest paths: Emily's
 * answer to the question put to her (the asked-back Response pool), then the
 * Farewell line (the Closing pool), then the Completion pool's one line.
 */
const COMPLETING_TURN_AUDIO_PATHS = [
  audioPathsFor(GREETING_SOMEBODY_LESSON.responseLines.askedBack),
  audioPathsFor(GREETING_SOMEBODY_LESSON.closingLines),
  audioPathsForTexts(COMPLETION_TEXTS),
];

/**
 * The two Turns before it (`"Hi! Bye!"` → the Check-in steer; `"I'm fine."` →
 * the acknowledgement that reacts to it), each a single line from one pool.
 * Waiting for these lets the test read a clean playback count before the next
 * Turn: the playback starts a render *after* the Send click, so reading the
 * count immediately after submitting would pick up the previous Turn's line as
 * the next Turn's first play.
 */
const EARLIER_TURN_AUDIO_PATHS = [
  audioPathsForTexts(CHECKIN_TEXTS),
  audioPathsForTexts(
    GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.map((line) => line.en),
  ),
];

/**
 * Emily's spoken lines, in order — one message per Conversation Script line
 * (e2e/fixtures.ts's `persistedMessages`), so a Turn's sequence is its last N.
 */
async function emilyLines(page: Page): Promise<string[]> {
  const messages = await persistedMessages(page);
  return messages.filter((message) => message.role === "emily").map((message) => message.textEn);
}

/** Waits until one of `urls` starts playing, ignoring plays from before `playedBefore`. */
async function expectNewPlayback(page: Page, playedBefore: number, urls: string[]): Promise<void> {
  await expect
    .poll(async () => (await playedSources(page)).slice(playedBefore).some((source) => urls.includes(source)))
    .toBe(true);
}

/**
 * Lets the line that just started finish, then settles: with the audio stub
 * nothing ever ends on its own, and a sequence left "playing" keeps
 * `speakLinesAssertively`'s retry armed — so the *next* Send click would
 * re-speak the previous Turn's line as a stray play, which is exactly what the
 * playback counts below are used to slice. Ending it disarms the retry (the
 * sequence resolves `true`), leaving the next Turn's boundary clean.
 */
async function finishCurrentLine(page: Page): Promise<void> {
  await page.evaluate(() => window.__mockAudio?.endCurrent());
  await page.waitForTimeout(50);
}

/**
 * The sources for the `count` plays that started after `playedBefore`, once
 * they exist. The slice matters: the Completion pool shares its "See you!"
 * recording with the Closing pool (issue #55), so a poll that looked at the
 * whole list could match the *previous* line's playback and let the test end
 * the wrong one.
 */
async function nextPlayedSources(page: Page, playedBefore: number, count: number): Promise<string[]> {
  await expect
    .poll(async () => (await playedSources(page)).slice(playedBefore).length)
    .toBeGreaterThanOrEqual(count);
  return (await playedSources(page)).slice(playedBefore, playedBefore + count);
}

test.describe("Practice page — Emily steers back to an open earlier Goal", () => {
  test('an "I\'m fine, thanks!" opening reacts, then steers back to Greeting', async ({ page }) => {
    await resetStorage(page);
    // Turn 1 answers the check-in without ever greeting: `checkin` joins Goal
    // Progress, `greeting` stays open, so the Focus Goal is Greeting — first in
    // canonical order, even though it is the one Goal the learner hasn't
    // touched. Turn 2 then greets, leaving `response` as the Focus Goal.
    await installScriptedPracticeApi(page, [
      { goalReport: { checkin: "achieved" } },
      { goalReport: { greeting: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");

    await submitReply(page, "I'm fine, thanks!");

    // The Goal the learner cleared is completed, and the Goal she skipped is
    // still current — the Focus Goal the next line has to steer toward.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "upcoming");

    // Two lines, in order: the reaction to the check-in, then the steer back to
    // Greeting — borrowed from greeting's own `needs_retry` pool, which is the
    // only pool written for that Goal.
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_TEXTS.some((line) => replyText.startsWith(line))).toBe(true);
    expect(GREETING_RETRY_TEXTS.some((line) => replyText.endsWith(line))).toBe(true);
    // Never the Check-in pool: the learner just said how they were doing.
    expect(CHECKIN_TEXTS.some((line) => replyText.includes(line))).toBe(false);

    // One message per line in the transcript, the two of this Turn last.
    const [reactionLine, steerLine] = (await emilyLines(page)).slice(-2);
    expect(RESPONSE_TEXTS).toContain(reactionLine);
    expect(GREETING_RETRY_TEXTS).toContain(steerLine);

    // Now the mirror image: greeting lands while `checkin` is already in Goal
    // Progress, so `response` becomes the Focus Goal. Nothing reacts (Check-in
    // was not achieved this Turn), so the steer is the one line — Response's
    // own `needs_retry` pool, not the Response pool, which would be answering a
    // check-in that did not happen.
    await submitReply(page, "Hi!");

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");

    const steerOnlyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_RETRY_TEXTS).toContain(steerOnlyText);
    expect(RESPONSE_TEXTS).not.toContain(steerOnlyText);
    expect((await emilyLines(page)).at(-1)).toBe(steerOnlyText);
  });
});

test.describe("Practice page — Emily says goodbye when Closing was achieved in an earlier Turn", () => {
  test('the "Hi! Bye!" opening still hears a Closing line before the Completion line', async ({
    page,
  }) => {
    await resetStorage(page);
    // Issue #55's Review gate is Turn-Taking, so this test's completing Turn is
    // driven through the controllable audio stub rather than left to three real
    // mp3s — see this file's header comment.
    await mockSpeechApis(page);
    // Turn 1 clears two Goals at once and leaves `closing` in Goal Progress for
    // good; Turn 2 answers the check-in (a reaction, which is also the steer
    // toward `response`); Turn 3 asks Emily how she is — the ask-back ADR-0013
    // makes the `response` Goal (a thank-you no longer is one) — and completes
    // Practice.
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved", closing: "achieved" } },
      { goalReport: { checkin: "achieved" } },
      { goalReport: { response: "achieved" }, learner_asked_back: true },
    ]);
    await page.goto(PRACTICE_URL);

    const earlierTurnAudioUrls = EARLIER_TURN_AUDIO_PATHS.map((paths) =>
      absoluteAudioUrls(paths, page.url()),
    );
    const completingTurnAudioUrls = COMPLETING_TURN_AUDIO_PATHS.map((paths) =>
      absoluteAudioUrls(paths, page.url()),
    );

    const playedBeforeFirstTurn = (await playedSources(page)).length;
    await submitReply(page, "Hi! Bye!");
    await expectNewPlayback(page, playedBeforeFirstTurn, earlierTurnAudioUrls[0]);
    await finishCurrentLine(page);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    // The goodbye is already said, so nothing steers toward Closing again —
    // the line here is the Check-in pool's own steer.
    expect(CHECKIN_TEXTS).toContain(await page.getByTestId("emily-message-bubble").innerText());

    const playedBeforeSecondTurn = (await playedSources(page)).length;
    await submitReply(page, "I'm fine.");
    await expectNewPlayback(page, playedBeforeSecondTurn, earlierTurnAudioUrls[1]);
    await finishCurrentLine(page);
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");
    // Practice is not complete yet, so no Farewell line: the summary button
    // stays locked and Emily's single line is the reaction to the check-in.
    await expect(page.getByTestId("view-summary-button")).toBeDisabled();
    expect(RESPONSE_TEXTS).toContain(await page.getByTestId("emily-message-bubble").innerText());

    const playedBeforeFinalTurn = (await playedSources(page)).length;
    await submitReply(page, "How about you?");

    // All four Goals are in Goal Progress — completed in three Turns, with a
    // gap where Closing was cleared before the Goals before it.
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");

    // This Turn speaks three lines, so the Turn-Taking gate that holds Review
    // back (issue #55) is satisfied only once all three have been delivered.
    // Each is waited for from the previous one's end (never by URL alone: the
    // Completion pool shares its "See you!" recording with the Closing pool),
    // asserted to have come from the pool it should have, and then ended.
    const [answerUrls, farewellUrls, completionUrls] = completingTurnAudioUrls;
    const firstLine = await nextPlayedSources(page, playedBeforeFinalTurn, 1);
    expect(answerUrls).toContain(firstLine[0]);
    // Practice is complete *now* — the four steps above say so — and the action
    // is still withheld because she has not finished speaking (AC 4).
    await expect(page.getByTestId("view-summary-button")).toBeDisabled();
    await page.evaluate(() => window.__mockAudio?.endCurrent());

    for (const [index, poolUrls] of [farewellUrls, completionUrls].entries()) {
      const line = await nextPlayedSources(page, playedBeforeFinalTurn + index + 1, 1);
      expect(poolUrls).toContain(line[0]);
      await page.evaluate(() => window.__mockAudio?.endCurrent());
    }

    // She has finished speaking: nothing else gates Review, so this needs no
    // custom timeout any more — the gate is the three `endCurrent()` calls
    // above, not the clock.
    await expect(page.getByTestId("view-summary-button")).toBeEnabled();

    // Three lines this Turn, in order: Emily's answer to the question the
    // learner put to her (ADR-0013 — the reaction is due because they asked,
    // not because `checkin` landed here), then the Farewell line, then the
    // Completion line. The transcript keeps them as three messages.
    const [answerLine, farewellLine, completionLine] = (await emilyLines(page)).slice(-3);
    expect(RESPONSE_ASKED_BACK_TEXTS).toContain(answerLine);
    expect(CLOSING_TEXTS).toContain(farewellLine);
    expect(COMPLETION_TEXTS).toContain(completionLine);

    // The bubble opens with her answer and closes with the Completion line —
    // e.g. "I'm good too, thanks! Take care! Thanks! See you!" — with the
    // goodbye in its middle, never skipped. Which exact lines depends on the
    // random draws, so the three assertions below are membership, not equality.
    const closingText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_ASKED_BACK_TEXTS.some((line) => closingText.startsWith(line))).toBe(true);
    expect(CLOSING_TEXTS.some((line) => closingText.includes(line))).toBe(true);
    expect(COMPLETION_TEXTS.some((line) => closingText.endsWith(line))).toBe(true);
  });
});
