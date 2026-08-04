import type { Page } from "@playwright/test";

/**
 * Shared E2E helpers (ticket 03).
 *
 * This project's main test seam is a real browser driving the whole app;
 * the only two things ever stubbed are the LLM proxy route's network
 * response and the Web Speech API (see spec.md "## Testing Decisions" >
 * "### 接缝"). Everything else — routing, the progress guard, localStorage
 * persistence, component behavior — runs real code against a real
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

// --- Web Speech API stub (for ticket 08/09+) ----------------------------

type MockRecognitionResultOptions = {
  isFinal?: boolean;
  confidence?: number;
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
};

declare global {
  interface Window {
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
 * - `window.speechSynthesis`: a fake whose `speak(utterance)` immediately
 *   fires the utterance's `onstart` then (on a microtask) `onend` instead
 *   of producing audio, and whose `getVoices()` returns a small fixed
 *   voice list.
 */
export async function mockSpeechApis(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class MockSpeechRecognition extends EventTarget {
      lang = "en-US";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        // The module-level controller (emitResult/emitError/emitEnd) needs
        // a reference to whichever instance the app under test last started.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        activeRecognition = this;
        this.onstart?.();
        this.dispatchEvent(new Event("start"));
      }

      stop() {
        this.onend?.();
        this.dispatchEvent(new Event("end"));
        if (activeRecognition === this) activeRecognition = null;
      }

      abort() {
        this.stop();
      }
    }

    let activeRecognition: MockSpeechRecognition | null = null;

    const controller: Window["__mockSpeechRecognition"] = {
      emitResult(transcript, options = {}) {
        if (!activeRecognition) return;
        const alternative = { transcript, confidence: options.confidence ?? 0.9 };
        const result = Object.assign([alternative], { isFinal: options.isFinal ?? true });
        const event = Object.assign(new Event("result"), {
          results: Object.assign([result], { length: 1 }),
          resultIndex: 0,
        });
        activeRecognition.onresult?.(event);
        activeRecognition.dispatchEvent(event);
      },
      emitError(error) {
        if (!activeRecognition) return;
        const event = Object.assign(new Event("error"), { error });
        activeRecognition.onerror?.(event);
        activeRecognition.dispatchEvent(event);
      },
      emitEnd() {
        activeRecognition?.stop();
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
