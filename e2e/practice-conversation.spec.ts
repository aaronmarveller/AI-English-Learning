import { test, expect } from "@playwright/test";
import {
  installScriptedPracticeApi,
  persistedMessages,
  PRACTICE_URL,
  resetStorage,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * E2E coverage for the Practice page's text-driven conversation core
 * (ticket 08; spec.md "Testing Decisions" > "接缝一（主）：浏览器 E2E" — a real
 * browser drives the whole app, and the only stubbed boundary here is the
 * LLM proxy route's network response (`/api/practice/turn`); everything
 * else — Goal Progress (src/lib/goal-progress.ts), the practice store,
 * routing — runs real code against a real `next build && next start` server.
 *
 * Issue #16: the model no longer says what Emily says next — the mock
 * supplies only the Judge's own output (a Goal Report, and where relevant
 * `learner_asked_back`). Emily's actual line is picked client-side at random
 * from the current Lesson's fixed Conversation Script pools
 * (src/content/lesson.ts), so specs below assert pool *membership*
 * (`toContain`) instead of an exact scripted string.
 *
 * Issue #47 (ADR-0012): that Judge output is a **Goal Report**, not a Verdict
 * — see e2e/fixtures.ts's `ScriptedTurnResponse`. Each Turn in these specs
 * achieves exactly one Goal, in canonical order, so the client derives
 * `accepted` from a report naming that Goal, and `needs_retry` from a report
 * that achieves nothing.
 *
 * The scripted turn-endpoint stub (`installScriptedPracticeApi`) and the
 * text-reply helper (`submitReply`) originated in this file but now live in
 * e2e/fixtures.ts, shared with practice-voice.spec.ts, practice-support
 * .spec.ts, and review.spec.ts — see that module's doc comments for why
 * (consolidated by issue #10).
 */

const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const RESPONSE_DID_NOT_ASK_BACK_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.map((line) => line.en);
const RESPONSE_ASKED_BACK_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.askedBack.map((line) => line.en);
const CLOSING_TEXTS = GREETING_SOMEBODY_LESSON.closingLines.map((line) => line.en);
const COMPLETION_TEXTS = [...GREETING_SOMEBODY_LESSON.completionMessages];
const GREETING_NEEDS_RETRY_TEXTS = GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines.map((line) => line.en);

test.describe("Practice page — conversation core", () => {
  test("Emily's opening line renders on load with zero calls to the turn endpoint", async ({
    page,
  }) => {
    await resetStorage(page);

    const turnRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/practice/turn")) turnRequests.push(request.url());
    });

    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    const openingText = await page.getByTestId("emily-message-bubble").innerText();
    expect(openingText.trim().length).toBeGreaterThan(0);

    // No learner input has happened yet, so nothing should have called the
    // LLM proxy — the opening line is a fixed pool picked client-side, not
    // LLM-generated.
    expect(turnRequests).toHaveLength(0);

    // Greeting is the first active step, highlighted as current; nothing
    // else has advanced.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
  });

  test("an accepted Turn moves the Focus Goal on and Emily's line comes from the checkin pool", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");

    await submitReply(page, "Hi Emily!");

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });

  test("the learner's input is echoed as its own bubble while Emily grades it, then the pair is replaced", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 400 });
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hey Emily, good morning!");

    // While the (delayed) mock is still "grading", the learner's exact
    // input is echoed back and the avatar shows the thinking state.
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hey Emily, good morning!");
    await expect(page.getByTestId("emily-avatar")).toHaveAttribute("data-state", "thinking");

    // Once graded, both bubbles are replaced by the new round: Emily's new
    // line renders (from the checkin pool), and the learner bubble is gone
    // until they answer again.
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });

  test("a Goal Report of nothing achieved leaves the Focus Goal where it was and shows a line from its needs_retry pool", async ({
    page,
  }) => {
    await resetStorage(page);
    // Issue #47: the wire carries a Goal Report now — `greeting` is the first
    // open Goal, and "untouched" (not "failed") is what an unrelated message
    // looks like, so the client derives needs_retry from "nothing achieved".
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "untouched" } }]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "banana");

    // needs_retry never moves Goal Progress, so there's no step-attribute
    // change to wait on the way an accepted Turn has — wait on the learner
    // bubble clearing instead (recordTurnResult always clears it once the turn
    // resolves, either Verdict), which still guarantees the reply text has
    // landed before a one-shot innerText() read below.
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(GREETING_NEEDS_RETRY_TEXTS).toContain(replyText);
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
  });

  test("off-topic input yields an empty Goal Report, derived to needs_retry, and leaves the Focus Goal where it was", async ({
    page,
  }) => {
    // Issue #15: off-topic is not a Verdict of its own — a learner who
    // wanders off the lesson's topic is judged "needs_retry" like any other
    // unsuccessful attempt. Issue #47: their Goal Report is empty (unrelated
    // chatter touches no Goal, and is never reported "failed"), which is
    // exactly the report below.
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ goalReport: {} }]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "What's the weather like on Mars?");

    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(GREETING_NEEDS_RETRY_TEXTS).toContain(replyText);
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
  });

  test("a learner who does not ask back during check-in is never answered — Emily acknowledges and waits", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: false },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi there!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await submitReply(page, "I'm good, thanks.");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");

    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_DID_NOT_ASK_BACK_TEXTS).toContain(replyText);
    expect(RESPONSE_ASKED_BACK_TEXTS).not.toContain(replyText);
  });

  test("a learner who asks back during check-in always hears an answer", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: true },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi there!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await submitReply(page, "I'm good, thanks! How about you?");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");

    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_ASKED_BACK_TEXTS).toContain(replyText);
    expect(RESPONSE_DID_NOT_ASK_BACK_TEXTS).not.toContain(replyText);
  });

  /**
   * Issue #54 (ADR-0013 decision 4, v2 tickets 3 and 4) — the two halves of
   * the reaction rule:
   *
   * - **the wait** (ticket 3): a check-in acknowledged *without* an ask-back
   *   gets exactly one line and no steer toward `response`, because `response`
   *   is a question the learner has to decide to ask.
   * - **the answer** (ticket 4's own four-Turn example): the check-in answered
   *   on one Turn and "How about you?" on the next still gets Emily's answer
   *   (her reaction is due whenever they asked), and only then a steer.
   */
  test("the wait: a check-in answered without an ask-back gets exactly one line, with no steer toward response", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: false },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi there!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");

    const emilyMessagesBefore = (await persistedMessages(page)).filter(
      (message) => message.role === "emily",
    ).length;
    await submitReply(page, "I'm good, thanks.");

    // `response` is the Focus Goal now — the check-in cleared it — but nothing
    // steers toward it: Emily acknowledges and waits for the learner to decide.
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");

    // Exactly one line, and it is the did-not-ask-back acknowledgement: the
    // count is what rules a steer line out, and the pool membership is what
    // rules out her answering a question nobody asked.
    const turnLines = (await persistedMessages(page))
      .filter((message) => message.role === "emily")
      .slice(emilyMessagesBefore);
    expect(turnLines).toHaveLength(1);
    expect(RESPONSE_DID_NOT_ASK_BACK_TEXTS).toContain(turnLines[0].textEn);
    expect(RESPONSE_ASKED_BACK_TEXTS).not.toContain(turnLines[0].textEn);
    // Never a Check-in-pool line: the learner just said how they were doing.
    expect(CHECKIN_TEXTS).not.toContain(turnLines[0].textEn);
    expect(turnLines[0].textZh.length).toBeGreaterThan(0);

    // The learner-facing bubble is that one line, nothing appended to it.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(turnLines[0].textEn);
  });

  test("ticket 4's four Turns: the later ask-back is answered first, then steered to Closing", async ({
    page,
  }) => {
    await resetStorage(page);
    // Ticket 4's own example, one Goal per Turn: "Hi!" (greeting), "I'm good."
    // (check-in, no ask-back — Emily acknowledges and waits), "How about you?"
    // (the ask-back that achieves `response`), "See you!" (closing, completing
    // Practice).
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: false },
      { goalReport: { response: "achieved" }, learner_asked_back: true },
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await submitReply(page, "I'm good.");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");

    const emilyMessagesBefore = (await persistedMessages(page)).filter(
      (message) => message.role === "emily",
    ).length;
    await submitReply(page, "How about you?");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "current");

    // Two lines, in that order: her answer to the question put to her, then
    // the Closing steer. The check-in landed a Turn earlier, so a reaction
    // keyed to "checkin achieved in this Turn" would have left the question
    // unanswered and steered on silently — the behaviour ADR-0013 changes.
    const [answerLine, steerLine] = (await persistedMessages(page))
      .filter((message) => message.role === "emily")
      .slice(emilyMessagesBefore);
    expect(RESPONSE_ASKED_BACK_TEXTS).toContain(answerLine.textEn);
    expect(CLOSING_TEXTS).toContain(steerLine.textEn);
    // Never a Check-in-only acknowledgement, in either slot: she is answering
    // a question, not acknowledging a check-in this Turn never carried.
    expect(RESPONSE_DID_NOT_ASK_BACK_TEXTS).not.toContain(answerLine.textEn);
    expect(CHECKIN_TEXTS).not.toContain(answerLine.textEn);
    expect(CHECKIN_TEXTS).not.toContain(steerLine.textEn);

    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_ASKED_BACK_TEXTS.some((line) => replyText.startsWith(line))).toBe(true);
    expect(CLOSING_TEXTS.some((line) => replyText.endsWith(line))).toBe(true);

    // The conversation still ends the ordinary way.
    await submitReply(page, "See you!");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("view-summary-button")).toBeEnabled();
    expect(COMPLETION_TEXTS).toContain(await page.getByTestId("emily-message-bubble").innerText());
  });

  test("driving all 4 Goals to achieved unlocks View Summary, and clicking it marks practice complete and navigates to /review", async ({
    page,
  }) => {
    await resetStorage(page);
    // One Goal per Turn, in canonical order — the shape #47's conversations
    // have, and the shape a learner following Emily's steer lines produces.
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      { goalReport: { checkin: "achieved" }, learner_asked_back: true },
      { goalReport: { response: "achieved" } },
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    const viewSummaryButton = page.getByTestId("view-summary-button");
    await expect(viewSummaryButton).toBeDisabled();

    await submitReply(page, "Hi there!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(viewSummaryButton).toBeDisabled();

    await submitReply(page, "Good, and you?");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");
    await expect(viewSummaryButton).toBeDisabled();

    await submitReply(page, "Good, thanks! And you? I'm doing pretty good, just heading to work.");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "current");
    await expect(viewSummaryButton).toBeDisabled();
    const closingLineText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CLOSING_TEXTS).toContain(closingLineText);

    await submitReply(page, "Have a good one!");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    await expect(viewSummaryButton).toBeEnabled();

    const completionText = await page.getByTestId("emily-message-bubble").innerText();
    expect(COMPLETION_TEXTS).toContain(completionText);

    // The text input is disabled once the conversation is complete.
    await expect(page.getByTestId("practice-text-input")).toBeDisabled();

    await viewSummaryButton.click();
    await expect(page).toHaveURL(/\/review(\?|$)/);

    // Clicking it marked "practice" complete in the shared progress store —
    // observable via the outer Learning Flow header's progress dot on the
    // page we just landed on.
    await expect(page.getByTestId("progress-dot-practice")).toHaveAttribute("data-state", "completed");
  });

  test("reloading mid-conversation keeps the same Goal Progress and message history instead of resetting", async ({
    page,
  }) => {
    // Practice's persistence internals (src/lib/practice-state.ts) were
    // rebuilt on a shared factory (src/lib/create-persisted-store.ts,
    // issue #7) — this is the reload-survival regression check that work
    // needs but didn't get one at the time: only src/lib/progress.ts's
    // Learning Flow equivalent (e2e/navigation-spine.spec.ts's "reloading
    // mid-flow..." test) previously existed. Seed the on-disk shape
    // directly (same key/shape src/lib/practice-state.ts's `deserialize`
    // reads) rather than via resetStorage()'s addInitScript — that init
    // script re-runs on the real reload below and would wipe the very
    // state this test is checking survives it — mirroring
    // navigation-spine.spec.ts's own reload test for exactly this reason.
    //
    // Issue #47: the seeded shape persists `goalProgress` (the set of Goals
    // achieved) where it used to persist a `conversationState` pointer; the
    // Conversation State on screen is derived from it. Issue #52's follow-up on
    // #51 renamed the per-Goal bookkeeping to `retryCounts` — a snapshot must
    // carry it (even empty) or `deserialize` discards it as a pre-change shape,
    // so the seeded greeting reads as first-try exactly as its record says.
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(
        "greeting-somebody:practice",
        JSON.stringify({
          goalProgress: ["greeting"],
          messages: [
            { id: "seed-1", role: "emily", textEn: "Hi there!", textZh: "嗨！", state: "greeting" },
            { id: "seed-2", role: "learner", textEn: "Hi!", textZh: "", state: "greeting" },
            {
              id: "seed-3",
              role: "emily",
              textEn: "How are you today?",
              textZh: "你今天怎么样？",
              state: "checkin",
            },
          ],
          turnRecords: [
            { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
          ],
          retryCounts: {},
        }),
      );
    });

    await page.goto(PRACTICE_URL);
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("How are you today?");

    await page.reload();

    // Same Goal Progress, same last message, same accumulated history — none
    // of it silently reset back to a fresh "greeting" start.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("How are you today?");
  });

  test("a snapshot persisted without goalProgress (the pre-#47 shape) is discarded on load", async ({
    page,
  }) => {
    // ADR-0012: "snapshots without it are discarded on load" — the same
    // in-flight-sessions-reset precedent as issue #20's shape change
    // (src/lib/practice-state.ts's `deserialize`, and its unit test in
    // src/lib/practice-state.test.ts for the non-browser half). Seeding the
    // old shape must produce a clean restart, not a crash and not a
    // half-restored conversation: `goalProgress` is missing, so the whole
    // snapshot is thrown away and the page opens a brand-new Practice.
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(
        "greeting-somebody:practice",
        JSON.stringify({
          conversationState: "checkin",
          messages: [
            { id: "seed-1", role: "emily", textEn: "Hi there!", textZh: "嗨！", state: "greeting" },
            { id: "seed-2", role: "learner", textEn: "Hi!", textZh: "", state: "greeting" },
            {
              id: "seed-3",
              role: "emily",
              textEn: "How are you today?",
              textZh: "你今天怎么样？",
              state: "checkin",
            },
          ],
          turnRecords: [
            { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
          ],
          attemptCounts: { greeting: 1 },
        }),
      );
    });

    await page.goto(PRACTICE_URL);

    // Back to the very start: greeting is the current step, no learner turn
    // survives, and Emily's only line is a freshly-picked opening line — not
    // the seeded mid-conversation one.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    const emilyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(GREETING_SOMEBODY_LESSON.openingLines.map((line) => line.en)).toContain(emilyText);
  });
});
