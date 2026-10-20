import { test, expect, type Page } from "@playwright/test";
import { resetStorage } from "./fixtures";
import { ASSEMBLED_RESPONSES, CORE_EXPRESSIONS, SITUATIONS, YOUR_RESPONSE_EMPTY } from "../src/content/guided-practice";

/**
 * Guided Practice (CONTEXT.md "Guided Practice"): pick a Situation, tick any
 * of the three core expressions, and read the assembled reply plus feedback
 * for that Situation. Feedback copy comes straight from the content module,
 * so these tests pin the wiring, not the wording.
 */

const GUIDED_PRACTICE_URL = "/guided-practice?debug=1";

const ROLE_LETTER = { respond: "r", "add-more": "a", "ask-back": "b" } as const;

function checkbox(page: Page, expressionId: string) {
  return page.getByTestId(`guided-expression-${expressionId}`).getByRole("checkbox");
}

test.describe("Guided Practice", () => {
  test("shows the stage tag and six dots with the fourth one current", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    await expect(page.getByRole("heading", { name: "Guided Practice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build your response." })).toBeVisible();
    await expect(page.locator('[data-testid^="progress-dot-"]')).toHaveCount(6);
    await expect(page.getByTestId("progress-dot-guided-practice")).toHaveAttribute(
      "data-state",
      "current",
    );
  });

  test("starts with nothing picked: expressions and all audio disabled, empty response, no feedback", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    for (const situation of SITUATIONS) {
      await expect(page.getByRole("radio", { name: new RegExp(situation.name) })).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(page.getByTestId(`guided-pronounce-greeting-${situation.id}`)).toBeDisabled();
    }
    for (const expression of CORE_EXPRESSIONS) {
      await expect(checkbox(page, expression.id)).toBeDisabled();
      await expect(page.getByTestId(`guided-pronounce-${expression.id}`)).toBeDisabled();
    }
    await expect(page.getByTestId("your-response")).toHaveText(YOUR_RESPONSE_EMPTY);
    await expect(page.getByTestId("guided-pronounce-response")).toBeDisabled();
    await expect(page.getByTestId("guided-feedback")).toHaveCount(0);
  });

  test("picking a Situation enables only its greeting audio and every expression's audio", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    await page.getByRole("radio", { name: /Coffee Shop/ }).click();

    await expect(page.getByTestId("guided-pronounce-greeting-coffee-shop")).toBeEnabled();
    await expect(page.getByTestId("guided-pronounce-greeting-neighbor")).toBeDisabled();
    for (const expression of CORE_EXPRESSIONS) {
      await expect(checkbox(page, expression.id)).toBeEnabled();
      await expect(page.getByTestId(`guided-pronounce-${expression.id}`)).toBeEnabled();
    }
    await expect(page.getByTestId("guided-pronounce-response")).toBeDisabled();
    await expect(page.getByTestId("guided-feedback")).toHaveCount(0);
  });

  for (const situation of SITUATIONS) {
    test(`${situation.name}: every selection shows its assembled reply and feedback`, async ({ page }) => {
      await resetStorage(page);
      await page.goto(GUIDED_PRACTICE_URL);
      await page.getByRole("radio", { name: new RegExp(situation.name) }).click();

      for (const { key, text } of ASSEMBLED_RESPONSES) {
        for (const expression of CORE_EXPRESSIONS) {
          await checkbox(page, expression.id).setChecked(key.includes(ROLE_LETTER[expression.role]));
        }
        await expect(page.getByTestId("your-response")).toHaveText(text);
        await expect(page.getByTestId("guided-pronounce-response")).toBeEnabled();
        await expect(page.getByTestId("guided-feedback")).toContainText(situation.feedback[key].en);
        await expect(page.getByTestId("guided-feedback")).toContainText(situation.feedback[key].zh);
      }
    });
  }

  test("switching Situation keeps the ticked expressions and updates the feedback", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    const [coffeeShop, neighbor] = SITUATIONS;
    await page.getByRole("radio", { name: /Coffee Shop/ }).click();
    for (const expression of CORE_EXPRESSIONS) await checkbox(page, expression.id).check();
    await expect(page.getByTestId("guided-feedback")).toContainText(coffeeShop.feedback.rab.zh);

    await page.getByRole("radio", { name: /Neighbor/ }).click();
    for (const expression of CORE_EXPRESSIONS) await expect(checkbox(page, expression.id)).toBeChecked();
    await expect(page.getByTestId("guided-feedback")).toContainText(neighbor.feedback.rab.zh);
    await expect(page.getByTestId("guided-pronounce-greeting-coffee-shop")).toBeDisabled();
    await expect(page.getByTestId("guided-pronounce-greeting-neighbor")).toBeEnabled();
  });

  test("Continue lands on Practice without doing the exercise", async ({ page }) => {
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
