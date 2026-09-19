import { expect, test, type Page } from "@playwright/test";
import {
  emilyLines,
  installScriptedPracticeApi,
  mockSpeechApis,
  persistedPracticeSnapshot,
  playedSources,
  PRACTICE_URL,
  recoveryOffTopicNudgeLine,
  recoveryQuestionLine,
  resetStorage,
  startSpeaking,
  steerLineTexts,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON, RECOVERY_UNCLEAR_NUDGE } from "@/content/lesson";

/**
 * Issue #56's headline behaviour, end to end (v2 tickets 8, 9 and 10;
 * ADR-0014; docs/ai-configuration.md section 3's "Recovery" and "Silence
 * reminder", section 1's Global Constraints).
 *
 * A `needs_retry` Turn speaks a **two-tier Recovery**, never the flat pool it
 * used to:
 *
 * - **Tier 1** — the learner's first `needs_retry` on the current Focus Goal —
 *   is a *sequence* of two existing lines: a nudge, then the Goal's question
 *   (ADR-0014 decision 2: a nudge and a question are two lines each spoken in
 *   full, never one composed sentence). Which nudge is the Goal Report's
 *   difference: at least one open Goal `failed` means a recognisable attempt
 *   that did not come through, so the shared "Sorry, I didn't quite get that."
 *   opens it; every open Goal `untouched` (what off-topic input looks like)
 *   means the Goal's own off-topic nudge does — or, for `response` and
 *   `closing`, no nudge at all, because v2 ticket 10's table gives those two
 *   Goals no prefix of their own and the question is their whole variant.
 * - **Tier 2** — the learner's *second consecutive* `needs_retry` on the same
 *   Focus Goal — is one line and nothing else: the Goal's direct example, the
 *   one Recovery line allowed to name an Accepted Response (ADR-0014
 *   decision 1).
 *
 * Which Goal's Recovery is spoken is issue #49's rule, unchanged: the first
 * Goal in canonical order the Goal Report marked `failed`, else the Focus Goal
 * (practice-mixed-failure.spec.ts owns that rule's headline case; this file's
 * second test pins the `unclear` variant against the Focus Goal's own Goal).
 *
 * The tier is the learner's **Retry Streak** (src/lib/practice-state.ts's
 * persisted `retryStreak`): `0` for tier 1, anything above for tier 2. It is
 * bumped by a `needs_retry` Turn, cleared by *any* `accepted` Turn — including
 * one that leaves the Focus Goal open, which is the whole point of the third
 * test below — keyed by Goal, and never touched by a `support_requested` Turn
 * or by silence. It is deliberately not the per-Goal `retryCounts`, which
 * never resets and is what makes a later accepted Goal not-first-try.
 *
 * A Recovery Turn itself saves nothing: Goal Progress does not move, the Focus
 * Goal does not move, no Turn record appears, and the learner returns to the
 * normal flow on the next `accepted` Turn. The **silence reminder** (v2 ticket
 * 9) is the same sequence one step down — the silence-nudge pool's line, then
 * the Focus Goal's question — appended as a support message rather than
 * recorded as a Turn, and the last three tests below pin its rules: it never
 * moves Goal Progress, it never calls the turn endpoint, its nudge never
 * repeats the previous one, it does not fire while the microphone is open, and
 * it does not run while Emily is speaking or during the Handoff Gap after her
 * line — the floor being hers is what "the learner's silence" means.
 *
 * Same seam as the rest of the Practice suite: the Judge is a scripted Goal
 * Report via e2e/fixtures.ts's `installScriptedPracticeApi`, while Verdict
 * derivation, Goal Progress, the Retry Streak, Recovery selection, the store,
 * Turn-Taking and the silence timer all run real code against a real
 * `next build && next start` server. Every expected line is derived from
 * `GREETING_SOMEBODY_LESSON` (through the fixtures' `recoveryQuestionLine` /
 * `recoveryOffTopicNudgeLine` readers), never copied by hand.
 */

const OPENING_TEXTS = GREETING_SOMEBODY_LESSON.openingLines.map((line) => line.en);
const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const RESPONSE_DID_NOT_ASK_BACK_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.map(
  (line) => line.en,
);
const RESPONSE_ASKED_BACK_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.askedBack.map(
  (line) => line.en,
);
const CLOSING_TEXTS = GREETING_SOMEBODY_LESSON.closingLines.map((line) => line.en);
const SILENCE_NUDGE_TEXTS = GREETING_SOMEBODY_LESSON.silenceNudgeLines.map((line) => line.en);

