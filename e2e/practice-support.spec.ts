import { test, expect, type Page } from "@playwright/test";
import { installScriptedPracticeApi, PRACTICE_URL, resetStorage, submitReply } from "./fixtures";

/**
 * E2E coverage for the Practice page's support & recovery features (ticket
 * 10; spec.md "Practice 页交互模型" / "语言口径", user stories 48-57/62/67):
 * per-message bilingual subtitle toggle (default-open only on the very
 * first message), the replay button, the Ask-in-Chinese sheet, the
 * silence-timeout nudge, and the full-transcript drawer. All five must
 * never advance `conversationState` or call the LLM proxy route on their
 * own — that's the core constraint this whole ticket exists to protect.
 *
 * Same seam as e2e/practice-conversation.spec.ts (ticket 08): a real browser
 * drives the whole app; the only stubbed boundary is the LLM proxy route's
 * network response (`/api/practice/turn`), via e2e/fixtures.ts's
 * `installScriptedPracticeApi` — shared with practice-conversation.spec.ts,
 * practice-voice.spec.ts, and review.spec.ts (consolidated by issue #10;
 * this file used to keep its own copy per ticket 10's file-ownership
 * boundary, which no longer applies now that both tickets are long since
 * merged).
 */

/** Collects every request URL matching `pattern`, in order, for later assertion. */
function trackRequestsMatching(page: Page, pattern: RegExp): string[] {
  const matched: string[] = [];
  page.on("request", (request) => {
    if (pattern.test(request.url())) matched.push(request.url());
  });
  return matched;
}

function trackTurnRequests(page: Page): string[] {
  return trackRequestsMatching(page, /\/api\/practice\/turn/);
}

