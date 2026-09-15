import { expect, test, type Page } from "@playwright/test";
import {
  installScriptedPracticeApi,
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
 *   the Focus Goal is Greeting. Emily reacts ("Glad to hear that!") and then
 *   steers back with a Greeting `needs_retry` line, because `greeting` has no
 *   steer pool of its own. The mirror image — Greeting achieved while Check-in
 *   is already in Goal Progress — steers with a *Response* `needs_retry` line,
 *   with no reaction line in front of it: Check-in was not achieved this Turn,
 *   so there is no check-in to react to. Emily never ends a Turn silent.
 * - **Goodbye before completion.** A learner who says "Hi! Bye!" up front
 *   clears `closing` in the first Turn, so the Turn that finally completes
 *   Practice has `closing` already in Goal Progress rather than achieved by it.
 *   Emily says a Closing line before the Completion line ("See you! Great job!
 *   Let's check your learning summary.") instead of skipping straight to the
 *   summary — the learner hears goodbye.
 *
 * The Judge is stubbed (e2e/fixtures.ts's `installScriptedPracticeApi`, whose
 * `ScriptedTurnResponse` is exactly the report a real Judge would return);
 * everything else — Verdict derivation, Goal Progress, line composition, the
 * store, and the progress steps — runs real code against a real
 * `next build && next start` server.
 */

const RESPONSE_TEXTS = [
  ...GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack,
  ...GREETING_SOMEBODY_LESSON.responseLines.askedBack,
].map((line) => line.en);
const GREETING_RETRY_TEXTS = GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines.map(
  (line) => line.en,
);
const RESPONSE_RETRY_TEXTS = GREETING_SOMEBODY_LESSON.script.response.needsRetryLines.map(
  (line) => line.en,
);
const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const CLOSING_TEXTS = GREETING_SOMEBODY_LESSON.closingLines.map((line) => line.en);
const COMPLETION_TEXTS = [...GREETING_SOMEBODY_LESSON.completionMessages];

/** The persisted transcript's messages, in order — one message per Conversation Script line, so a Turn's sequence is its last N Emily messages. */
async function persistedMessages(
  page: Page,
): Promise<{ role: string; textEn: string }[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("greeting-somebody:practice");
    if (raw === null) throw new Error("no persisted Practice snapshot");
    const snapshot = JSON.parse(raw) as {
      messages?: { role: string; textEn: string }[];
    };
    return (snapshot.messages ?? []).map((message) => ({
      role: message.role,
      textEn: message.textEn,
    }));
  });
}

async function emilyLines(page: Page): Promise<string[]> {
  const messages = await persistedMessages(page);
  return messages.filter((message) => message.role === "emily").map((message) => message.textEn);
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
    // Turn 1 clears two Goals at once and leaves `closing` in Goal Progress for
    // good; Turn 2 answers the check-in (a reaction, which is also the steer
    // toward `response`); Turn 3 thanks her and completes Practice.
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved", closing: "achieved" } },
      { goalReport: { checkin: "achieved" } },
      { goalReport: { response: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi! Bye!");

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    // The goodbye is already said, so nothing steers toward Closing again —
    // the line here is the Check-in pool's own steer.
    expect(CHECKIN_TEXTS).toContain(await page.getByTestId("emily-message-bubble").innerText());

    await submitReply(page, "I'm fine.");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");
    // Practice is not complete yet, so no Farewell line: the summary button
    // stays locked and Emily's single line is the reaction to the check-in.
    await expect(page.getByTestId("view-summary-button")).toBeDisabled();
    expect(RESPONSE_TEXTS).toContain(await page.getByTestId("emily-message-bubble").innerText());

    await submitReply(page, "Thanks");

    // All four Goals are in Goal Progress — completed in three Turns, with a
    // gap where Closing was cleared before the Goals before it.
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("view-summary-button")).toBeEnabled();

    // The Farewell line precedes the Completion line, so the bubble reads
    // "See you! Great job! Let's check your learning summary." — and the
    // transcript keeps them as two messages, in that order.
    const closingText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CLOSING_TEXTS.some((line) => closingText.startsWith(line))).toBe(true);
    expect(COMPLETION_TEXTS.some((line) => closingText.endsWith(line))).toBe(true);

    const [farewellLine, completionLine] = (await emilyLines(page)).slice(-2);
    expect(CLOSING_TEXTS).toContain(farewellLine);
    expect(COMPLETION_TEXTS).toContain(completionLine);
  });
});
