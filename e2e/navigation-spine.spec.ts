import { test, expect, type Page } from "@playwright/test";
import {
  hangUp,
  installFakeCall,
  learnerSpeaks,
  resetStorage,
  resetStorageOnce,
  seedProgress,
  startCallAndGreet,
} from "./fixtures";

/**
 * The nav spine (route guard, progress dots, debug bypass, hydration-safe
 * reload) as a learner or tester sees it in a browser: the URL, visible
 * heading text, and a progress dot's `data-state`. Step order, unlocking and
 * Back targets are unit-tested in src/lib/learning-flow.test.ts; this file
 * must not import that module, so every step and URL below is a literal.
 */

const HOME_URL = /\/$/;

type DotState = "done" | "current" | "upcoming";

const STEPS: Array<{ id: string; url: string; dots: DotState[] }> = [
  { id: "observe", url: "/observe", dots: ["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"] },
  { id: "notice", url: "/notice", dots: ["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"] },
  { id: "explore", url: "/explore", dots: ["done", "done", "current", "upcoming", "upcoming", "upcoming"] },
  { id: "guided-practice", url: "/guided-practice", dots: ["done", "done", "done", "current", "upcoming", "upcoming"] },
  { id: "practice", url: "/practice", dots: ["done", "done", "done", "done", "current", "upcoming"] },
  { id: "review", url: "/review", dots: ["done", "done", "done", "done", "done", "current"] },
];

async function expectDots(page: Page, dots: DotState[]): Promise<void> {
  for (const [i, state] of dots.entries()) {
    await expect(page.getByTestId(`progress-dot-${STEPS[i].id}`)).toHaveAttribute("data-state", state);
  }
}

/**
 * Advances past the Practice page. Unlike every other step, Practice has no
 * simple "Continue" button — its primary action ("查看学习总结") only unlocks
 * once a Call has ended in which the learner said something in English or
 * Chinese. This makes one short Call (the Realtime connection is faked by the
 * test, before navigating), hangs up, then clicks View Summary — the
 * walkthrough's equivalent of "click Continue" for this one step.
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
    await page.goto("/observe");

    for (const step of STEPS) {
      await expect(page).toHaveURL(new RegExp(`${step.url}$`));
      await expectDots(page, step.dots);

      if (step.id === "practice") {
        await completePractice(page);
        continue;
      }

      // Scoped by name rather than an unscoped role query: real pages
      // legitimately have more than one <button>, and an unscoped
      // getByRole("button") throws a strict-mode violation. Every
      // ContinueButton's label contains the English word "Continue".
      await page.getByRole("button", { name: /Continue/ }).click();
    }

    // Review's Continue is the single-lesson MVP's "next lesson" placeholder.
    await expect(page).toHaveURL(/\/coming-soon$/);
    await expect(page.getByRole("heading", { name: "Coming Soon" })).toBeVisible();
  });

  test("direct navigation to a step whose prerequisite isn't complete redirects to Home", async ({
    page,
  }) => {
    await resetStorage(page);

    // Every step but observe has an unmet prerequisite on fresh storage.
    for (const step of STEPS.slice(1)) {
      await page.goto(step.url);
      await expect(page).toHaveURL(HOME_URL);
    }
  });

  test("?debug=1 reaches any step directly, even with zero progress, and the dots follow position", async ({
    page,
  }) => {
    await resetStorage(page);

    for (const step of STEPS) {
      await page.goto(`${step.url}?debug=1`);

      // Not redirected: still on the requested step.
      await expect(page).toHaveURL(new RegExp(`${step.url}(\\?|$)`));
      await expectDots(page, step.dots);
      await expect(page.getByTestId("debug-jump-bar")).toBeVisible();
    }
  });

  test("reloading mid-flow keeps you on the same step instead of bouncing to Home", async ({ page }) => {
    // Regression case: a hard reload while mid-flow could bounce to Home
    // because the guard's redirect effect could fire before the
    // localStorage-backed progress snapshot had hydrated (see the
    // `hasMounted` comment in src/app/(learning)/layout.tsx). Storage is
    // cleared only on the first document so the real reload keeps progress.
    await resetStorageOnce(page);
    await seedProgress(page, ["observe"]);

    await page.goto("/notice");
    await expect(page).toHaveURL(/\/notice$/);

    await page.reload();

    await expect(page).toHaveURL(/\/notice$/);
    await expect(page.getByRole("heading", { name: "Notice" })).toBeVisible();
  });

  test("clicking Back to Previous Step on Explore lands on Notice and leaves progress unchanged", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/explore?debug=1");

    await page.getByTestId("back-previous").click();
    await expect(page).toHaveURL(/\/notice(\?|$)/);

    // Nothing was marked complete: the dots follow position only.
    await expectDots(page, ["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });
});
