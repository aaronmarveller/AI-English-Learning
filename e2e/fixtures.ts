import type { Page, Route } from "@playwright/test";

/**
 * Shared E2E helpers (ticket 03).
 *
 * This project's main test seam is a real browser driving the whole app;
 * the only three things ever stubbed are the LLM proxy route's network
 * response, the Web Speech API, and `<audio>` playback (see spec.md
 * "## Testing Decisions" > "### 接缝"). Audio is the third leg of the same
 * speech-I/O boundary:
 * real playback duration and browser autoplay policy are no more
 * deterministic in CI than a real microphone.
 * Everything else — routing, the progress guard, localStorage persistence,
 * and component behavior — runs real code against a real
 * `next build && next start` server.
 */

// --- Storage isolation --------------------------------------------------

/**
 * Clears this origin's localStorage and sessionStorage before every
 * navigation `page` makes from this point on (via an init script, so it
 * re-runs on every full navigation — page.goto(), page.reload() — but not
 * on client-side/SPA route transitions, which don't load a new document).
 *
 * Playwright gives each test a fresh browser context, but that alone
 * doesn't guarantee empty storage for every scenario in this suite (e.g.
 * webServer reuse, or a test that intentionally seeds storage then wants a
 * *real* reload to prove state survives it — see navigation-spine.spec.ts's
 * reload test, which seeds storage manually instead of using this helper
 * for exactly that reason). Call this at the start of any test that cares
 * about a specific progress/debug state.
 */
export async function resetStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

// --- LLM proxy stub (for ticket 08+) ------------------------------------

/**
 * Generic page.route()-based network stub: intercepts requests matching
 * `urlPattern` and fulfills them with `jsonResponse` instead of hitting a
 * real server.
 *
 * Ticket 08 hasn't built the LLM proxy route yet, so there's no real path
 * to point this at today — this helper exists so that ticket's tests can
 * do `mockApiRoute(page, "/api/whatever-ticket-08-calls-it", { verdict: ... })`
 * without inventing their own route-mocking plumbing. This is the pattern
 * tickets 08/09 should reuse for stubbing the LLM proxy route rather than
 * hitting the real Anthropic API in E2E.
 */
export async function mockApiRoute(
  page: Page,
  urlPattern: string | RegExp,
  jsonResponse: unknown,
  options: { status?: number } = {},
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(jsonResponse),
    });
  });
}

// --- Scripted Practice-turn stub (ticket 08; consolidated here by issue
// #10, "收敛 E2E 的 Practice 模型响应 stub 辅助函数") -----------------------

/**
 * The Practice page's debug entry point: `?debug=1` bypasses the normal
 * prerequisite of completing Observe/Explore/Notice first (see
 * src/lib/debug.ts / the learning layout's guard). Every spec that stubs
 * the LLM proxy route to drive a Practice conversation navigates here.
 */
export const PRACTICE_URL = "/practice?debug=1";

/** The LLM proxy route `installScriptedPracticeApi` below stubs. */
export const TURN_ENDPOINT = "**/api/practice/turn";

/**
 * Issue #16: the wire contract shrank to exactly two fields. `reply_en`,
 * `reply_zh`, and `highlight_key` are gone — Emily's line is now picked
 * client-side from the Lesson's fixed Conversation Script pools (see
 * src/content/lesson.ts / src/lib/emily-reply-selector.ts), so a spec can no
 * longer dictate Emily's exact reply text through this stub. Specs that used
 * to assert `emily-message-bubble` against a scripted `reply_en` now assert
 * membership in the relevant pool instead (imported straight from
 * src/content/lesson.ts, so the assertion can never silently drift from the
 * production content it's checking).
 */
export type ScriptedTurnResponse = {
  verdict: "accepted" | "needs_retry";
  /** Defaults to `false` when omitted — most scripted turns don't ask a question back. */
  learner_asked_back?: boolean;
};

