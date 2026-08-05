import { test, expect } from "@playwright/test";
import { installScriptedPracticeApi, PRACTICE_URL, resetStorage, submitReply } from "./fixtures";

/**
 * E2E coverage for the Practice page's text-driven conversation core
 * (ticket 08; spec.md "Testing Decisions" > "接缝一（主）：浏览器 E2E" — a real
 * browser drives the whole app, and the only stubbed boundary here is the
 * LLM proxy route's network response (`/api/practice/turn`); everything
 * else — the pure Conversation State Machine, the practice store, routing —
 * runs real code against a real `next build && next start` server.
 *
 * Filename leaves room for ticket 09/10's `practice-voice.spec.ts` /
 * `practice-support.spec.ts` to land alongside this one without collision.
 *
 * Reached via `?debug=1` (see src/lib/debug.ts / the learning layout's
 * guard) since Practice's normal prerequisite is completing Observe/
 * Explore/Notice, which isn't this ticket's concern to drive through.
 *
 * The scripted turn-endpoint stub (`installScriptedPracticeApi`) and the
 * text-reply helper (`submitReply`) originated in this file but now live in
 * e2e/fixtures.ts, shared with practice-voice.spec.ts, practice-support
 * .spec.ts, and review.spec.ts — see that module's doc comments for why
 * (consolidated by issue #10).
 */

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

  test("verdict accepted advances the conversation state and updates the 4-step indicator", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");

    await submitReply(page, "Hi Emily!");

    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "completed");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
  });

  test("the learner's input is echoed as its own bubble while Emily grades it, then the pair is replaced", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(
      page,
      [
        {
          verdict: "accepted",
          reply_en: "Great, how are you today?",
          reply_zh: "太好了，你今天怎么样？",
          highlight_key: "natural-paraphrase",
        },
      ],
      { delayMs: 400 },
    );
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hey Emily, good morning!");

    // While the (delayed) mock is still "grading", the learner's exact
    // input is echoed back and the avatar shows the thinking state.
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hey Emily, good morning!");
    await expect(page.getByTestId("emily-avatar")).toHaveAttribute("data-state", "thinking");

    // Once graded, both bubbles are replaced by the new round: Emily's new
    // line renders, and the learner bubble is gone until they answer again.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);
  });

  test("verdict needs_retry keeps the learner on the same step and shows Emily's encouragement", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "needs_retry",
        reply_en: "Almost! Try saying hi back to me.",
        reply_zh: "差一点点！试着跟我打个招呼吧。",
        highlight_key: "needs-more-practice",
      },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "banana");

    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Almost! Try saying hi back to me.");
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
  });

  test("verdict off_topic also keeps the learner on the same step", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "off_topic",
        reply_en: "Haha, fair! Anyway, would you say hi back?",
        reply_zh: "哈哈，好吧！话说，要不要跟我打个招呼？",
        highlight_key: "went-off-topic",
      },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "What's the weather like on Mars?");

    await expect(page.getByTestId("emily-message-bubble")).toHaveText(
      "Haha, fair! Anyway, would you say hi back?",
    );
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
  });

  test("driving all 4 steps to accepted unlocks View Summary, and clicking it marks practice complete and navigates to /review", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "How are you today?",
        reply_zh: "你今天怎么样？",
        highlight_key: "used-whitelist-phrase",
      },
      {
        verdict: "accepted",
        reply_en: "I'm doing great, thanks! How about you?",
        reply_zh: "我很好，谢谢！你呢？",
        highlight_key: "natural-paraphrase",
      },
      {
        verdict: "accepted",
        reply_en: "That's great to hear! Well, I should get going.",
        reply_zh: "太好了！好啦，我该走了。",
        highlight_key: "confident-full-turn",
      },
      {
        verdict: "accepted",
        reply_en: "Bye! Great chatting with you — go check out your summary!",
        reply_zh: "拜拜！很高兴和你聊天——去看看你的学习总结吧！",
        highlight_key: "used-whitelist-phrase",
      },
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

    await submitReply(page, "Have a good one!");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute("data-state", "completed");
    await expect(viewSummaryButton).toBeEnabled();

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
          highlightKeys: ["used-whitelist-phrase"],
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
