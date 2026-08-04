import { test, expect } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 390, height: 844 }; // ticket 01's check viewport
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe("project scaffold and design system", () => {
  test("home page loads and links to the style guide", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Greeting Somebody" })).toBeVisible();

    await page.getByRole("link", { name: "查看样式基准页" }).click();
    await expect(page).toHaveURL(/\/style-guide$/);
  });

  test("style guide shows the full color palette, type scale, radii and button states", async ({
    page,
  }) => {
    await page.goto("/style-guide");

    const palette = page.getByTestId("color-palette");
    for (const token of [
      "primary",
      "accent",
      "accent-soft",
      "page",
      "card",
      "foreground",
      "muted",
      "border",
    ]) {
      await expect(palette.locator(`[data-token="${token}"]`)).toBeVisible();
    }

    const typeScale = page.getByTestId("type-scale");
    for (const token of [
      "display",
      "h1",
      "h2",
      "h3",
      "body-lg",
      "body",
      "body-sm",
      "caption",
    ]) {
      await expect(typeScale.locator(`[data-token="${token}"]`)).toBeVisible();
    }

    const radii = page.getByTestId("radii");
    await expect(radii.locator('[data-token="radius-card"]')).toBeVisible();
    await expect(radii.locator('[data-token="radius-button"]')).toBeVisible();

    const buttonStates = page.getByTestId("button-states");
    await expect(buttonStates.locator('[data-state="default"]')).toBeEnabled();
    await expect(buttonStates.locator('[data-state="pressed"]')).toBeVisible();
    await expect(buttonStates.locator('[data-state="disabled"]')).toBeDisabled();
  });

  test("design tokens resolve to the expected values", async ({ page }) => {
    await page.goto("/style-guide");

    const bodyStyles = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { backgroundColor: s.backgroundColor, fontFamily: s.fontFamily };
    });
    expect(bodyStyles.backgroundColor).toBe("rgb(251, 247, 239)"); // --color-page
    expect(bodyStyles.fontFamily).toContain("Poppins");
    expect(bodyStyles.fontFamily).toContain("Noto Sans SC");

    const cardRadius = await page
      .locator('[data-token="radius-card"]')
      .evaluate((el) => getComputedStyle(el).borderRadius);
    expect(cardRadius).toBe("20px");

    const buttonRadius = await page
      .locator('[data-token="radius-button"]')
      .evaluate((el) => getComputedStyle(el).borderRadius);
    expect(buttonRadius).toBe("999px");
  });

  for (const [name, viewport] of Object.entries({
    mobile: MOBILE_VIEWPORT,
    desktop: DESKTOP_VIEWPORT,
  })) {
    test(`no horizontal scroll on the phone shell at ${name} viewport`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/style-guide");

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalScroll).toBe(false);
    });
  }

  test("phone shell is full-width on mobile and a centered fixed-width column on desktop", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/");
    const mobileWidth = await page.locator("main").evaluate((el) => el.getBoundingClientRect().width);
    expect(mobileWidth).toBeCloseTo(MOBILE_VIEWPORT.width, 0);

    await page.setViewportSize(DESKTOP_VIEWPORT);
    const desktopBox = await page
      .locator("main")
      .evaluate((el) => el.getBoundingClientRect());
    expect(desktopBox.width).toBeLessThanOrEqual(430);
    // Roughly centered: left/right margins should be close to each other.
    const rightMargin = DESKTOP_VIEWPORT.width - desktopBox.left - desktopBox.width;
    expect(Math.abs(desktopBox.left - rightMargin)).toBeLessThan(20);
  });
});