/**
 * Stubs the LLM proxy route with a scripted sequence of responses — one per
 * call, saturating on the last entry if more calls arrive than scripted.
 *
 * A step up from this module's generic `mockApiRoute` above (which always
 * fulfills every matching request with the *same* fixed response): a
 * Practice conversation needs different verdicts at different points (a few
 * accepted turns, one needs_retry — including one for off-topic input, which
 * is judged needs_retry rather than a Verdict of its own, issue #15), so the
 * mock has to vary per call.
 *
 * `delayMs` is optional and only needed by tests that assert on the
 * *transient* learner bubble mid-turn: without it, the mocked route
 * resolves fast enough that a turn can fully complete (replacing the
 * learner bubble with Emily's next line) before such an assertion even gets
 * its first poll — a real race, not a flaky test. Tests that only assert
 * the eventual Emily reply don't need it.
 *
 * Ticket 08 introduced this helper for practice-conversation.spec.ts.
 * Tickets 09, 10, and 11 (practice-voice.spec.ts, practice-support.spec.ts,
 * review.spec.ts) each kept their own byte-for-byte copy rather than
 * importing this one, deliberately, per those tickets' own file-ownership
 * boundaries at the time they were written. Now that all four tickets are
 * long since merged, that sequencing constraint no longer applies, and
 * issue #10 consolidated all four copies into this single implementation.
 *
 * Issue #5 made the real route stream Server-Sent Events
 * instead of fulfilling with one plain JSON body (see
 * src/app/api/practice/turn/route.ts's doc comment for the exact wire
 * format this mirrors). This stub wraps each scripted response as that
 * format's single `"final"` event — the same event the client's stream
 * parser treats as authoritative — so this stub keeps exercising the exact
 * client-side parsing code path production traffic does, rather than a
 * special-cased shortcut.
 *
 * Emily now auto-speaks every one of her replies, not just the opening line
 * (see practice-page-content.tsx). Specs install `mockSpeechApis` when they
 * need deterministic playback; its `<audio>` controller replaces the old
 * four-zero-byte `/api/practice/speak` fallback, which produced an `error`
 * rather than a controllable `ended` event. Specs that specifically assert
 * on the speak request can still register their own `page.route` handler.
 */
