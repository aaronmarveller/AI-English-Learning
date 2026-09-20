import { test, expect, type Page } from "@playwright/test";
import {
  emilyLines,
  installScriptedPracticeApi,
  mockSpeechApis,
  persistedPracticeSnapshot,
  PRACTICE_URL,
  recoveryQuestionLine,
  resetStorage,
  startSpeaking,
  submitReply,
} from "./fixtures";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

/**
 * E2E coverage for the Practice page's support & recovery features (ticket
 * 10; spec.md "Practice 页交互模型" / "语言口径", user stories 48-57/62/67):
 * per-message bilingual subtitle toggle (default-collapsed on every new
 * message), the replay button, the Ask-in-Chinese sheet, the
 * silence-timeout nudge, and the full-transcript drawer. All five must
 * never move Goal Progress or call the LLM proxy route on their
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
 *
 * Issue #16: the mock no longer supplies Emily's reply text — she picks it
 * client-side from the current Lesson's fixed Conversation Script pools.
 * Tests here that only care about UI mechanics (not exact wording) assert
 * against the relevant pool (imported from src/content/lesson.ts) instead of
 * a hardcoded scripted string. The two tests that used to prove a live,
 * model-generated reply gets synthesized through the on-demand `/api
 * /practice/speak` TTS route no longer apply — every one of Emily's lines is
 * now a fixed, pre-authored Conversation Script line (this file's own top
 * doc comment), same category of text as the opening line, so there is no
 * more "no fixed pool to pre-generate from ahead of time" text for Practice
 * replies. That fallback ladder (src/lib/speech-synthesis.ts) still exists
 * and still degrades gracefully for any scripted line without a
 * pre-generated file yet (issue #17's job) — it's just no longer something
 * *this* ticket's content proves through a dedicated "live reply" test.
 */

const CHECKIN_TEXTS = GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.en);
const CHECKIN_ZH_BY_EN = new Map(GREETING_SOMEBODY_LESSON.checkinLines.map((line) => [line.en, line.zh]));

/**
 * The silence-nudge pool, by text (issue #16's 3 lines; issue #56 kept the pool
 * untouched and made it the *first* line of a two-line silence reminder).
 */
const SILENCE_NUDGE_TEXTS = GREETING_SOMEBODY_LESSON.silenceNudgeLines.map((line) => line.en);

/**
 * The reminder's second line at a fresh conversation: the question the Focus
 * Goal's first-tier Recovery asks — Greeting's, since Greeting is the first
 * open Goal at mount (issue #56; v2 ticket 9's "Take your time. How are you
 * today?" is the Check-in case of this same rule).
 */
