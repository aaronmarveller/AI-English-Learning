import { test, expect, type Page } from "@playwright/test";
import { installControllableSpeechStub, resetStorage, seedProgress } from "./fixtures";
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
  test("shows the stage tag", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);

    await expect(page.getByRole("heading", { name: "Guided Practice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build your response." })).toBeVisible();
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

  test("a learner who finished Explore but not Guided Practice is sent Home from Practice", async ({
    page,
  }) => {
    await resetStorage(page);
    await seedProgress(page, ["observe", "notice", "explore"]);
    await page.goto("/practice");
    await expect(page).toHaveURL(/\/$/);
  });

  // T-011 / T-008 additions.
  function ms(value: string): number {
    const first = value.split(",")[0].trim();
    return first.endsWith("ms") ? parseFloat(first) : parseFloat(first) * 1000;
  }

  test("expression rows use an ARIA checkbox with a green border + checkmark, not a native input", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);
    await page.getByRole("radio", { name: /Coffee Shop/ }).click();

    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    const [first, second] = CORE_EXPRESSIONS;
    const row = page.getByTestId(`guided-expression-${first.id}`);
    const other = page.getByTestId(`guided-expression-${second.id}`);

    await expect(checkbox(page, first.id)).toHaveAttribute("aria-checked", "false");
    await expect(row).toHaveAttribute("data-selected", "false");
    await expect(row).not.toHaveCSS("border-top-color", "rgb(47, 174, 96)");
    await expect(page.getByTestId(`guided-check-${first.id}`)).toHaveText("");

    await checkbox(page, first.id).click();
    await expect(checkbox(page, first.id)).toHaveAttribute("aria-checked", "true");
    await expect(row).toHaveAttribute("data-selected", "true");
    await expect(row).toHaveCSS("border-top-color", "rgb(47, 174, 96)");
    await expect(page.getByTestId(`guided-check-${first.id}`)).toHaveText("✓");
    // Unselected neighbours keep the default border and no checkmark.
    await expect(other).toHaveAttribute("data-selected", "false");
    await expect(other).not.toHaveCSS("border-top-color", "rgb(47, 174, 96)");
    await expect(page.getByTestId(`guided-check-${second.id}`)).toHaveText("");

    const duration = await row.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(ms(duration)).toBeGreaterThanOrEqual(150);
    expect(ms(duration)).toBeLessThanOrEqual(200);
  });

  test("Situation cards keep a green border + checkmark with a 200-250ms transition", async ({ page }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);
    const card = page.getByTestId("situation-coffee-shop");
    await page.getByRole("radio", { name: /Coffee Shop/ }).click();
    await expect(card).toHaveCSS("border-top-color", "rgb(47, 174, 96)");
    await expect(card).toContainText("✓");
    const properties = await card.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(properties).toMatch(/color/);
    const duration = await card.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(ms(duration)).toBeGreaterThanOrEqual(200);
    expect(ms(duration)).toBeLessThanOrEqual(250);
  });

  test("preview keeps formula order; feedback fades in 200-250ms, also on a Situation switch, keeping selections", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(GUIDED_PRACTICE_URL);
    await page.getByRole("radio", { name: /Coffee Shop/ }).click();

    // Select in reverse order; the preview still reads Respond -> Add More -> Ask Back.
    for (const expression of [...CORE_EXPRESSIONS].reverse()) await checkbox(page, expression.id).check();
    const full = ASSEMBLED_RESPONSES.find((r) => r.key === "rab")!;
    await expect(page.getByTestId("your-response")).toHaveText(full.text);
    const preview = await page.getByTestId("your-response").evaluate((el) => getComputedStyle(el).animationDuration);
    expect(ms(preview)).toBeGreaterThanOrEqual(150);
    expect(ms(preview)).toBeLessThanOrEqual(200);

    const feedback = page.getByTestId("guided-feedback");
    const fade = await feedback.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, duration: cs.animationDuration };
    });
    expect(fade.name).toBe("fade-in");
    expect(ms(fade.duration)).toBeGreaterThanOrEqual(200);
    expect(ms(fade.duration)).toBeLessThanOrEqual(250);

    // Situation switch: feedback re-appears with the same 200-250ms fade; selections preserved.
    await page.getByRole("radio", { name: /Neighbor/ }).click();
    await expect(feedback).toContainText(SITUATIONS[1].feedback.rab.zh);
    const switched = await feedback.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(ms(switched)).toBeGreaterThanOrEqual(200);
    expect(ms(switched)).toBeLessThanOrEqual(250);
    for (const expression of CORE_EXPRESSIONS) await expect(checkbox(page, expression.id)).toBeChecked();
  });

  test("playing audio shows the waveform and never changes the selections", async ({ page }) => {
    await resetStorage(page);
    await installControllableSpeechStub(page);
    await page.goto(GUIDED_PRACTICE_URL);
    await page.getByRole("radio", { name: /Coffee Shop/ }).click();
    const [first] = CORE_EXPRESSIONS;
    await checkbox(page, first.id).check();

    const speaker = page.getByTestId("guided-pronounce-response-good-thanks");
    await expect(speaker).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("waveform")).toHaveCount(0);
    await speaker.click();
    await expect(speaker).toHaveAttribute("data-state", "playing");
    await expect(page.getByTestId("waveform")).toBeVisible();
    for (const expression of CORE_EXPRESSIONS) {
      await expect(checkbox(page, expression.id)).toHaveAttribute(
        "aria-checked",
        String(expression.id === first.id),
      );
    }
    await page.evaluate(() => window.__resolveSpeech?.());
    await expect(speaker).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("waveform")).toHaveCount(0);
    await expect(checkbox(page, first.id)).toBeChecked();
  });
});