const CHECKIN_RECOVERY = GREETING_SOMEBODY_LESSON.script.checkin.recovery;
const GREETING_RECOVERY = GREETING_SOMEBODY_LESSON.script.greeting.recovery;
const RESPONSE_RECOVERY = GREETING_SOMEBODY_LESSON.script.response.recovery;

/** The Check-in Goal's off-topic nudge — v2 ticket 10's "First Redirect" prefix for that Goal. */
const CHECKIN_OFF_TOPIC_NUDGE = recoveryOffTopicNudgeLine("checkin").en;
/** The Greeting Goal's off-topic nudge — a *different* sentence, which is the only thing the two first-tier variants differ in. */
const GREETING_OFF_TOPIC_NUDGE = recoveryOffTopicNudgeLine("greeting").en;
const GREETING_RECOVERY_QUESTION = recoveryQuestionLine("greeting").en;
const RESPONSE_RECOVERY_QUESTION = recoveryQuestionLine("response").en;

/** The persisted Turn records, projected to the two fields these tests pin. */
async function turnRecordSummary(
  page: Page,
): Promise<{ state: string; passedFirstTry: boolean }[]> {
  return ((await persistedPracticeSnapshot(page)).turnRecords ?? []).map((record) => ({
    state: record.state,
    passedFirstTry: record.passedFirstTry,
  }));
}

/** The persisted Retry Streak (issue #56), exactly as the store holds it. */
async function persistedRetryStreak(
  page: Page,
): Promise<{ goal: string; count: number } | null> {
  return (await persistedPracticeSnapshot(page)).retryStreak ?? null;
}

