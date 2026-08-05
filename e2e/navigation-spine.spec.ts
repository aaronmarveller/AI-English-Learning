import { test, expect, type Page } from "@playwright/test";
import { installScriptedPracticeApi, resetStorage } from "./fixtures";
import { STEP_IDS, STEP_ROUTES, type StepId } from "@/lib/progress";

/**
 * Ticket 02's nav spine (route guard, progress dots, debug bypass,
 * hydration-safe reload) shipped untested — writing its formal coverage
 * was ticket 03's job. Per spec.md's testing philosophy, every assertion
 * here is something a learner or tester could observe directly: the URL,
 * visible heading text, and a progress dot's `data-state`. Nothing reaches
 * into the progress/debug stores or counts function calls.
 */

const HOME_URL = /\/$/;

function expectedDotState(dotStep: StepId, currentStep: StepId): "current" | "completed" | "upcoming" {
  if (dotStep === currentStep) return "current";
  return STEP_IDS.indexOf(dotStep) < STEP_IDS.indexOf(currentStep) ? "completed" : "upcoming";
}

/**
 * Advances past the Practice page's real conversation core (ticket 08).
 * Unlike every other step, Practice has no simple "Continue" button —
 * its primary action ("查看学习总结") only unlocks once its own inner
 * 4-step Greeting→Check-in→Response→Closing conversation completes. This
 * stubs the LLM proxy route to always accept, drives all 4 turns, then
 * clicks View Summary — the walkthrough's equivalent of "click Continue"
 * for this one step.
 *
 * Uses the shared `installScriptedPracticeApi` stub (e2e/fixtures.ts)
 * rather than its own inline `page.route` (as this predates issue #10's
 * consolidation of the other four Practice-adjacent spec files) so this
 * walkthrough stays in sync with the real route's wire format automatically
 * — see that helper's doc comment for why (issue #5).
 */
async function completePracticeConversation(page: Page): Promise<void> {
  await installScriptedPracticeApi(page, [
    {
      verdict: "accepted",
      reply_en: "Great!",
      reply_zh: "太好了！",
      highlight_key: "used-whitelist-phrase",
    },
  ]);

  // Ticket 09 made the microphone the default input mode; this walkthrough
  // isn't concerned with voice, so it switches to the (always-available)
  // text fallback once and then drives the conversation exactly as before.
  await page.getByTestId("practice-input-mode-toggle").click();

  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId("practice-text-input")).toBeEnabled();
    await page.getByTestId("practice-text-input").fill("Hi there!");
    await page.getByTestId("practice-send-button").click();
  }

  const viewSummaryButton = page.getByTestId("view-summary-button");
  await expect(viewSummaryButton).toBeEnabled();
  await viewSummaryButton.click();
}

test.describe("navigation spine", () => {
  test("walking the flow via each page's primary button advances the route and progress dots in order", async ({
    page,
  }) => {
    await resetStorage(page);
    // observe has no prerequisite, so it's the flow's real entry point
    // today (Home's own "Start Lesson" card lands in ticket 04).
    await page.goto(STEP_ROUTES.observe);

    for (const step of STEP_IDS) {
      await expect(page).toHaveURL(new RegExp(`${STEP_ROUTES[step]}$`));

      for (const dotStep of STEP_IDS) {
        await expect(page.getByTestId(`progress-dot-${dotStep}`)).toHaveAttribute(
          "data-state",
          expectedDotState(dotStep, step),
        );
      }

      if (step === "practice") {
        await completePracticeConversation(page);
        continue;
      }

      // Scoped by name rather than an unscoped role query: real pages
      // legitimately have more than one <button> (section toggles,
      // pronunciation controls, etc.), and an unscoped getByRole("button")
      // throws a Playwright strict-mode violation the moment a page has
      // more than one. Every ContinueButton's label contains the English
      // word "Continue" even though the Chinese half varies by page
      // (Review's placeholder says "继续下一课 Continue", others say
      // "继续 Continue") — match on that shared substring.
      await page.getByRole("button", { name: /Continue/ }).click();
    }

    // Review's Continue is the flow's 6th stop: the single-lesson MVP's
    // "next lesson" placeholder (spec.md Out of Scope: only one lesson
    // exists, everything past it is Coming Soon).
    await expect(page).toHaveURL(/\/coming-soon$/);
    await expect(page.getByRole("heading", { name: "Coming Soon" })).toBeVisible();
  });

  test("direct navigation to a step whose prerequisite isn't complete redirects to Home", async ({
    page,
  }) => {
    await resetStorage(page);

    // Every step but observe has an unmet prerequisite on fresh storage.
    for (const step of STEP_IDS.slice(1)) {
      await page.goto(STEP_ROUTES[step]);
      await expect(page).toHaveURL(HOME_URL);
    }
  });

  test("?debug=1 reaches any step directly, even with zero progress", async ({ page }) => {
    await resetStorage(page);

    for (const step of STEP_IDS) {
      await page.goto(`${STEP_ROUTES[step]}?debug=1`);

      // Not redirected: still on the requested step.
      await expect(page).toHaveURL(new RegExp(`${STEP_ROUTES[step]}(\\?|$)`));
      await expect(page.getByTestId(`progress-dot-${step}`)).toHaveAttribute("data-state", "current");
      await expect(page.getByTestId("debug-jump-bar")).toBeVisible();
    }
  });

  test("reloading mid-flow keeps you on the same step instead of bouncing to Home", async ({ page }) => {
    // This is the regression case ticket 02 had to fix: a hard reload
    // while mid-flow could bounce to Home because the guard's redirect
    // effect could fire before the localStorage-backed progress snapshot
    // had hydrated (see the `hasMounted` comment in
    // src/app/(learning)/layout.tsx). Seed progress directly here rather
    // than via resetStorage()'s addInitScript — that init script re-runs
    // on the real reload below and would wipe the very state we're
    // checking survives it.
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(
        "greeting-somebody:progress",
        JSON.stringify({ completed: ["observe"] }),
      );
    });

    await page.goto(STEP_ROUTES.explore);
    await expect(page).toHaveURL(new RegExp(`${STEP_ROUTES.explore}$`));

    await page.reload();

    await expect(page).toHaveURL(new RegExp(`${STEP_ROUTES.explore}$`));
    await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  });
});
