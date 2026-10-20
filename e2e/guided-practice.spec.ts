import { test, expect } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * Guided Practice is a deliberately blank Learning Flow step between Explore
 * and Practice (CONTEXT.md "Guided Practice"). These tests only pin down the
 * chrome around it: stage tag, six dots, and the way in and out.
 */

const GUIDED_PRACTICE_URL = "/guided-practice?debug=1";

test.describe("Guided Practice", () => {
  test("shows the stage tag and six dots with the fourth one current", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    await expect(page.getByRole("heading", { name: "Guided Practice" })).toBeVisible();
    await expect(page.locator('[data-testid^="progress-dot-"]')).toHaveCount(6);
    await expect(page.getByTestId("progress-dot-guided-practice")).toHaveAttribute(
      "data-state",
      "current",
    );
  });

  test("Continue lands on Practice", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/practice(\?|$)/);
  });

  test("Back to Previous Step lands on Explore", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    await page.getByTestId("back-previous").click();
    await expect(page).toHaveURL(/\/explore(\?|$)/);
  });

  test("a learner who finished Explore but not Guided Practice is sent Home from Practice", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "greeting-somebody:progress",
        JSON.stringify({ completed: ["observe", "notice", "explore"] }),
      );
    });
    await page.goto("/practice");
    await expect(page).toHaveURL(/\/$/);
  });
});
