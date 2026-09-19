import { test, expect, type Page } from "@playwright/test";
import { installScriptedPracticeApi, mockSpeechApis, PRACTICE_URL, resetStorage, startSpeaking } from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * E2E coverage for the Practice page's voice input (ticket 09; spec.md
 * "Practice 页交互模型" — "必须回显识别结果" — and user stories 44-47).
 *
 * Reuses the same two stubbed boundaries as practice-conversation.spec.ts
 * (ticket 08): the LLM proxy route's network response, and the Web Speech
 * API via e2e/fixtures.ts's `mockSpeechApis`. Everything else — routing,
 * Goal Progress (src/lib/goal-progress.ts), the practice store — runs real
 * code against a real `next build && next start` server.
 *
 * The scripted LLM proxy stub helper (`installScriptedPracticeApi`) also
 * lives in e2e/fixtures.ts, shared with practice-conversation.spec.ts,
 * practice-support.spec.ts, and review.spec.ts (consolidated by issue #10 —
 * this file used to keep its own copy per ticket 08's file-ownership
 * boundary, which no longer applies now that both tickets are long since
 * merged).
 *
 * Issue #16: the mock no longer supplies Emily's reply text, so assertions
 * on `emily-message-bubble` check pool membership (imported from
 * src/content/lesson.ts) instead of a scripted exact string.
 *
 * Issue #47 (ADR-0012): the mock supplies a Goal Report per Turn and the
 * client derives the Verdict from it — see e2e/fixtures.ts's
 * `ScriptedTurnResponse`.
 */

const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const RESPONSE_ASKED_BACK_TEXTS = GREETING_SOMEBODY_LESSON.responseLines.askedBack.map((line) => line.en);

/**
 * Forces both the standard and vendor-prefixed Web Speech recognition
 * constructors to be absent, simulating a browser with no speech-recognition
 * support at all — distinct from `mockSpeechApis` (which installs a working
 * fake). Must run before `page.goto()` so the app's very first client render
 * already sees the unsupported browser.
 */
async function mockSpeechRecognitionUnsupported(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });
}

