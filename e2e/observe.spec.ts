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

    // Scoped by name rather than an unscoped role query — same reasoning as
    // e2e/navigation-spine.spec.ts: the page legitimately has more than one <button>. What actually
    // matters here is that "Continue" itself is unambiguous.
    const continueButton = page.getByRole("button", { name: /continue/i });
    await expect(continueButton).toHaveCount(1);
    await expect(continueButton).toHaveText(/Continue 继续学习/);

    await continueButton.click();
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

  test("shows the new two-line headline and drops the old copy", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    await expect(page.getByRole("heading", { name: "Observe" })).toBeVisible();
    await expect(page.getByText("Same greeting.")).toBeVisible();
    await expect(page.getByText("Different conversations.")).toBeVisible();

    await expect(page.getByText("Watch how people really communicate.")).toHaveCount(0);
    await expect(page.getByText("看看真实生活中，人们是怎么交流的。")).toHaveCount(0);
    await expect(page.getByText("邻里偶遇打招呼")).toHaveCount(0);
    await expect(page.getByTestId("watch-for")).toHaveCount(0);
    await expect(page.getByText("Watch for")).toHaveCount(0);
  });

  test("thinking prompts show a title and three questions above the video, display-only", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    const prompts = page.getByTestId("thinking-prompts");
    await expect(prompts).toBeVisible();
    await expect(prompts.getByText("看看视频，想一想")).toBeVisible();

    const items = prompts.getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("How are you?");
    await expect(items.nth(0)).toContainText("真的在问近况吗？");
    await expect(items.nth(1)).toContainText("为什么有的聊得短，有的聊得久？");
    await expect(items.nth(2)).toContainText("什么时候该继续聊，什么时候该结束？");

    await expect(prompts.getByRole("button")).toHaveCount(0);
    await expect(prompts.getByRole("link")).toHaveCount(0);

    const promptsBox = await prompts.boundingBox();
    const videoBox = await page.getByTestId("observe-video").first().boundingBox();
    expect(promptsBox!.y + promptsBox!.height).toBeLessThanOrEqual(videoBox!.y);
  });

  test("the progress row shows 5 dots with Observe as the current one", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    await expect(page.getByRole("heading", { name: "Observe" })).toBeVisible();
    await expect(page.locator('[data-testid^="progress-dot-"]')).toHaveCount(5);
    await expect(page.getByTestId("progress-dot-observe")).toHaveAttribute("data-state", "current");
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