const GREETING_REMINDER_QUESTION_TEXT = recoveryQuestionLine("greeting").en;

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
  test("the opening and later Emily messages both default to English-only", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    // AI Configuration: every new AI message starts in English-only mode.
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "collapsed");

    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");

    // Every subsequent Emily message also defaults to English-only.
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "collapsed");
  });

  test("toggling one message's subtitle doesn't carry over to the next message", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    // Opening line starts collapsed — expand it, proving the toggle is a
    // real, independent per-message switch and not just "whatever the
    // default happens to be".
    await page.getByTestId("subtitle-toggle-button").click();
    await expect(page.getByTestId("emily-message-zh")).toBeVisible();

    await submitReply(page, "Hi Emily!");

    // The new message resets to its own default (collapsed) regardless of
    // what the previous message's toggle was left at.
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveAttribute("data-state", "collapsed");

    // And it's still fully interactive on the new message, showing the
    // matching Chinese translation for whichever checkin line was picked.
    await page.getByTestId("subtitle-toggle-button").click();
    await expect(page.getByTestId("emily-message-zh")).toHaveText(CHECKIN_ZH_BY_EN.get(replyText) ?? "");
  });

  test("the replay button never touches subtitle visibility or the conversation state", async ({ page }) => {
    await resetStorage(page);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await page.getByTestId("replay-button").click();

    // Replay is independent of the caption toggle in both directions.
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
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

  test("learner silence produces exactly one gentle reminder, without advancing state or calling the turn endpoint", async ({
    page,
  }) => {
    await resetStorage(page);
    const turnRequests = trackTurnRequests(page);
    await page.clock.install();
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");

    // Fast-forward past the configured 18s silence window without the
    // learner ever submitting anything. Emily has spoken her opening line and
    // nothing else, so this Turn is the reminder's two messages.
    await page.clock.fastForward(19000);
    await expect.poll(async () => (await emilyLines(page)).length).toBe(3);

    // Emily's newest Turn is the silence reminder (issue #56; v2 ticket 9):
    // the fixed silence-nudge pool's line — never an LLM reply — followed by
    // the Focus Goal's question, as TWO lines in the one bubble a Turn's lines
    // always share (joined with a single space; never one composed sentence,
    // ADR-0014 decision 3).
    const reminderLines = (await emilyLines(page)).slice(-2);
    expect(SILENCE_NUDGE_TEXTS).toContain(reminderLines[0]);
    expect(reminderLines[1]).toBe(GREETING_REMINDER_QUESTION_TEXT);
    await expect(page.getByTestId("emily-message-bubble")).toHaveText(
      `${reminderLines[0]} ${GREETING_REMINDER_QUESTION_TEXT}`,
    );

    // One Turn, not two: both lines were written in a single append (they
    // share a `sequenceId`), which is what makes the bubble and the playback
    // treat them as one reminder.
    const messages = (await persistedPracticeSnapshot(page)).messages ?? [];
    const reminderMessages = messages.slice(-2);
    expect(reminderMessages[0].sequenceId).toBeTruthy();
    expect(reminderMessages[0].sequenceId).toBe(reminderMessages[1].sequenceId);

    // And nothing else moved: silence is not a Turn, so the Focus Goal, Goal
    // Progress, the step states, the Retry Streak and the request count are all
    // exactly where they were.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    const snapshot = await persistedPracticeSnapshot(page);
    expect(snapshot.goalProgress).toEqual([]);
    expect(snapshot.turnRecords).toEqual([]);
    expect(snapshot.retryCounts).toEqual({});
    expect(snapshot.retryStreak ?? null).toBeNull();
    expect(turnRequests).toHaveLength(0);
  });

  test("silence nudges stay paused for the entire Ask-in-Chinese session", async ({ page }) => {
    await resetStorage(page);
    await page.clock.install();
    await page.goto(PRACTICE_URL);

    const openingText = await page.getByTestId("emily-message-bubble").innerText();
    await page.getByTestId("ask-in-chinese-button").click();
    await expect(page.getByTestId("ask-in-chinese-sheet")).toBeVisible();

    await page.clock.fastForward(19000);

    await expect(page.getByTestId("emily-message-bubble")).toHaveText(openingText);
  });

  test("typing Chinese into the reply box resolves to support_requested — no advance, no judge call", async ({
    page,
  }) => {
    // Issue #18: Chinese input typed straight into the main reply box (not
    // the Ask-in-Chinese button) is detected client-side and resolves to
    // `support_requested` before the Judge is ever called. Deliberately
    // installs no scripted turn response at all — if this ever regressed
    // into calling `/api/practice/turn`, the unstubbed route would 404 and
    // the turn would surface as a visible error instead of silently passing.
    await resetStorage(page);
    const turnRequests = trackTurnRequests(page);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");

    await submitReply(page, "你好 Emily，最近怎么样？");

    // The conversation stays on exactly the same step — this was never
    // judged, so it can neither advance nor fail the current step.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    expect(turnRequests).toHaveLength(0);

    // Emily still responds (a minimal placeholder nudge, not a graded
    // reply) — the conversation doesn't just silently swallow the input.
    await expect(page.getByTestId("emily-message-bubble")).not.toBeEmpty();

    // A follow-up in real English still works normally afterward — this
    // Chinese Turn didn't leave the conversation in some broken state.
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);
  });


    // Collapsed by default — doesn't crowd the main view.



    // Opening line + learner's echoed turn + Emily's reply.

  test("Emily's opening line and every later reply enter audio playback", async ({
    page,
  }) => {
    await resetStorage(page);
    // The shared audio controller records successful playback by source and
    // models the same per-element gesture gate that makes this fallback
    // necessary on iOS.
    await mockSpeechApis(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);

    await page.goto(PRACTICE_URL);
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();

    // This submit is itself a qualifying "first interaction", covering the
    // fallback path if the immediate attempt was blocked.
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);

    const playedSources = await page.evaluate(() => {
      const controller = window.__mockAudio;
      return controller?.getPlayedSources() ?? [];
    });
    expect(playedSources.some((src) => /\/audio\/opening-\d\.mp3$/.test(src))).toBe(true);
    expect(playedSources.some((src) => /\/audio\/checkin-.*\.mp3$/.test(src))).toBe(true);
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
    // One play unlocks the singleton muted; the assertive retry then speaks
    // the opening line through that same element.
    await expect.poll(playCallCount).toBe(3);
  });

  test("tapping the mic unlocks the audio element but never replays Emily, while a later tap still does", async ({
    page,
  }) => {
    await resetStorage(page);
    await mockSpeechApis(page);
    await page.addInitScript(() => {
      (window as unknown as { __playCallCount: number }).__playCallCount = 0;
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        const calls = ++(window as unknown as { __playCallCount: number }).__playCallCount;
        if (calls === 1) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        return originalPlay.apply(this);
      };
    });

    await page.goto(PRACTICE_URL);
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();

    function playCallCount(): Promise<number> {
      return page.evaluate(() => (window as unknown as { __playCallCount: number }).__playCallCount);
    }

    // The on-load attempt happens (and is blocked) exactly once.
    await expect.poll(playCallCount).toBe(1);

    // Tapping the mic silently unlocks the reusable element (the second play
    // call), but it must never also trigger the opening-line fallback replay.
    await startSpeaking(page);
    await expect(page.getByTestId("practice-mic-status")).toHaveText("正在聆听... Listening...");
    // Give any (incorrect) fallback firing a moment to show up before
    // asserting it didn't.
    await page.waitForTimeout(200);
    expect(await playCallCount()).toBe(2);

    // A later, genuinely unrelated tap *while the mic is still listening*
    // still doesn't trigger the fallback — playing Emily's audio through the
    // speaker at this point would collide with the mic exactly the same way
    // (see setMicListening's doc comment) — but it doesn't waste the
    // one-shot retry opportunity either: the listener stays armed rather
    // than firing-and-suppressing.
    await page.getByTestId("emily-message-bubble").click();
    await page.waitForTimeout(200);
    expect(await playCallCount()).toBe(2);

    // Once the mic session ends, that same kind of tap finally triggers it.
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(page.getByTestId("practice-mic-button")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("emily-message-bubble").click();
    await expect.poll(playCallCount).toBe(3);
  });

  // Superseded by ADR-0008 / issue #26: Turn-Taking disables the mic instead
  // of offering barge-in. e2e/issue-26-turn-taking.spec.ts covers the rule.
  test.skip("tapping the mic interrupts Emily's own reply audio instead of letting it keep playing over the recognizer", async ({
    page,
  }) => {
    // Regression coverage: Emily now auto-speaks every reply (not just the
    // opening line — see practice-page-content.tsx), so by the time the
    // learner taps the mic for their next turn, her reply's audio is very
    // often still playing out of the speaker. Left alone, that audio plays
    // back through the same microphone the recognizer just started listening
    // on — the same class of collision commit 5e94690 already fixed once for
    // the opening line specifically, now recurring on every turn. This test
    // asserts practice-input-form.tsx's handleMicClick actually cuts that
    // audio off (via setMicListening(true)'s own cancelSpeech() call) rather
    // than merely not re-triggering it.
    await resetStorage(page);
    await mockSpeechApis(page);
    await page.addInitScript(() => {
      (window as unknown as { __pauseCallCount: number }).__pauseCallCount = 0;
      // Overridden rather than left real: a genuine 4-byte fake MP3 (see the
      // default /api/practice/speak stub in installScriptedPracticeApi)
      // isn't decodable audio, so a real play() would reject/error almost
      // immediately — racy to depend on for "still playing when the mic is
      // tapped". Resolving here and never firing 'ended' keeps the audio
      // reliably "in progress" (per speech-synthesis.ts's own currentAudio
      // bookkeeping) for exactly as long as this test needs it to be.
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        return Promise.resolve();
      };
      const originalPause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
        (window as unknown as { __pauseCallCount: number }).__pauseCallCount += 1;
        return originalPause.apply(this);
      };
    });
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);

    await page.goto(PRACTICE_URL);
    // submitReply drives the always-available text path, switching away
    // from the default mic mode to do so — switch back afterward so the mic
    // button below is the same one a learner would actually tap next.
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).not.toBeEmpty();
    await page.getByTestId("practice-input-mode-toggle").click();

    function pauseCallCount(): Promise<number> {
      return page.evaluate(() => (window as unknown as { __pauseCallCount: number }).__pauseCallCount);
    }

    // Give the reply's autoplay effect a moment to get from "reply landed"
    // through TTS lookup to actually calling play() — the point under test
    // is interrupting audio that's genuinely already under way, not racing
    // its own startup.
    await page.waitForTimeout(300);
    // speak()'s own unconditional cancelSpeech() (called for the opening
    // line's audio when the reply's speak() call starts) already produced at
    // least one pause() by this point — reset the counter so the assertion
    // below can only pass because of the mic click's own cancelSpeech() call.
    await page.evaluate(() => {
      (window as unknown as { __pauseCallCount: number }).__pauseCallCount = 0;
    });

    await startSpeaking(page);
    await expect(page.getByTestId("practice-mic-button")).toHaveAttribute("data-state", "listening");
    expect(await pauseCallCount()).toBeGreaterThan(0);
  });

  test("the restart button clears the conversation and starts over from a fresh opening line", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);

    await page.getByTestId("restart-practice-button").click();

    // Back to the very first step, with no learner turn left over from the
    // discarded conversation.
    await expect(page.getByTestId("practice-step-greeting")).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "upcoming");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);

    // A fresh opening line is shown, defaulting to its Chinese caption
    // collapsed — the same default as every other new AI message.
    await expect(page.getByTestId("emily-message-bubble")).toBeVisible();
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
  });

  test("the replay button synthesizes Emily's reply through the live-TTS route when no pre-generated file matches", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    // Every scripted line now has a pre-generated file (issue #17), so force
    // that tier to fail — the pregenerated <audio> element's own "error"
    // event — to exercise the live-TTS fallback this test targets.
    await page.route("**/audio/**", (route) => route.fulfill({ status: 404 }));
    const speakRequestTexts: string[] = [];
    await page.route("**/api/practice/speak**", async (route) => {
      speakRequestTexts.push(new URL(route.request().url()).searchParams.get("text") ?? "");
      await route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([0, 0, 0, 0]) });
    });

    await page.goto(PRACTICE_URL);
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("practice-step-checkin")).toHaveAttribute("data-state", "current");
    const replyText = await page.getByTestId("emily-message-bubble").innerText();
    expect(CHECKIN_TEXTS).toContain(replyText);

    // The opening line's own playback also falls through the same stubbed
    // 404 to this same route — clear that call before replaying, so the
    // assertion below is about the replay, not the opening line.
    speakRequestTexts.length = 0;

    // With the pre-generated file unavailable (stubbed to 404 above),
    // replaying the line must fall through to the live-TTS route with the
    // exact reply text, not straight to browser synthesis.
    await page.getByTestId("replay-button").click();

    await expect.poll(() => speakRequestTexts.length).toBeGreaterThan(0);
    expect(speakRequestTexts[0]).toEqual(replyText);
  });

  // Superseded by ADR-0008 / issue #26; retained only as historical coverage
  // of the pre-serialization behavior until this suite is next consolidated.
  test.skip("tapping the mic interrupts Emily's live-TTS reply audio even before it's finished loading", async ({
    page,
  }) => {
    // Regression coverage for the *other* ordering of the speaker/mic
    // collision the previous mic test guards. That test covers audio
    // already playing when the mic is tapped. This one covers the opposite,
    // much more common in practice, ordering: the learner reads Emily's
    // reply text (rendered immediately) and taps the mic to respond before
    // her reply's audio (playLiveGeneratedAudio points <audio src> straight
    // at /api/practice/speak; the browser's own fetch of that URL is what's
    // still in flight) has even resolved.
    await resetStorage(page);
    await mockSpeechApis(page);
    // Every scripted line now has a pre-generated file (issue #17); force
    // that tier to fail so playback falls through to the live-TTS route
    // this test is actually exercising.
    await page.route("**/audio/**", (route) => route.fulfill({ status: 404 }));
    await page.addInitScript(() => {
      (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount = 0;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        return Promise.resolve();
      };
      const originalPause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
        if (this.src.includes("/api/practice/speak")) {
          (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount += 1;
        }
        return originalPause.apply(this);
      };
    });
    await installScriptedPracticeApi(
      page,
      [{ goalReport: { greeting: "achieved" } }, { goalReport: { checkin: "achieved" } }],
      { delayMs: 300 },
    );
    await page.route("**/api/practice/speak**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([0, 0, 0, 0]) });
    });

    await page.goto(PRACTICE_URL);
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).not.toBeEmpty();
    await page.getByTestId("practice-input-mode-toggle").click();

    function livePauseCount(): Promise<number> {
      return page.evaluate(() => (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount);
    }

    await page.waitForTimeout(300);
    await page.evaluate(() => {
      (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount = 0;
    });

    await startSpeaking(page);
    await expect(page.getByTestId("practice-mic-button")).toHaveAttribute("data-state", "listening");
    expect(await livePauseCount()).toBeGreaterThan(0);

    // And the mic itself is unaffected by any of this — it's still cleanly
    // able to capture and submit the learner's next turn.
    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("I'm good, thanks", { isFinal: true }));
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("I'm good, thanks");
  });

  test("falls back to browser synthesis when neither a pre-generated file nor the live-TTS route is available", async ({
    page,
  }) => {
    // A minimal fake speechSynthesis, distinct from fixtures.ts's
    // mockSpeechApis, specifically so this test can count how many times it
    // was actually invoked (proving the fallback engaged) rather than just
    // that playback didn't crash. Issue #16: every one of Emily's replies is
    // now a fixed Conversation Script line, so this exercises the same
    // fallback ladder the opening line already relies on. Every scripted
    // line now has a pre-generated file (issue #17), so that tier is
    // stubbed to fail below (404 on the audio file itself) alongside the
    // live-TTS route (stubbed to fail here) so neither can serve it.
    await resetStorage(page);
    await page.route("**/audio/**", (route) => route.fulfill({ status: 404 }));
    await page.addInitScript(() => {
      (window as unknown as { __synthSpeakCount: number }).__synthSpeakCount = 0;
      const fakeSynthesis = {
        speaking: false,
        pending: false,
        paused: false,
        speak(utterance: SpeechSynthesisUtterance) {
          (window as unknown as { __synthSpeakCount: number }).__synthSpeakCount += 1;
          utterance.onend?.(new Event("end") as unknown as SpeechSynthesisEvent);
        },
        cancel() {},
        pause() {},
        resume() {},
        getVoices() {
          return [];
        },
      };
      Object.defineProperty(window, "speechSynthesis", {
        value: fakeSynthesis,
        configurable: true,
        writable: true,
      });
    });
    await installScriptedPracticeApi(page, [{ goalReport: { greeting: "achieved" } }]);
    await page.route("**/api/practice/speak**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );

    await page.goto(PRACTICE_URL);
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).not.toBeEmpty();

    await page.getByTestId("replay-button").click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __synthSpeakCount: number }).__synthSpeakCount), {
        timeout: 10000,
      })
      .toBeGreaterThan(0);
  });
});
