import { test, expect, type Page } from "@playwright/test";
import { hangUp, installFakeCall, learnerSpeaks, resetStorage, startCallAndGreet } from "./fixtures";

/**
 * Ticket 02's nav spine (route guard, progress dots, debug bypass,
 * hydration-safe reload) shipped untested — writing its formal coverage
 * was ticket 03's job. Per spec.md's testing philosophy, every assertion
 * here is something a learner or tester could observe directly: the URL,
 * visible heading text, and a progress dot's `data-state`. Nothing reaches
 * into the progress/debug stores or counts function calls.
 */

const HOME_URL = /\/$/;

const STEP_IDS = ["observe", "notice", "explore", "guided-practice", "practice", "review"] as const;
type StepId = (typeof STEP_IDS)[number];
const STEP_ROUTES = Object.fromEntries(STEP_IDS.map((step) => [step, `/${step}`])) as Record<StepId, string>;

function expectedDotState(dotStep: StepId, currentStep: StepId): "current" | "completed" | "upcoming" {
  if (dotStep === currentStep) return "current";
  return STEP_IDS.indexOf(dotStep) < STEP_IDS.indexOf(currentStep) ? "completed" : "upcoming";
}

/**
 * Advances past the Practice page. Unlike every other step, Practice has no
 * simple "Continue" button — its primary action ("查看学习总结") only unlocks
 * once a Call has ended in which the learner said something in English or
 * Chinese. This makes one short Call (the Realtime connection is faked by the
 * test, before navigating), hangs up,
 * then clicks View Summary — the walkthrough's equivalent of "click Continue"
 * for this one step.
 */
async function completePractice(page: Page): Promise<void> {
  await startCallAndGreet(page);
  await learnerSpeaks(page, "u1", "Hi there!");
  await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hi there!");
  await hangUp(page);

  const viewSummaryButton = page.getByTestId("view-summary-button");
  await expect(viewSummaryButton).toBeEnabled();
  await viewSummaryButton.click();
}

test.describe("navigation spine", () => {
  test("walking the flow via each page's primary button advances the route and progress dots in order", async ({
    page,
  }) => {
    await resetStorage(page);
    await installFakeCall(page);
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
        await completePractice(page);
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

    await page.goto(STEP_ROUTES.notice);
    await expect(page).toHaveURL(new RegExp(`${STEP_ROUTES.notice}$`));

    await page.reload();

    await expect(page).toHaveURL(new RegExp(`${STEP_ROUTES.notice}$`));
    await expect(page.getByRole("heading", { name: "Notice" })).toBeVisible();
  });

  test("the flow order is observe, notice, explore, guided-practice, practice, review", async () => {
    expect([...STEP_IDS]).toEqual([
      "observe",
      "notice",
      "explore",
      "guided-practice",
      "practice",
      "review",
    ]);
  });

  test("notice, explore, practice and review show Back to Previous Step linking to the previous step", async ({
    page,
  }) => {
    await resetStorage(page);

    for (const step of STEP_IDS.slice(1)) {
      await page.goto(`${STEP_ROUTES[step]}?debug=1`);
      const back = page.getByTestId("back-previous");
      await expect(back).toHaveText(/Back to Previous Step/);
      await expect(back).toHaveAttribute("aria-label", "返回上一步");
      await expect(back).toHaveAttribute(
        "href",
        STEP_ROUTES[STEP_IDS[STEP_IDS.indexOf(step) - 1]],
      );
      await expect(page.getByTestId("back-home")).toHaveCount(0);
    }
  });

  test("observe shows Back to Home and no Back to Previous Step", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    await expect(page.getByTestId("back-home")).toHaveAttribute("href", "/");
    await expect(page.getByTestId("back-previous")).toHaveCount(0);
  });

  test("clicking Back to Previous Step on Explore lands on Notice and leaves progress unchanged", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/explore?debug=1");

    await page.getByTestId("back-previous").click();
    await expect(page).toHaveURL(/\/notice(\?|$)/);

    // Nothing was marked complete: only the current dot is distinguished.
    for (const step of STEP_IDS) {
      await expect(page.getByTestId(`progress-dot-${step}`)).toHaveAttribute(
        "data-state",
        step === "notice" ? "current" : "upcoming",
      );
    }
  });
});
