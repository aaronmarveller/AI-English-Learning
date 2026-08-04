import { test, expect } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * Ticket 05's Observe page. Per spec.md's testing philosophy, these
 * assertions are all things a learner or tester could observe directly —
 * the video element's `paused` state, the poster overlay's visibility, and
 * where a click on Continue lands — never internal component state.
 *
 * `?debug=1` is used to reach /observe directly and deterministically
 * regardless of prior progress, the same bypass e2e/navigation-spine.spec.ts
 * relies on.
 */

test.describe("observe page", () => {
  test("video does not autoplay and shows its poster on load", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    const video = page.getByTestId("observe-video");
    await expect(video).toBeVisible();

    // Not autoplaying: no autoplay attribute, and paused is true.
    await expect(video).not.toHaveAttribute("autoplay");
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);

    // Poster/cover showing.
    await expect(page.getByTestId("video-poster-overlay")).toBeVisible();
  });

  test("clicking Continue navigates to /explore without ever touching the video", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    // Only one plain button on this page — the Continue button — matching
    // e2e/navigation-spine.spec.ts's assumption that `getByRole("button")`
    // resolves unambiguously on every learning page.
    await expect(page.getByRole("button")).toHaveCount(1);

    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/explore(\?|$)/);
  });

  test("clicking the poster overlay starts playback and hides the overlay", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    const overlay = page.getByTestId("video-poster-overlay");
    const video = page.getByTestId("observe-video");

    await overlay.click();

    await expect(overlay).toBeHidden();
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  });

  test("shows the scene name and all four Watch for items, display-only", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    await expect(page.getByRole("heading", { name: "Observe" })).toBeVisible();
    // Scene name appears twice by design (page subtitle + poster overlay
    // caption) — assert at least one is visible rather than picking one.
    await expect(page.getByText("邻里偶遇打招呼").first()).toBeVisible();

    for (const category of ["打招呼", "问候", "回应", "结束对话"]) {
      await expect(page.getByText(category, { exact: false }).first()).toBeVisible();
    }

    // Display-only: no buttons or links inside the Watch for section.
    const watchForSection = page.getByTestId("watch-for");
    await expect(watchForSection.getByRole("button")).toHaveCount(0);
    await expect(watchForSection.getByRole("link")).toHaveCount(0);
  });

  test("no horizontal scroll at the mobile viewport", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});