test.describe("Practice page — voice input", () => {
  test("a final recognition result is echoed back as the learner's bubble", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 300 });
    await page.goto(PRACTICE_URL);

    // Mic is the default, primary input mode with a visible idle state.
    const micButton = page.getByTestId("practice-mic-button");
    await expect(micButton).toBeVisible();
    await expect(micButton).toHaveAttribute("data-state", "idle");

    await micButton.click();
    await expect(micButton).toHaveAttribute("data-state", "listening");

    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi there", { isFinal: true }));

    // The recognized text is echoed verbatim in the learner bubble — the
    // same pipeline the text form already uses — so a misrecognition would
    // be visible here rather than silently swallowed.
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi there");

    // Once submitted, the mic returns to idle rather than staying "listening".
    await expect(micButton).toHaveAttribute("data-state", "idle");

    // The conversation actually advanced through the same logic text input
    // would have triggered. Wait on the (retrying) step-state assertion
    // first — recordTurnResult persists the new state and Emily's reply in
    // the same store update, so by the time this observes "current" the
    // reply text has landed too; a one-shot innerText() read right after the
    // learner bubble assertion can otherwise race ahead of the re-render.
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });

  test("a second mic turn also captures and submits speech", async ({ page }) => {
    // Regression coverage: the recognizer used to rely entirely on
    // continuous=false's own auto-stop after a final result, instead of
    // explicitly stopping itself (see src/lib/speech-recognition.ts's
    // startListening). mockSpeechApis's stub now models the real risk that
    // created — a session that's never explicitly stopped still holds the
    // microphone, so starting a new one on top of it fails — which is what
    // makes this test actually exercise the fix instead of trivially
    // passing regardless of it.
    await resetStorage(page);
    await mockSpeechApis(page);
    // delayMs: without it, the mocked route can resolve fast enough that a
    // turn fully completes — replacing the learner bubble with Emily's next
    // line — before the assertions on that transient bubble below even get
    // their first poll (see installScriptedPracticeApi's own doc comment).
    // Issue #47: two Turns, each achieving the one Goal that Turn is about —
    // `greeting`, then `checkin` (which the learner asked a question back
    // during, selecting the Response pool's "asked back" half).
    await installScriptedPracticeApi(
      page,
      [
        { goalReport: { greeting: "achieved" } },
        { goalReport: { checkin: "achieved" }, learner_asked_back: true },
      ],
      { delayMs: 300 },
    );
    await page.goto(PRACTICE_URL);

    const micButton = page.getByTestId("practice-mic-button");

    // Turn 1
    await micButton.click();
    await expect(micButton).toHaveAttribute("data-state", "listening");
    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi there", { isFinal: true }));
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi there");
    await expect(micButton).toHaveAttribute("data-state", "idle");
    // Wait on the (retrying) step-state assertion before reading the reply
    // text — recordTurnResult persists the new state and Emily's reply in
    // the same store update, so this guarantees the text has landed.
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const turn1ReplyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(turn1ReplyText);
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled();

    // Turn 2 — this is the reported bug: the mic should capture again.
    await micButton.click();
    await expect(micButton).toHaveAttribute("data-state", "listening");
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("I'm good, how about you?", { isFinal: true }),
    );
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("I'm good, how about you?");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute("data-state", "current");
    const turn2ReplyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(RESPONSE_ASKED_BACK_TEXTS).toContain(turn2ReplyText);
  });

  test("an interim result is shown live near the mic before the final result is submitted", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 300 });
    await page.goto(PRACTICE_URL);

    await startSpeaking(page);
    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi th", { isFinal: false }));

    // Interim text is visible but nothing has been submitted yet.
    await expect(page.getByTestId("practice-mic-status")).toHaveText("Hi th");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);

    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi there", { isFinal: true }));
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi there");
  });

  test("tapping the listening mic again submits the speech recognized so far", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    // delayMs for the same reason as the sibling tests above: this assertion is
    // about the *transient* learner bubble, and without a delay the mocked route
    // can resolve fast enough that the append and the graded reply land in one
    // render, so the bubble this test looks for never reaches the DOM (see
    // installScriptedPracticeApi's own doc comment).
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 300 });
    await page.goto(PRACTICE_URL);

    const micButton = page.getByTestId("practice-mic-button");
    await page.getByTestId("replay-button").click();
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBeGreaterThanOrEqual(1);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled();
    await micButton.click();
    await expect(micButton).toHaveAttribute("data-state", "listening");
    await expect(micButton).toHaveAccessibleName("停止说话 Stop listening");

    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("This is what I said", { isFinal: false }));
    await expect(page.getByTestId("practice-mic-status")).toHaveText("This is what I said");
    await micButton.click();

    await expect(micButton).toHaveAttribute("data-state", "idle");
    await expect(micButton).toHaveAccessibleName("开始说话 Start speaking");
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("This is what I said");
  });

  test("the next iOS mic turn does not stop an already-ended recognizer", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    // Issue #47: two Turns, each achieving the one Goal that Turn is about —
    // `greeting`, then `checkin` (which the learner asked a question back
    // during, selecting the Response pool's "asked back" half).
    await installScriptedPracticeApi(
      page,
      [
        { goalReport: { greeting: "achieved" } },
        { goalReport: { checkin: "achieved" }, learner_asked_back: true },
      ],
      { delayMs: 300 },
    );
    await page.goto(PRACTICE_URL);

    const micButton = page.getByTestId("practice-mic-button");
    await page.getByTestId("replay-button").click();
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBeGreaterThanOrEqual(1);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled();
    await micButton.click();
    await page.evaluate(() => window.__mockSpeechRecognition?.rejectRedundantStops());
    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("Hi there", { isFinal: true }),
    );
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");

    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled();

    await micButton.click();
    await expect(micButton).toHaveAttribute("data-state", "listening");

    await page.evaluate(() =>
      window.__mockSpeechRecognition?.emitResult("I'm good, how about you?", { isFinal: true }),
    );
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("I'm good, how about you?");
  });

  test("three consecutive no-speech errors warn once before falling back to working text input", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 300 });
    await page.goto(PRACTICE_URL);

    const micButton = page.getByTestId("practice-mic-button");
    const micStatus = page.getByTestId("practice-mic-status");

    await micButton.click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(micButton).toHaveAttribute("data-state", "idle");
    await expect(micStatus).not.toContainText("没听清");

    await micButton.click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(micButton).toHaveAttribute("data-state", "idle");
    await expect(micStatus).toContainText("没听清");
    await expect(micStatus).toContainText("Please try again");
    await expect(page.getByTestId("practice-text-input")).toHaveCount(0);

    await micButton.click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));

    const fallbackReason = page.getByTestId("practice-input-fallback-reason");
    await expect(fallbackReason).toContainText("连续三次没听清");
    await expect(fallbackReason).toContainText("switched to typing");
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);

    await page.getByTestId("practice-text-input").fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");

    await page.getByTestId("practice-input-mode-toggle").click();
    await expect(page.getByTestId("practice-mic-button")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(page.getByTestId("practice-mic-button")).toBeEnabled();

    await startSpeaking(page);
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(page.getByTestId("practice-mic-button")).toBeVisible();
    await expect(page.getByTestId("practice-mic-status")).not.toContainText("没听清");

    await startSpeaking(page);
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(page.getByTestId("practice-mic-status")).toContainText("没听清");
    await expect(page.getByTestId("practice-text-input")).toHaveCount(0);
  });

  test("a successful recognition resets the consecutive no-speech count", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 300 });
    await page.goto(PRACTICE_URL);

    const micButton = page.getByTestId("practice-mic-button");
    const micStatus = page.getByTestId("practice-mic-status");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await micButton.click();
      await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    }
    await expect(micStatus).toContainText("没听清");

    await micButton.click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("Hi there", { isFinal: true }));
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    await expect
      .poll(() => page.evaluate(() => window.__mockAudio?.getPlayedSources().length ?? 0))
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.__mockAudio?.endCurrent());
    await expect(micButton).toBeEnabled();

    await micButton.click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(micButton).toBeVisible();
    await expect(micStatus).not.toContainText("没听清");

    await micButton.click();
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(micStatus).toContainText("没听清");
    await expect(page.getByTestId("practice-mic-button")).toBeVisible();
    await expect(page.getByTestId("practice-text-input")).toHaveCount(0);
  });

  test("microphone permission denial auto-falls back to text input with an explanation, and text still works", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    await startSpeaking(page);
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("not-allowed"));

    await expect(page.getByTestId("practice-input-fallback-reason")).toBeVisible();
    await expect(page.getByTestId("practice-text-input")).toBeVisible();
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);

    await page.getByTestId("practice-text-input").fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();

    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });

  test("no-microphone-hardware error auto-falls back to text input with a distinct explanation, and text still works", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    await startSpeaking(page);
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("audio-capture"));

    // Distinct from the permission-denied explanation — the learner should
    // be told specifically that no microphone was detected, not that access
    // was denied.
    await expect(page.getByTestId("practice-input-fallback-reason")).toBeVisible();
    await expect(page.getByTestId("practice-input-fallback-reason")).toContainText("检测不到麦克风设备");
    await expect(page.getByTestId("practice-text-input")).toBeVisible();
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);

    await page.getByTestId("practice-text-input").fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();

    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });

  test("when speech recognition is unsupported, the page auto-degrades to text input with an explanation, and the text path still fully works", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechRecognitionUnsupported(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }], { delayMs: 300 });
    await page.goto(PRACTICE_URL);

    // No mic UI at all; text input is already the active mode with an
    // explanation of why, and there's no point offering a manual switch
    // back to a mode that doesn't work.
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);
    await expect(page.getByTestId("practice-input-fallback-reason")).toBeVisible();
    await expect(page.getByTestId("practice-input-fallback-reason")).toContainText("语音识别");
    await expect(page.getByTestId("practice-input-mode-toggle")).toHaveCount(0);

    const textInput = page.getByTestId("practice-text-input");
    await expect(textInput).toBeVisible();

    await textInput.fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();

    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });

  test("the manual mode toggle switches between voice and text even when the mic works fine", async ({ page }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-mic-button")).toBeVisible();

    await page.getByTestId("practice-input-mode-toggle").click();
    await expect(page.getByTestId("practice-text-input")).toBeVisible();
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);
    // A deliberate manual switch isn't a "fallback" — no explanation shown.
    await expect(page.getByTestId("practice-input-fallback-reason")).toHaveCount(0);

    // Text mode works exactly like the standalone text form.
    await page.getByTestId("practice-text-input").fill("Hi Emily!");
    await page.getByTestId("practice-send-button").click();
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);

    // Switching back to voice is available too.
    await page.getByTestId("practice-input-mode-toggle").click();
    await expect(page.getByTestId("practice-mic-button")).toBeVisible();
  });
});