test.describe("Practice page — the two-tier Recovery (issue #56)", () => {
  test("off-topic at Check-in twice, then the answer: first tier, direct example, accepted", async ({
    page,
  }) => {
    // The acceptance scenario: a learner who says nothing to the point twice
    // and then answers. Turn 1 clears Greeting, so Check-in is the Focus Goal
    // of the two off-topic Turns and of the clean one that follows.
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: {} },
      { goalReport: {} },
      { goalReport: { checkin: "achieved" }, learner_asked_back: false },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const emilyBeforeRetries = await emilyLines(page);

    // --- The first needs_retry Turn on Check-in: tier 1, off-topic variant.
    await submitReply(page, "I really like pizza.");
    await expect
      .poll(async () => (await emilyLines(page)).length)
      .toBe(emilyBeforeRetries.length + 2);

    // A report that attempted nothing earns the Goal's off-topic nudge and
    // then its question — the Check-in pool's own question, which is where that
    // wording lives (ADR-0014 decision 2).
    const firstRetryLines = (await emilyLines(page)).slice(-2);
    expect(firstRetryLines[0]).toBe(CHECKIN_OFF_TOPIC_NUDGE);
    expect(CHECKIN_TEXTS).toContain(firstRetryLines[1]);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(firstRetryLines.join(" "));
    // Never the shared `unclear` nudge: nothing was attempted, so nothing
    // failed to come through. Never the direct example either — that is tier 2.
    expect(firstRetryLines[0]).not.toBe(RECOVERY_UNCLEAR_NUDGE.en);
    expect(firstRetryLines).not.toContain(CHECKIN_RECOVERY.directExample.en);

    // Nothing moved: every step keeps the state it had, no Turn record was
    // added, and only the retry bookkeeping and the streak changed.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "upcoming");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "upcoming");
    expect((await persistedPracticeSnapshot(page)).goalProgress).toEqual(["greeting"]);
    expect(await turnRecordSummary(page)).toEqual([{ state: "greeting", passedFirstTry: true }]);
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({ checkin: 1 });
    expect(await persistedRetryStreak(page)).toEqual({ goal: "checkin", count: 1 });

    // --- The second consecutive needs_retry on Check-in: tier 2, one line.
    await submitReply(page, "Pizza again, please.");
    await expect
      .poll(async () => (await emilyLines(page)).length)
      .toBe(emilyBeforeRetries.length + 3);

    // Just the direct example: no question follows it, so the Turn is one line
    // where the first tier's was two.
    expect((await emilyLines(page)).slice(-1)).toEqual([CHECKIN_RECOVERY.directExample.en]);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(
      CHECKIN_RECOVERY.directExample.en,
    );
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    expect((await persistedPracticeSnapshot(page)).goalProgress).toEqual(["greeting"]);
    expect(await turnRecordSummary(page)).toEqual([{ state: "greeting", passedFirstTry: true }]);
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({ checkin: 2 });
    expect(await persistedRetryStreak(page)).toEqual({ goal: "checkin", count: 2 });

    // --- The answer: accepted, so Check-in completes and the flow resumes.
    await submitReply(page, "I'm good.");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");

    // Emily's reply is the ordinary acknowledgement — the check-in reaction,
    // one line, because `response`'s steer is that reaction — and never a
    // Recovery line.
    const acceptedLines = (await emilyLines(page)).slice(-1);
    expect(RESPONSE_DID_NOT_ASK_BACK_TEXTS).toContain(acceptedLines[0]);
    expect(acceptedLines[0]).not.toBe(CHECKIN_RECOVERY.directExample.en);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(acceptedLines[0]);

    // The streak is cleared by the accepted Turn; `retryCounts` keeps both
    // retries, which is what makes Check-in's record not-first-try.
    expect(await persistedRetryStreak(page)).toBeNull();
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({ checkin: 2 });
    expect(await turnRecordSummary(page)).toEqual([
      { state: "greeting", passedFirstTry: true },
      { state: "checkin", passedFirstTry: false },
    ]);
  });

  test("the unclear variant speaks the shared nudge and the Goal's question, and tier 2 takes over on the second try", async ({
    page,
  }) => {
    // A `failed` Goal is the other first-tier variant: a recognisable attempt
    // that did not come through, so the *shared* nudge opens it and the Goal's
    // question follows (v2 ticket 8's "First Try"). The failed Goal here is
    // Greeting, which is also the Focus Goal, so both halves name it.
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "failed" } },
      { goalReport: { greeting: "failed" } },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "helloooo?");
    await expect.poll(async () => (await emilyLines(page)).length).toBe(3);

    const firstRetryLines = (await emilyLines(page)).slice(-2);
    expect(firstRetryLines).toEqual([RECOVERY_UNCLEAR_NUDGE.en, GREETING_RECOVERY_QUESTION]);
    // The Goal's own `unclearNudge` is that same shared sentence — it is spelled
    // per Goal rather than shared in the type, so pin the two together.
    expect(GREETING_RECOVERY.unclearNudge.en).toBe(RECOVERY_UNCLEAR_NUDGE.en);
    // The variant is the difference: an off-topic Turn would have opened with
    // the Goal's own nudge instead.
    expect(firstRetryLines[0]).not.toBe(GREETING_OFF_TOPIC_NUDGE);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(firstRetryLines.join(" "));
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    expect((await persistedPracticeSnapshot(page)).goalProgress).toEqual([]);
    expect(await persistedRetryStreak(page)).toEqual({ goal: "greeting", count: 1 });

    // Second consecutive retry: tier 2 replaces both lines with the example —
    // the variant no longer matters, which is why one line per Goal serves
    // both of v2 tickets 8 and 10.
    await submitReply(page, "helloooo again?");
    await expect.poll(async () => (await emilyLines(page)).length).toBe(4);

    expect((await emilyLines(page)).slice(-1)).toEqual([GREETING_RECOVERY.directExample.en]);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(
      GREETING_RECOVERY.directExample.en,
    );
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    expect(await persistedRetryStreak(page)).toEqual({ goal: "greeting", count: 2 });
  });

  test("an accepted Turn that leaves the Focus Goal open resets the Retry Streak, so the next retry is tier 1 again", async ({
    page,
  }) => {
    // Acceptance criterion 2, and the reason the streak is not `retryCounts`:
    // Greeting is retried, then *achieved elsewhere* — a Turn that leaves
    // Greeting open — so the learner made progress and the next stuck attempt
    // on Greeting must hear tier 1 again, even though `retryCounts.greeting`
    // is already 1 and never resets.
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "failed" } },
      { goalReport: { checkin: "achieved" } },
      { goalReport: {} },
      { goalReport: {} },
    ]);
    await page.goto(PRACTICE_URL);

    // Turn 1 — a failed greeting: Greeting's first retry.
    await submitReply(page, "helloooo?");
    await expect.poll(async () => (await emilyLines(page)).length).toBe(3);
    expect((await emilyLines(page)).slice(-2)).toEqual([
      RECOVERY_UNCLEAR_NUDGE.en,
      GREETING_RECOVERY_QUESTION,
    ]);
    expect(await persistedRetryStreak(page)).toEqual({ goal: "greeting", count: 1 });
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({ greeting: 1 });

    // Turn 2 — the learner answers the check-in instead, which is `accepted`
    // progress while Greeting stays the Focus Goal (first open Goal in
    // canonical order). Emily reacts and then steers back to Greeting, in the
    // ordinary composition — never a Recovery, because this Turn was accepted.
    await submitReply(page, "I'm good, thanks!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    expect(await persistedRetryStreak(page)).toBeNull();
    // The check-in reply is a reaction plus Greeting's borrowed steer, and
    // nothing in it is a Recovery line.
    const acceptedLines = (await emilyLines(page)).slice(-2);
    expect(RESPONSE_DID_NOT_ASK_BACK_TEXTS).toContain(acceptedLines[0]);
    expect(steerLineTexts("greeting")).toContain(acceptedLines[1]);

    // Turn 3 — the learner's *first* retry since that progress: tier 1, even
    // though `retryCounts.greeting` is already 1. The nudge is the off-topic
    // variant's, so the tier is readable from the line itself — had the streak
    // survived the accepted Turn, tier 2 would have replaced both lines with
    // the direct example. The count below is the transcript's own: the opening
    // line, then two lines per `needs_retry` Turn and two for the accepted one.
    await submitReply(page, "I like pizza.");
    await expect.poll(async () => (await emilyLines(page)).length).toBe(7);
    const afterResetLines = (await emilyLines(page)).slice(-2);
    expect(afterResetLines).toEqual([GREETING_OFF_TOPIC_NUDGE, GREETING_RECOVERY_QUESTION]);
    expect(afterResetLines).not.toContain(GREETING_RECOVERY.directExample.en);
    const afterResetSnapshot = await persistedPracticeSnapshot(page);
    expect(afterResetSnapshot.retryCounts).toEqual({ greeting: 2 });
    expect(await persistedRetryStreak(page)).toEqual({ goal: "greeting", count: 1 });
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");

    // Turn 4 — a second consecutive retry, and only now tier 2.
    await submitReply(page, "More pizza.");
    await expect.poll(async () => (await emilyLines(page)).length).toBe(8);
    expect((await emilyLines(page)).slice(-1)).toEqual([GREETING_RECOVERY.directExample.en]);
    expect(await persistedRetryStreak(page)).toEqual({ goal: "greeting", count: 2 });
    // Three `needs_retry` Turns on Greeting in total, and the learner heard
    // tier 1 twice: what accumulated is the cumulative count, while the streak
    // the tier reads restarted at the accepted Turn. That gap between the two
    // counters is the whole reason the streak exists (ADR-0014 decision 4).
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({ greeting: 3 });
  });

  test("a Recovery Turn at Response is the question alone and moves nothing, and the next accepted Turn resumes the flow", async ({
    page,
  }) => {
    // `response` and `closing` have no off-topic nudge of their own (v2 ticket
    // 10's table authors none for them), so their first-tier off-topic variant
    // is the question alone — one line where Check-in's is two. The Turn still
    // saves nothing and leaves the Focus Goal exactly where it was, and the
    // very next accepted Turn composes the ordinary way.
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: false },
      { goalReport: {} },
      { goalReport: { response: "achieved" }, learner_asked_back: true },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi!");
    await submitReply(page, "I'm good.");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");
    const emilyBeforeRetry = await emilyLines(page);

    await submitReply(page, "I like pizza.");
    await expect
      .poll(async () => (await emilyLines(page)).length)
      .toBe(emilyBeforeRetry.length + 1);

    // The question is the whole variant: no nudge precedes it, and the Turn is
    // therefore one line.
    expect((await emilyLines(page)).slice(-1)).toEqual([RESPONSE_RECOVERY_QUESTION]);
    expect(RESPONSE_RECOVERY.offTopicNudge).toBeNull();
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(RESPONSE_RECOVERY_QUESTION);

    // Nothing moved — not Goal Progress, not the Focus Goal, not the records.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "upcoming");
    expect((await persistedPracticeSnapshot(page)).goalProgress).toEqual(["greeting", "checkin"]);
    expect(await turnRecordSummary(page)).toEqual([
      { state: "greeting", passedFirstTry: true },
      { state: "checkin", passedFirstTry: true },
    ]);
    expect(await persistedRetryStreak(page)).toEqual({ goal: "response", count: 1 });

    // The next accepted Turn resumes the normal flow: `response` completes (the
    // learner asked Emily back, which is what that Goal means) and Emily
    // composes ordinarily — her answer, then the Closing steer.
    await submitReply(page, "How about you?");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "current");
    const resumedLines = (await emilyLines(page)).slice(-2);
    expect(RESPONSE_ASKED_BACK_TEXTS).toContain(resumedLines[0]);
    expect(CLOSING_TEXTS).toContain(resumedLines[1]);
    expect(await persistedRetryStreak(page)).toBeNull();
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({ response: 1 });
    expect(await turnRecordSummary(page)).toEqual([
      { state: "greeting", passedFirstTry: true },
      { state: "checkin", passedFirstTry: true },
      { state: "response", passedFirstTry: false },
    ]);
  });

  test("the silence reminder asks for the Focus Goal without moving anything, and a later window never repeats the nudge", async ({
    page,
  }) => {
    // v2 ticket 9 (ADR-0014 decision 3): after 18s of the learner's own silence
    // Emily speaks the silence-nudge pool's line followed by the Focus Goal's
    // question — the same sequence the Recovery's first tier uses, so the
    // reminder never reveals an Accepted Response — and appends it as a support
    // message rather than recording a Turn.
    await resetStorage(page);
    await mockSpeechApis(page);
    await page.clock.install();
    // The stub's own request count is the direct "the reminder never called the
    // model" assertion (see `ScriptedPracticeApiHandle`).
    const practiceApi = await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-bubble")).toHaveText(OPENING_TEXTS[0]);
    // The fixture's audio never ends on its own and the fake clock owns the
    // Handoff Gap, so drive both to a settled floor before measuring silence.
    await finishSpeaking(page);
    await page.clock.fastForward(19_000);

    // One Turn of two lines, at Greeting — the Focus Goal — with the nudge from
    // the pool and the question from the Goal's own first tier.
    await expect.poll(async () => (await emilyLines(page)).length).toBe(3);
    const firstReminderLines = (await emilyLines(page)).slice(-2);
    expect(SILENCE_NUDGE_TEXTS).toContain(firstReminderLines[0]);
    expect(firstReminderLines[1]).toBe(GREETING_RECOVERY_QUESTION);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(firstReminderLines.join(" "));

    // Both lines are one Turn, not two: they were appended together.
    const firstReminderMessages = ((await persistedPracticeSnapshot(page)).messages ?? []).slice(-2);
    expect(firstReminderMessages[0].sequenceId).toBeTruthy();
    expect(firstReminderMessages[0].sequenceId).toBe(firstReminderMessages[1].sequenceId);

    // Nothing moved, and nothing was asked of the model.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    const quietSnapshot = await persistedPracticeSnapshot(page);
    expect(quietSnapshot.goalProgress).toEqual([]);
    expect(quietSnapshot.turnRecords).toEqual([]);
    expect(quietSnapshot.retryCounts).toEqual({});
    expect(quietSnapshot.retryStreak ?? null).toBeNull();
    expect(practiceApi.turnRequestCount()).toBe(0);

    // A second window after real progress: the learner greets, Check-in becomes
    // the Focus Goal, and both the reminder's question and its nudge follow the
    // conversation (v2 ticket 9's own example is the Check-in case).
    await submitReply(page, "Hi!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect.poll(async () => (await emilyLines(page)).length).toBe(4);
    await finishSpeaking(page);
    await page.clock.fastForward(19_000);

    await expect.poll(async () => (await emilyLines(page)).length).toBe(6);
    const secondReminderLines = (await emilyLines(page)).slice(-2);
    expect(SILENCE_NUDGE_TEXTS).toContain(secondReminderLines[0]);
    // The no-repeat rule: the pool is 3 lines and the pick excludes the line
    // spoken last, so the second nudge is never the first one again.
    expect(secondReminderLines[0]).not.toBe(firstReminderLines[0]);
    // The Check-in question is its steer pool's, which is where that wording
    // lives — the reminder asks for the new Focus Goal, not the old one.
    expect(CHECKIN_TEXTS).toContain(secondReminderLines[1]);

    // Still no Turn: two reminders, one submitted and judged Turn, and the
    // streak untouched by either reminder.
    expect(practiceApi.turnRequestCount()).toBe(1);
    expect(await persistedRetryStreak(page)).toBeNull();
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({});
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
  });

  test("no silence reminder fires while the microphone is open", async ({ page }) => {
    // The window is "15–20s of the learner's own silence", and an open
    // microphone means the floor is theirs — a reminder spoken into it would be
    // Emily talking over an already-open turn (ADR-0014 decision 6; CONTEXT.md,
    // "Turn-Taking"). This test holds the mic open across far more than the
    // window and asserts she says nothing, then closes the mic and watches the
    // same window fire — so a page that simply never armed its timer at all
    // cannot pass it.
    await resetStorage(page);
    await mockSpeechApis(page);
    await page.clock.install();
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-bubble")).toHaveText(OPENING_TEXTS[0]);

    await startSpeaking(page);
    await expect(page.getByTestId("practice-mic-status")).toHaveText("正在聆听... Listening...");
    const emilyBeforeSilence = await emilyLines(page);

    // Settle the Handoff Gap the opening line's playback may have left pending,
    // then let several windows pass with the microphone still open.
    await page.clock.fastForward(5_000);
    await page.clock.fastForward(60_000);
    await expect(page.getByTestId("practice-mic-status")).toHaveText("正在聆听... Listening...");
    expect(await emilyLines(page)).toEqual(emilyBeforeSilence);
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    expect(await persistedRetryStreak(page)).toBeNull();

    // The mic closes, and the very same window now fires — the reminder was
    // suppressed by the open microphone, not by a timer that never existed.
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(page.getByTestId("practice-mic-button")).toHaveAttribute("data-state", "idle");
    await page.clock.fastForward(19_000);

    await expect.poll(async () => (await emilyLines(page)).length).toBe(emilyBeforeSilence.length + 2);
    const reminderLines = (await emilyLines(page)).slice(-2);
    expect(SILENCE_NUDGE_TEXTS).toContain(reminderLines[0]);
    expect(reminderLines[1]).toBe(GREETING_RECOVERY_QUESTION);
  });

  test("the silence window does not run while Emily is speaking or during the Handoff Gap", async ({
    page,
  }) => {
    // Acceptance criterion 5's other half (v2 ticket 9; ADR-0014 decision 6):
    // the window is the *learner's* silence, so it opens only once the floor is
    // genuinely theirs — not while Emily is mid-line, and not during the 3s
    // Handoff Gap that follows her line. Both of this file's other silence tests
    // end her audio (and settle the gap) before they fast-forward, so they would
    // pass with the `turnTakingState !== "idle"` gate deleted; this test is the
    // one that pins it, by leaving her line playing and then accounting for the
    // gap explicitly.
    await resetStorage(page);
    await mockSpeechApis(page);
    await page.clock.install();
    const practiceApi = await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    // Turn 1 over voice. The mic tap is both the gesture that unlocks the
    // reusable audio element and the one surface `speakLinesAssertively` is
    // told to ignore (e2e/fixtures.ts's stub models iOS's per-element rule), so
    // Emily's reply below really plays — and stays playing.
    await startSpeaking(page);
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("Hi!", { isFinal: true }),
    );
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect.poll(async () => (await playedSources(page)).length).toBe(2);

    // She is speaking right now, and this test never ends that line until it
    // says so: the mic status is the app's own report of the floor being hers.
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");
    const herLine = (await emilyLines(page)).at(-1) ?? "";
    expect(CHECKIN_TEXTS).toContain(herLine);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(herLine);
    const playedWhileSpeaking = await playedSources(page);
    const turnsBeforeSilence = practiceApi.turnRequestCount();
    expect(turnsBeforeSilence).toBe(1);

    // Two and a half windows' worth of fake time with her line still playing:
    // the timer must never have armed, so there is nothing new to say, play, or
    // ask the model for — and nothing moved. (Deliberately under
    // speech-synthesis.ts's 30s PLAYBACK_START_TIMEOUT_MS, which is what would
    // otherwise end her line for her and start the Handoff Gap at t=30s.)
    await page.clock.fastForward(19_000);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(herLine);
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");
    await page.clock.fastForward(6_000);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(herLine);
    await expect(page.getByTestId("practice-mic-status")).toContainText("Emily is speaking");
    // Emily's whole transcript: her opening line and this one reply — the
    // learner's echo is not one of her lines, and no reminder joined them.
    expect(await emilyLines(page)).toEqual([...OPENING_TEXTS, herLine]);
    expect(await playedSources(page)).toEqual(playedWhileSpeaking);
    expect(practiceApi.turnRequestCount()).toBe(turnsBeforeSilence);
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const whileSpeaking = await persistedPracticeSnapshot(page);
    expect(whileSpeaking.goalProgress).toEqual(["greeting"]);
    expect(whileSpeaking.turnRecords).toHaveLength(1);
    expect(whileSpeaking.retryCounts).toEqual({});
    expect(whileSpeaking.retryStreak ?? null).toBeNull();

    // Her line ends — the floor is still not the learner's. The Handoff Gap is
    // her line finishing, not their silence, and the app says so.
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(page.getByTestId("practice-mic-status")).toContainText(
      "Wait for her voice to settle",
    );

    // Let the gap elapse as its own step, so its end is the fake-clock instant
    // the 18s window is measured from: the mic status back at its idle prompt is
    // what tells us the gap is over and the floor is the learner's.
    //
    // Why not one 19s jump after `endCurrent()` and then "the remaining 3s": the
    // app re-arms the window in a React commit, which React schedules on a real
    // macrotask *after* the jump returns — so within a single 19s jump the gap
    // timer fires at t=3s but the window is not armed until the jump has already
    // ended (observed: 19s + 3s still produced no reminder, 18s short of the
    // window). Splitting the gap out makes the accounting honest: 15s of the
    // window must still produce nothing, 20s must produce the reminder.
    await page.clock.fastForward(4_000);
    await expect(page.getByTestId("practice-mic-status")).toContainText(
      "点击麦克风开始说话 Tap the mic to speak",
    );

    // 15s into an 18s window: still nothing, and still no Turn.
    await page.clock.fastForward(15_000);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(herLine);
    const emilyBeforeReminder = await emilyLines(page);
    expect(emilyBeforeReminder).toEqual([...OPENING_TEXTS, herLine]);
    expect(practiceApi.turnRequestCount()).toBe(turnsBeforeSilence);

    // Past 18s — now, and only now, the reminder lands: one Turn of two lines,
    // the nudge followed by the question of the Focus Goal the conversation has
    // moved on to (Check-in).
    await page.clock.fastForward(5_000);
    await expect.poll(async () => (await emilyLines(page)).length).toBe(
      emilyBeforeReminder.length + 2,
    );
    const reminderLines = (await emilyLines(page)).slice(-2);
    expect(SILENCE_NUDGE_TEXTS).toContain(reminderLines[0]);
    expect(CHECKIN_TEXTS).toContain(reminderLines[1]);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(reminderLines.join(" "));
    const reminderMessages = ((await persistedPracticeSnapshot(page)).messages ?? []).slice(-2);
    expect(reminderMessages[0].sequenceId).toBe(reminderMessages[1].sequenceId);
    // Still no Turn, and still nothing moved: the reminder is support, not an
    // attempt.
    expect(practiceApi.turnRequestCount()).toBe(turnsBeforeSilence);
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    expect((await persistedPracticeSnapshot(page)).retryCounts).toEqual({});
    expect(await persistedRetryStreak(page)).toBeNull();
  });
});

/**
 * Ends whatever is currently playing and lets the 3s Handoff Gap that follows
 * it elapse on the fake clock — the two things that have to happen before the
 * floor is genuinely the learner's again, since the fixture's audio never ends
 * on its own and `page.clock` owns every timer in these two tests. Ending a
 * playback that already finished is a no-op, so calling this when nothing is
 * playing is safe.
 *
 * Deliberately not a bare `fastForward(18_000)`: the silence window is measured
 * from a settled floor, so the gap and the window have to be advanced in that
 * order for the timer to have been armed at the moment the window is spent.
 */
async function finishSpeaking(page: Page): Promise<void> {
  await page.evaluate(() => window.__mockAudio?.endCurrent());
  await page.clock.fastForward(5_000);
}
