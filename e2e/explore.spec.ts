import { test, expect, type Page } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * E2E coverage for the Explore page (ticket 06). Per spec.md's testing
 * philosophy, everything here asserts what a learner could see or do —
 * section expanded/collapsed state via each section's `data-state`
 * attribute, step order via DOM position, and pronunciation playback via
 * PronunciationButton's own `data-state="idle" | "playing"` — never
 * internal React state.
 *
 * Reached via `?debug=1` (see src/lib/debug.ts / the learning layout's
 * guard) since Explore's normal prerequisite is completing Observe, which
 * isn't this ticket's concern to drive through.
 */

const EXPLORE_URL = "/explore?debug=1";

/**
 * A self-contained, controllable `window.speechSynthesis` stub, installed
 * only for the one test below that needs to observe the transient
 * "playing" state deterministically.
 *
 * This is intentionally NOT added to e2e/fixtures.ts's shared
 * `mockSpeechApis`: that helper's existing stub resolves `onend` on a
 * microtask (see e2e/fixtures.ts and the "mockSpeechApis installs a
 * controllable speechSynthesis stub" test in e2e/fixtures.spec.ts, which
 * asserts exactly that auto-resolve behavior) — fine for that fixture's own
 * purpose, but too fast for Playwright to reliably observe an intermediate
 * "playing" attribute before it flips back. Real browser speech synthesis
 * is equally unusable here: headless environments often have no system TTS
 * voices, so `speechSynthesis.speak()` can hang or error unpredictably.
 * Rolling a small local stub here — instead of touching the shared fixture
 * — keeps this ticket's footprint to its own files.
 */
async function installControllableSpeechStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type FakeUtterance = { onstart?: () => void; onend?: () => void };
    let resolveCurrent: (() => void) | null = null;

    const fakeSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak(utterance: FakeUtterance) {
        utterance.onstart?.();
        resolveCurrent = () => utterance.onend?.();
      },
      cancel() {
        resolveCurrent?.();
        resolveCurrent = null;
      },
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

    Object.assign(window, {
      __resolveSpeech: () => {
        resolveCurrent?.();
        resolveCurrent = null;
      },
    });
  });
}

declare global {
  interface Window {
    __resolveSpeech?: () => void;
  }
}

test.describe("Explore page", () => {
  test("defaults to only 打招呼 expanded; the other three sections start collapsed", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await expect(page.getByTestId("section-greeting")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("section-checkin")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("section-response")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("section-closing")).toHaveAttribute("data-state", "collapsed");

    // Greeting's cards are visible...
    await expect(page.getByTestId("expression-card-greeting-hi")).toBeVisible();
    await expect(page.getByTestId("expression-card-greeting-good-morning")).toBeVisible();
    await expect(page.getByTestId("expression-card-greeting-hey-there")).toBeVisible();

    // ...the other three sections' cards/bodies are not.
    await expect(page.getByTestId("section-checkin-body")).not.toBeVisible();
    await expect(page.getByTestId("section-response-body")).not.toBeVisible();
    await expect(page.getByTestId("section-closing-body")).not.toBeVisible();
  });

  test("opening two non-Greeting sections independently expands both without collapsing Greeting or each other", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await page.getByTestId("section-checkin-header").click();
    await page.getByTestId("section-closing-header").click();

    await expect(page.getByTestId("section-greeting")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("section-checkin")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("section-closing")).toHaveAttribute("data-state", "expanded");
    // Untouched section stays collapsed.
    await expect(page.getByTestId("section-response")).toHaveAttribute("data-state", "collapsed");

    await expect(page.getByTestId("section-greeting-body")).toBeVisible();
    await expect(page.getByTestId("section-checkin-body")).toBeVisible();
    await expect(page.getByTestId("section-closing-body")).toBeVisible();
  });

  test("collapsing one open section leaves the others untouched", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await page.getByTestId("section-checkin-header").click();
    await expect(page.getByTestId("section-checkin")).toHaveAttribute("data-state", "expanded");

    // Toggling Check-in back off shouldn't affect Greeting, which was never touched.
    await page.getByTestId("section-checkin-header").click();
    await expect(page.getByTestId("section-checkin")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("section-greeting")).toHaveAttribute("data-state", "expanded");
  });

  test("回应 section shows its three steps in fixed ①②③ order, plus a combo card", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await page.getByTestId("section-response-header").click();
    await expect(page.getByTestId("section-response")).toHaveAttribute("data-state", "expanded");

    await expect(page.getByTestId("response-step-1")).toContainText("Good, thanks!");
    await expect(page.getByTestId("response-step-2")).toContainText("And you?");
    await expect(page.getByTestId("response-step-3")).toContainText(
      "I'm doing pretty good, just heading to work.",
    );

    // Order is fixed in the DOM, not just independently present.
    const stepOrder = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="response-step-"]')).map((el) =>
        el.getAttribute("data-testid"),
      ),
    );
    expect(stepOrder).toEqual(["response-step-1", "response-step-2", "response-step-3"]);

    await expect(page.getByTestId("response-combo")).toBeVisible();
    await expect(page.getByTestId("response-combo")).toContainText(
      "Good, thanks! And you? I'm doing pretty good, just heading to work.",
    );
  });

  test("clicking a pronunciation button triggers playback and is repeatable", async ({ page }) => {
    await resetStorage(page);
    await installControllableSpeechStub(page);
    await page.goto(EXPLORE_URL);

    const button = page.getByTestId("pronounce-greeting-hi");
    await expect(button).toHaveAttribute("data-state", "idle");

    await button.click();
    await expect(button).toHaveAttribute("data-state", "playing");

    // Let the (stubbed) utterance finish.
    await page.evaluate(() => window.__resolveSpeech?.());
    await expect(button).toHaveAttribute("data-state", "idle");

    // Repeatable: clicking again re-triggers playback.
    await button.click();
    await expect(button).toHaveAttribute("data-state", "playing");
    await page.evaluate(() => window.__resolveSpeech?.());
    await expect(button).toHaveAttribute("data-state", "idle");
  });

  test("carousels scroll horizontally within their own bounds without causing page-level horizontal scroll", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(EXPLORE_URL);

    // Expand every section so all three carousels + the ladder are mounted at once.
    await page.getByTestId("section-checkin-header").click();
    await page.getByTestId("section-response-header").click();
    await page.getByTestId("section-closing-header").click();

    for (const testId of ["section-greeting-body", "section-checkin-body", "section-response-body", "section-closing-body"]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test("the Continue button is reachable without opening any other section or playing anything", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await expect(page.getByRole("button", { name: /继续 Continue/ })).toBeVisible();
    await page.getByRole("button", { name: /继续 Continue/ }).click();
    await expect(page).toHaveURL(/\/notice(\?|$)/);
  });
});