test.describe("Practice page — support & recovery", () => {
  test("the opening message defaults to showing Chinese; a later Emily message defaults to English-only", async ({
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

    // First message in the whole conversation: Chinese is already visible,
    // no click required (spec.md 语言口径: "第一条 Opening Message 默认展开
    // 中文，降低初次入场门槛").
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("emily-message-zh")).toBeVisible();
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "expanded");

    await submitReply(page, "Hi Emily!");

    // Every subsequent Emily message defaults back to English-only.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "collapsed");
  });

  test("toggling one message's subtitle doesn't carry over to the next message", async ({ page }) => {
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

    // Opening line starts expanded — collapse it, proving the toggle is a
    // real, independent per-message switch and not just "whatever the
    // default happens to be".
    await page.getByTestId("subtitle-toggle-button").click();
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);

    await submitReply(page, "Hi Emily!");

    // The new message resets to its own default (collapsed) regardless of
    // what the previous message's toggle was left at.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "collapsed");

    // And it's still fully interactive on the new message.
    await page.getByTestId("subtitle-toggle-button").click();
    await expect(page.getByTestId("emily-message-zh")).toHaveText("太好了，你今天怎么样？");
  });

  test("the replay button never touches subtitle visibility or the conversation state", async ({ page }) => {
    await resetStorage(page);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-zh")).toBeVisible();
    await page.getByTestId("replay-button").click();

    // Replay is independent of the caption toggle in both directions.
    await expect(page.getByTestId("emily-message-zh")).toBeVisible();
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
  });

  test("opening and closing Ask in Chinese leaves the conversation state untouched and never calls the turn endpoint", async ({
    page,
  }) => {
    await resetStorage(page);
    const turnRequests = trackTurnRequests(page);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");

    await page.getByTestId("ask-in-chinese-button").click();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toBeVisible();

    // The fixed 4-part content is present and non-empty (meaning / when to
    // use / example / encouragement) — grounded in the current step, not a
    // network response.
    const sheetText = await page.getByTestId("ask-in-chinese-sheet").innerText();
    expect(sheetText.trim().length).toBeGreaterThan(0);

    await page.getByTestId("ask-in-chinese-close-button").click();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toHaveCount(0);

    // Still on the exact same step, before and after — asking for help was
    // never treated as a turn.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    expect(turnRequests).toHaveLength(0);
  });

  test("learner silence produces exactly one gentle nudge, without advancing state or calling the turn endpoint", async ({
    page,
  }) => {
    await resetStorage(page);
    const turnRequests = trackTurnRequests(page);
    await page.clock.install();
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");

    // Fast-forward past the configured 18s silence window without the
    // learner ever submitting anything.
    await page.clock.fastForward(19000);

    // Emily's newest line is now the fixed nudge, not an LLM reply.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Take your time!");
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    expect(turnRequests).toHaveLength(0);
  });

  test("the transcript drawer reveals every message once expanded, in order", async ({ page }) => {
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

    // Collapsed by default — doesn't crowd the main view.
    await expect(page.getByTestId("transcript-message")).toHaveCount(0);

    await page.getByTestId("transcript-toggle-button").click();
    await expect(page.getByTestId("transcript-message")).toHaveCount(1); // just the opening line so far

    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");

    // Opening line + learner's echoed turn + Emily's reply.
    await expect(page.getByTestId("transcript-message")).toHaveCount(3);
  });

  test("Emily's opening line auto-plays (immediately, or via the first-interaction fallback), and never plays again for a later reply", async ({
    page,
  }) => {
    await resetStorage(page);
    // Counts real play() attempts on the opening line's <audio> specifically
    // (by src), not raw network requests — a blocked attempt still triggers
    // the browser to fetch the file for buffering even though it never
    // audibly plays (see the "when the browser blocks autoplay" test below),
    // so a request count can't distinguish "fetched once, played once" from
    // "fetched twice because the immediate attempt was blocked and the
    // fallback replayed it" — both are 2 requests but only the second is a
    // real bug.
    await page.addInitScript(() => {
      (window as unknown as { __openingPlayCount: number }).__openingPlayCount = 0;
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (/\/audio\/opening-\d\.mp3$/.test(this.src)) {
          (window as unknown as { __openingPlayCount: number }).__openingPlayCount += 1;
        }
        return originalPlay.apply(this);
      };
    });
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);

    await page.goto(PRACTICE_URL);
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();

    // This submit is itself a qualifying "first interaction", covering the
    // fallback path if the immediate attempt was blocked.
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");

    const openingPlayCount = await page.evaluate(
      () => (window as unknown as { __openingPlayCount: number }).__openingPlayCount,
    );
    // 1 if the immediate attempt succeeded outright, 2 if it was blocked and
    // the fallback retried it — never more. A 3rd attempt would mean Emily's
    // later, LLM-generated reply (which has no pregenerated file and speaks
    // through browser synthesis, not this <audio> path) incorrectly
    // re-triggered the opening line's audio.
    expect(openingPlayCount).toBeGreaterThanOrEqual(1);
    expect(openingPlayCount).toBeLessThanOrEqual(2);
  });

  test("when the browser blocks autoplay, the opening line plays on the learner's first tap instead", async ({
    page,
  }) => {
    await resetStorage(page);
    // Simulates a browser that blocks unmuted audio without a prior user
    // gesture on this origin (most mobile browsers, on a fresh session) —
    // the very first play() attempt (Practice's on-load autoplay try)
    // rejects; a later one (triggered by a real click below) succeeds, the
    // same way a real gesture would unblock the browser's own policy.
    // speechSynthesis is also forced to fail throughout, so the segment's
    // overall "did it actually play" signal depends only on the pregenerated
    // <audio> path every opening line has. `play()` calls are counted onto
    // `window.__playCallCount` instead of relying on network requests —
    // `new Audio(src)` alone can trigger a real fetch even when the
    // subsequent `.play()` is blocked, so a request count can't distinguish
    // "fetched but blocked" from "actually played".
    await page.addInitScript(() => {
      (window as unknown as { __playCallCount: number }).__playCallCount = 0;
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        const calls = ++(window as unknown as { __playCallCount: number }).__playCallCount;
        if (calls === 1) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        return originalPlay.apply(this);
      };
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        writable: true,
        value: {
          speaking: false,
          pending: false,
          paused: false,
          speak(utterance: SpeechSynthesisUtterance) {
            utterance.onerror?.(new Event("error") as unknown as SpeechSynthesisErrorEvent);
          },
          cancel() {},
          pause() {},
          resume() {},
          getVoices() {
            return [];
          },
        },
      });
    });

    await page.goto(PRACTICE_URL);
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();

    function playCallCount(): Promise<number> {
      return page.evaluate(() => (window as unknown as { __playCallCount: number }).__playCallCount);
    }

    // The on-load autoplay attempt happens (and is blocked) exactly once.
    await expect.poll(playCallCount).toBe(1);

    // The learner's first tap anywhere on the page is a genuine user gesture
    // — Emily's opening line plays then instead of staying silent.
    await page.getByTestId("emily-message-bubble").click();
    await expect.poll(playCallCount).toBe(2);
  });

  test("the restart button clears the conversation and starts over from a fresh opening line", async ({ page }) => {
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

    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");

    await page.getByTestId("restart-practice-button").click();

    // Back to the very first step, with no learner turn left over from the
    // discarded conversation.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);

    // A fresh opening line is shown, defaulting to its Chinese caption
    // expanded — the same "first message in the conversation" treatment as
    // a brand new session gets.
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("emily-message-zh")).toBeVisible();
  });
});