export async function installScriptedPracticeApi(
  page: Page,
  responses: ScriptedTurnResponse[],
  options: { delayMs?: number } = {},
): Promise<void> {
  let callIndex = 0;
  await page.route(TURN_ENDPOINT, async (route: Route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex += 1;
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    const finalEvent = {
      type: "final",
      verdict: response.verdict,
      learner_asked_back: response.learner_asked_back ?? false,
    };
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify(finalEvent)}\n\n`,
    });
  });
}

// --- Scripted Chinese-explanation stub (issue #19) -----------------------
//
// Issue #12's Testing Decisions section is explicit that this is "a second
// stubbed endpoint... alongside the existing turn endpoint... at the same
// level as the existing stub — it is not a new seam" — so this helper
// lives right here next to `installScriptedPracticeApi`, follows its exact
// shape (page.route + a script, saturating on the last entry), and a spec
// typically calls both together.

/** The Chinese-explanation route (src/app/api/practice/explain/route.ts) this helper stubs. */
export const EXPLAIN_ENDPOINT = "**/api/practice/explain";

/**
 * Stubs the Chinese-explanation route with a scripted sequence of plain
 * JSON responses — one per call, saturating on the last entry, same
 * pattern as `installScriptedPracticeApi`. Pass `{ fail: true }` for an
 * entry to simulate a failed call (a non-2xx status) instead, so a spec can
 * assert the client-side fallback to the canned four-part text (issue #19
 * acceptance criterion 5).
 */
export async function installScriptedChineseExplanationApi(
  page: Page,
  responses: ({ answerZh: string } | { fail: true })[],
): Promise<void> {
  let callIndex = 0;
  await page.route(EXPLAIN_ENDPOINT, async (route: Route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex += 1;
    if ("fail" in response) {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "upstream_error" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answerZh: response.answerZh }),
    });
  });
}

/**
 * Submits `text` as the learner's reply through the text-input path: makes
 * sure the (always-available) text input is the active input mode —
 * switching to it via the mode toggle if voice is currently active, since
 * ticket 09 made voice the Practice page's default input mode — then fills
 * it and clicks send. Idempotent across repeated calls in the same test.
 *
 * Consolidated by issue #10 from the identical copies previously kept in
 * practice-conversation.spec.ts and practice-support.spec.ts.
 * practice-voice.spec.ts drives voice input instead and has no use for this.
 */
export async function submitReply(page: Page, text: string): Promise<void> {
  const textInput = page.getByTestId("practice-text-input");
  if (!(await textInput.isVisible())) {
    await page.getByTestId("practice-input-mode-toggle").click();
  }
  await textInput.fill(text);
  await page.getByTestId("practice-send-button").click();
}

// --- Web Speech API stub (for ticket 08/09+) ----------------------------

type MockRecognitionResultOptions = {
  isFinal?: boolean;
  confidence?: number;
};

/** Controller exposed as `window.__mockAudio` for E2E audio playback. */
export type MockAudioController = {
  /** Sources whose `play()` calls successfully entered playback. */
  getPlayedSources: () => string[];
  /** Dispatches `ended` on the currently playing element. */
  endCurrent: () => void;
  /** Dispatches `error` on the currently playing element. */
  failCurrent: () => void;
  /** Whether the most recently played element was unlocked by a user gesture. */
  isUnlocked: () => boolean;
  /** Makes the next authorized `play()` remain pending without starting. */
  stallNext: () => void;
};

/**
 * The controller ticket 08/09 tests use (via `page.evaluate`) to drive
 * recognition output on demand, once the app under test has called
 * `.start()` on a SpeechRecognition instance. Exposed on the page as
 * `window.__mockSpeechRecognition`.
 */
type MockSpeechRecognitionController = {
  emitResult: (transcript: string, options?: MockRecognitionResultOptions) => void;
  emitError: (error: string) => void;
  emitEnd: () => void;
  /** Makes an already-ended recognizer reject a redundant `stop()`, matching strict WebKit behavior. */
  rejectRedundantStops: () => void;
  /**
   * The `lang` the most recently started recognizer instance was
   * configured with, or `null` if none has started yet (issue #19: "the
   * speech mock exposes the recogniser's configured language so a test can
   * assert it switches to Chinese in help mode and back to English outside
   * it"). Reflects whichever instance last called `start()` — src/lib/speech-recognition.ts's
   * `startListening` sets `.lang` before calling `.start()`, so by the time
   * `onstart`/the "start" event fires this is always current.
   */
  getLang: () => string | null;
};

declare global {
  interface Window {
    __mockAudio?: MockAudioController;
    __mockSpeechRecognition?: MockSpeechRecognitionController;
  }
}

/**
 * Installs a scriptable stub for the Web Speech API in place of the real
 * (microphone- and network-dependent, non-deterministic) implementation —
 * this is the seam ticket 08/09's Practice-page speech I/O tests should
 * build on instead of driving a real microphone in CI.
 *
 * Installs via page.addInitScript() so the stub exists before any app code
 * runs (must be called before page.goto()).
 *
 * - `window.SpeechRecognition` / `window.webkitSpeechRecognition`: a fake
 *   constructor. Instances support `start()`/`stop()`/`abort()` and both
 *   consumption styles real code uses — the `onresult`/`onerror`/`onend`/
 *   `onstart` property-callback pattern, and `addEventListener("result" |
 *   "error" | "end" | "start", ...)`.
 *
 *   Test code drives output through `window.__mockSpeechRecognition`
 *   (typed via the `MockSpeechRecognitionController` type this module
 *   exports), called from `page.evaluate()` *after* the app has started
 *   recognition:
 *     - `page.evaluate(() => window.__mockSpeechRecognition?.emitResult("hello", { isFinal: true }))`
 *     - `page.evaluate(() => window.__mockSpeechRecognition?.emitError("no-speech"))`
 *
 * - `<audio>` playback: a controllable fake that models iOS's per-element
 *   user-gesture unlock rule. A locked element rejects programmatic play;
 *   once a play happens in a user-activation stack, that element remains
 *   unlocked. Tests inspect successful sources and finish/fail the current
 *   playback through `window.__mockAudio`.
 *
 * - `window.speechSynthesis`: a fake whose `speak(utterance)` immediately
 *   fires the utterance's `onstart` then (on a microtask) `onend` instead
 *   of producing audio, and whose `getVoices()` returns a small fixed
 *   voice list.
 */
export async function mockSpeechApis(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const unlockedAudio = new WeakSet<HTMLMediaElement>();
    const playedSources: string[] = [];
    let currentAudio: HTMLMediaElement | null = null;
    let lastAudio: HTMLMediaElement | null = null;
    let shouldStallNext = false;

    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      // The controller needs to retain the exact element whose prototype
      // method was invoked so later page.evaluate calls can drive it.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastAudio = this;
      if (navigator.userActivation.isActive) unlockedAudio.add(this);
      if (!unlockedAudio.has(this)) {
        return Promise.reject(new DOMException("Playback requires a user gesture", "NotAllowedError"));
      }

      if (shouldStallNext) {
        shouldStallNext = false;
        return new Promise(() => {});
      }

      playedSources.push(this.src);
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      currentAudio = this;
      return Promise.resolve();
    };

    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      if (currentAudio === this) currentAudio = null;
    };

    const audioController: MockAudioController = {
      getPlayedSources() {
        return [...playedSources];
      },
      endCurrent() {
        const target = currentAudio;
        if (!target) return;
        currentAudio = null;
        target.dispatchEvent(new Event("ended"));
      },
      failCurrent() {
        const target = currentAudio;
        if (!target) return;
        currentAudio = null;
        target.dispatchEvent(new Event("error"));
      },
      isUnlocked() {
        return lastAudio ? unlockedAudio.has(lastAudio) : false;
      },
      stallNext() {
        shouldStallNext = true;
      },
    };

    window.__mockAudio = audioController;

    let shouldRejectRedundantStops = false;

    class MockSpeechRecognition extends EventTarget {
      lang = "en-US";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: (() => void) | null = null;
      // Whether this instance still (from the mock's point of view) holds
      // the microphone — false from start() until stop()/abort() releases
      // it. Models a real constraint this stub used to ignore entirely: a
      // session that's never explicitly stopped still holds the microphone,
      // so a different instance starting on top of it fails (see start()
      // below). This is what let real-world "mic only ever captures the
      // first turn" bugs slip past this suite — src/lib/speech-recognition.ts's
      // startListening now stops the recognizer itself as soon as a final
      // result lands instead of trusting continuous=false's own
      // (implementation-variable-timing) auto-stop.
      stopped = true;

      start() {
        if (activeRecognition && activeRecognition !== this && !activeRecognition.stopped) {
          // Simulates the microphone still being held by a prior session
          // that was never stopped — silently, via a non-fallback-triggering
          // error (see practice-input-form.tsx's FallbackTrigger — "aborted"
          // just resets the mic to idle, it doesn't switch to text input),
          // matching the reported symptom of the mic quietly doing nothing
          // on later turns rather than visibly explaining itself. An arrow
          // function here (not a `this`-aliasing local) picks up `start()`'s
          // own `this` lexically.
          queueMicrotask(() => {
            const event = Object.assign(new Event("error"), { error: "aborted" });
            this.onerror?.(event);
            this.dispatchEvent(event);
          });
          return;
        }
        // The module-level controller (emitResult/emitError/emitEnd) needs
        // a reference to whichever instance the app under test last started.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        activeRecognition = this;
        this.stopped = false;
        this.onstart?.();
        this.dispatchEvent(new Event("start"));
      }

      stop() {
        if (this.stopped) {
          if (shouldRejectRedundantStops) {
            throw new DOMException("Recognition has already ended", "InvalidStateError");
          }
          return;
        }
        this.stopped = true;
        if (activeRecognition === this) activeRecognition = null;
        this.onend?.();
        this.dispatchEvent(new Event("end"));
      }

      abort() {
        this.stop();
      }
    }

    let activeRecognition: MockSpeechRecognition | null = null;

    const controller: Window["__mockSpeechRecognition"] = {
      emitResult(transcript, options = {}) {
        // Snapshotting into a local avoids a reentrancy hazard: a handler
        // this synchronously invokes (onresult below) may itself call
        // stop() on the very same instance, which nulls the module-level
        // `activeRecognition` — reading that shared variable again for the
        // dispatchEvent call below would then throw instead of finishing
        // this dispatch.
        const target = activeRecognition;
        if (!target) return;
        const alternative = { transcript, confidence: options.confidence ?? 0.9 };
        const result = Object.assign([alternative], { isFinal: options.isFinal ?? true });
        const event = Object.assign(new Event("result"), {
          results: Object.assign([result], { length: 1 }),
          resultIndex: 0,
        });
        target.onresult?.(event);
        target.dispatchEvent(event);
      },
      emitError(error) {
        const target = activeRecognition;
        if (!target) return;
        const event = Object.assign(new Event("error"), { error });
        target.onerror?.(event);
        target.dispatchEvent(event);
      },
      emitEnd() {
        activeRecognition?.stop();
      },
      rejectRedundantStops() {
        shouldRejectRedundantStops = true;
      },
      getLang() {
        return activeRecognition?.lang ?? null;
      },
    };

    Object.assign(window, {
      SpeechRecognition: MockSpeechRecognition,
      webkitSpeechRecognition: MockSpeechRecognition,
      __mockSpeechRecognition: controller,
    });

    const fakeVoices = [
      { name: "Mock US English", lang: "en-US", default: true },
      { name: "Mock US English (female)", lang: "en-US", default: false },
    ];

    type FakeUtterance = { text?: string; onstart?: () => void; onend?: () => void };

    const fakeSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak(utterance: FakeUtterance) {
        utterance.onstart?.();
        Promise.resolve().then(() => utterance.onend?.());
      },
      cancel() {},
      pause() {},
      resume() {},
      getVoices() {
        return fakeVoices;
      },
    };

    // speechSynthesis is a readonly Window property in lib.dom.d.ts;
    // defineProperty bypasses that so the fake can replace it.
    Object.defineProperty(window, "speechSynthesis", {
      value: fakeSynthesis,
      configurable: true,
      writable: true,
    });
  });
}
