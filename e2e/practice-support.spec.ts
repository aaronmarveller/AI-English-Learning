import { test, expect, type Page } from "@playwright/test";
import { installScriptedPracticeApi, mockSpeechApis, PRACTICE_URL, resetStorage, submitReply } from "./fixtures";

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

  test("tapping the mic never doubles as the audio-unlock gesture, but a later tap still does", async ({
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

    // Tapping the mic starts the microphone right then — it must never also
    // trigger the fallback replay, since that would play Emily's audio out
    // of the speaker at the exact moment the mic starts listening (see
    // AUDIO_UNLOCK_EXEMPT_SELECTOR's doc comment in speech-synthesis.ts).
    await page.getByTestId("practice-mic-button").click();
    await expect(page.getByTestId("practice-mic-status")).toHaveText("正在聆听... Listening...");
    // Give any (incorrect) fallback firing a moment to show up before
    // asserting it didn't.
    await page.waitForTimeout(200);
    expect(await playCallCount()).toBe(1);

    // A later, genuinely unrelated tap *while the mic is still listening*
    // still doesn't trigger the fallback — playing Emily's audio through the
    // speaker at this point would collide with the mic exactly the same way
    // (see setMicListening's doc comment) — but it doesn't waste the
    // one-shot retry opportunity either: the listener stays armed rather
    // than firing-and-suppressing.
    await page.getByTestId("emily-message-bubble").click();
    await page.waitForTimeout(200);
    expect(await playCallCount()).toBe(1);

    // Once the mic session ends, that same kind of tap finally triggers it.
    await page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"));
    await expect(page.getByTestId("practice-mic-button")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("emily-message-bubble").click();
    await expect.poll(playCallCount).toBe(2);
  });

  test("tapping the mic interrupts Emily's own reply audio instead of letting it keep playing over the recognizer", async ({
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
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);

    await page.goto(PRACTICE_URL);
    // submitReply drives the always-available text path, switching away
    // from the default mic mode to do so — switch back afterward so the mic
    // button below is the same one a learner would actually tap next.
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await page.getByTestId("practice-input-mode-toggle").click();

    function pauseCallCount(): Promise<number> {
      return page.evaluate(() => (window as unknown as { __pauseCallCount: number }).__pauseCallCount);
    }

    // Give the reply's autoplay effect a moment to get from "reply landed"
    // through the live-TTS fetch to actually calling play() — the point
    // under test is interrupting audio that's genuinely already under way,
    // not racing its own startup.
    await page.waitForTimeout(300);
    // speak()'s own unconditional cancelSpeech() (called for the opening
    // line's audio when the reply's speak() call starts) already produced at
    // least one pause() by this point — reset the counter so the assertion
    // below can only pass because of the mic click's own cancelSpeech() call.
    await page.evaluate(() => {
      (window as unknown as { __pauseCallCount: number }).__pauseCallCount = 0;
    });

    await page.getByTestId("practice-mic-button").click();
    await expect(page.getByTestId("practice-mic-button")).toHaveAttribute("data-state", "listening");
    expect(await pauseCallCount()).toBeGreaterThan(0);
  });

  test("Emily's reply audio never starts once the mic has already begun listening for the next turn", async ({
    page,
  }) => {
    // Regression coverage for the *other* ordering of the same collision the
    // previous test guards. That test covers audio already playing when the
    // mic is tapped (handleMicClick's own cancelSpeech() stops it). This one
    // covers the opposite, and much more common in practice, ordering: the
    // learner reads Emily's reply text (rendered immediately) and taps the
    // mic to respond before her reply's audio (playLiveGeneratedAudio points
    // <audio src> straight at /api/practice/speak; the browser's own fetch
    // of that URL is what's still in flight) has even resolved. At tap time
    // there's nothing yet for cancelSpeech() to *stop*, but play() has
    // already been called synchronously (see playLiveGeneratedAudio) — so
    // what actually protects the mic here is that setMicListening(true)'s
    // cancelSpeech() call pause()s that same, still-loading element, which
    // must happen before the delayed response below ever lets it start
    // producing audible frames. Reported symptom: "只要 Emily 主动说话，麦克风
    // 就收不到；Emily 不说话（需要按重播）时麦克风才正常" — Emily's own autoplay
    // "winning" this race is exactly what breaks the next mic turn, and which
    // side wins is effectively random (network timing vs. how fast the
    // learner reacts).
    await resetStorage(page);
    await mockSpeechApis(page);
    await page.addInitScript(() => {
      (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount = 0;
      // Overridden rather than left real, same reasoning as the previous
      // test: a play() that actually depends on decoding the fake response
      // body below would reject/error on its own, racy to depend on for
      // "still trying to play when the mic is tapped". Resolving
      // unconditionally keeps every <audio> element reliably "in progress"
      // for exactly as long as this test needs it to be.
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        return Promise.resolve();
      };
      const originalPause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
        // The live-generated-reply tier plays straight from
        // /api/practice/speak (see playLiveGeneratedAudio) — distinct from
        // the opening line's static /audio/opening-N.mp3 path — so this
        // counts only a pause() of the reply's own audio, unaffected by the
        // opening line's own unrelated audio lifecycle.
        if (this.src.includes("/api/practice/speak")) {
          (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount += 1;
        }
        return originalPause.apply(this);
      };
    });
    await installScriptedPracticeApi(
      page,
      [
        {
          verdict: "accepted",
          reply_en: "Great, how are you today?",
          reply_zh: "太好了，你今天怎么样？",
          highlight_key: "natural-paraphrase",
        },
        {
          verdict: "accepted",
          reply_en: "Nice! Have a good one.",
          reply_zh: "不错！祝你今天愉快。",
          highlight_key: "natural-paraphrase",
        },
      ],
      // delayMs: without it, the mocked turn route can resolve fast enough
      // that turn 2 fully completes — replacing the transient learner bubble
      // asserted on below with Emily's next line — before that assertion
      // even gets its first poll (see installScriptedPracticeApi's own doc
      // comment; the same race practice-voice.spec.ts's "a second mic turn"
      // test guards against).
      { delayMs: 300 },
    );
    // Overrides installScriptedPracticeApi's own default (immediate)
    // /api/practice/speak stub — registered after it, so it wins (Playwright
    // matches routes in reverse registration order) — with a deliberate
    // delay so there's a real window to tap the mic before this resolves,
    // modeling the real network latency a live TTS call has.
    await page.route("**/api/practice/speak**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([0, 0, 0, 0]) });
    });

    await page.goto(PRACTICE_URL);
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");
    await page.getByTestId("practice-input-mode-toggle").click();

    function livePauseCount(): Promise<number> {
      return page.evaluate(() => (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount);
    }

    // Give the reply's autoplay effect a moment to reach its own play() call
    // (see playLiveGeneratedAudio — synchronous with the effect now, but this
    // mirrors the previous test's own safety margin) before resetting the
    // counter — isolates the assertion below to only the mic tap's own
    // cancelSpeech() call, not speak()'s own unconditional one (already fired
    // once, for the opening line's audio, when this reply's speak() call
    // itself started).
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      (window as unknown as { __livePauseCallCount: number }).__livePauseCallCount = 0;
    });

    // Tap the mic well before the delayed /api/practice/speak response above
    // resolves — the reply's own <audio> element is still waiting on that
    // response at this point, never having produced a single audible frame,
    // so setMicListening(true)'s cancelSpeech() call is the only thing
    // stopping it from ever starting to play once that response lands.
    await page.getByTestId("practice-mic-button").click();
    await expect(page.getByTestId("practice-mic-button")).toHaveAttribute("data-state", "listening");
    expect(await livePauseCount()).toBeGreaterThan(0);

    // And the mic itself is unaffected by any of this — it's still cleanly
    // able to capture and submit the learner's next turn.
    await page.evaluate(() => window.__mockSpeechRecognition?.emitResult("I'm good, thanks", { isFinal: true }));
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("I'm good, thanks");
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

  test("the replay button synthesizes Emily's live reply through the live-TTS route", async ({ page }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    const speakRequestTexts: string[] = [];
    await page.route("**/api/practice/speak**", async (route) => {
      speakRequestTexts.push(new URL(route.request().url()).searchParams.get("text") ?? "");
      await route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([0, 0, 0, 0]) });
    });

    await page.goto(PRACTICE_URL);
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");

    // Emily's reply has no pregenerated file (it's LLM-generated, fresh
    // every turn) — replaying it must go through the live-TTS route with
    // the exact reply text, not straight to browser synthesis.
    await page.getByTestId("replay-button").click();

    await expect.poll(() => speakRequestTexts.length).toBeGreaterThan(0);
    expect(speakRequestTexts[0]).toEqual("Great, how are you today?");
  });

  test("falls back to browser synthesis when the live-TTS route errors", async ({ page }) => {
    await resetStorage(page);
    // A minimal fake speechSynthesis, distinct from fixtures.ts's
    // mockSpeechApis, specifically so this test can count how many times it
    // was actually invoked (proving the fallback engaged) rather than just
    // that playback didn't crash.
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
    await installScriptedPracticeApi(page, [
      {
        verdict: "accepted",
        reply_en: "Great, how are you today?",
        reply_zh: "太好了，你今天怎么样？",
        highlight_key: "natural-paraphrase",
      },
    ]);
    await page.route("**/api/practice/speak**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );

    await page.goto(PRACTICE_URL);
    await submitReply(page, "Hi Emily!");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Great, how are you today?");

    await page.getByTestId("replay-button").click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __synthSpeakCount: number }).__synthSpeakCount))
      .toBeGreaterThan(0);
  });
});
