import { test, expect } from "@playwright/test";
import { installScriptedPracticeApi, PRACTICE_URL, resetStorage, submitReply } from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * E2E coverage for the Practice page's text-driven conversation core
 * (ticket 08; spec.md "Testing Decisions" > "接缝一（主）：浏览器 E2E" — a real
 * browser drives the whole app, and the only stubbed boundary here is the
 * LLM proxy route's network response (`/api/practice/turn`); everything
 * else — the pure Conversation State Machine, the practice store, routing —
 * runs real code against a real `next build && next start` server.
 *
 * Issue #16: the model no longer says what Emily says next — the mock only
 * ever supplies `verdict` (and, where relevant, `learner_asked_back`).
 * Emily's actual line is picked client-side at random from the current
 * Lesson's fixed Conversation Script pools (src/content/lesson.ts), so specs
 * below assert pool *membership* (`toContain`) instead of an exact scripted
 * string.
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

  test("verdict accepted advances the conversation state and Emily's line comes from the checkin pool", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }]);
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
    await installScriptedPracticeApi(page, [{ verdict: "accepted" }], { delayMs: 400 });
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

  test("verdict needs_retry keeps the learner on the same step and shows a line from that state's needs_retry pool", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "needs_retry" }]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "banana");

    // needs_retry never advances state, so there's no step-attribute change
    // to wait on the way accepted turns have — wait on the learner bubble
    // clearing instead (recordTurnResult always clears it once the turn
    // resolves, verdict either way), which still guarantees the reply text
    // has landed before a one-shot innerText() read below.
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(GREETING_NEEDS_RETRY_TEXTS).toContain(replyText);
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
  });

  test("off-topic input is judged needs_retry and keeps the learner on the same step", async ({ page }) => {
    // Issue #15: off-topic is not a Verdict of its own — a learner who
    // wanders off the lesson's topic is judged "needs_retry" like any other
    // unsuccessful attempt.
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ verdict: "needs_retry" }]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "What's the weather like on Mars?");

    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(GREETING_NEEDS_RETRY_TEXTS).toContain(replyText);
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
  });

  test("a learner who does not ask back during check-in never hears a 'thanks for asking' line", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { verdict: "accepted" },
      { verdict: "accepted", learner_asked_back: false },
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
      { verdict: "accepted" },
      { verdict: "accepted", learner_asked_back: true },
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

  test("driving all 4 steps to accepted unlocks View Summary, and clicking it marks practice complete and navigates to /review", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { verdict: "accepted" },
      { verdict: "accepted", learner_asked_back: true },
      { verdict: "accepted" },
      { verdict: "accepted" },
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

  test("reloading mid-conversation keeps the same step and message history instead of resetting", async ({
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
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("How are you today?");

    await page.reload();

    // Same step, same last message, same accumulated history — none of it
    // silently reset back to a fresh "greeting" start.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("How are you today?");
  });
});
