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

const SCENE_IDS = ["coffee-shop", "neighbor"] as const;

test.describe("observe page", () => {
  test("renders two scenes in order, each with emoji, name and bilingual tag", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    const scenes = page.getByTestId(/^observe-scene-/);
    await expect(scenes).toHaveCount(2);
    await expect(scenes.nth(0)).toHaveAttribute("data-testid", "observe-scene-coffee-shop");
    await expect(scenes.nth(1)).toHaveAttribute("data-testid", "observe-scene-neighbor");

    await expect(scenes.nth(0)).toContainText("☕");
    await expect(scenes.nth(0)).toContainText("At a Coffee Shop");
    await expect(scenes.nth(0)).toContainText("Quick Greeting 简短问候");
    await expect(scenes.nth(1)).toContainText("🏠");
    await expect(scenes.nth(1)).toContainText("Meeting a Neighbor");
    await expect(scenes.nth(1)).toContainText("Casual Small Talk 日常寒暄");
  });

  test("neither video autoplays and each shows its poster overlay on load", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    for (const id of SCENE_IDS) {
      const video = page.getByTestId(`observe-video-${id}`);
      await expect(video).toBeVisible();
      await expect(video).not.toHaveAttribute("autoplay");
      expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
      await expect(page.getByTestId(`video-poster-overlay-${id}`)).toBeVisible();
    }
  });

  test("each video has an English captions track marked default", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    for (const id of SCENE_IDS) {
      const track = page.getByTestId(`observe-video-${id}`).locator("track");
      await expect(track).toHaveAttribute("srclang", "en");
      await expect(track).toHaveAttribute("kind", "captions");
      await expect(track).toHaveAttribute("default", "");
    }
  });

  test("clicking Continue navigates to /notice without ever touching the video", async ({
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
    await expect(page).toHaveURL(/\/notice(\?|$)/);
  });

  test("clicking one overlay starts only that video and hides only its overlay", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    await page.getByTestId("video-poster-overlay-neighbor").click();

    await expect(page.getByTestId("video-poster-overlay-neighbor")).toBeHidden();
    expect(
      await page.getByTestId("observe-video-neighbor").evaluate((el: HTMLVideoElement) => el.paused),
    ).toBe(false);

    await expect(page.getByTestId("video-poster-overlay-coffee-shop")).toBeVisible();
    expect(
      await page
        .getByTestId("observe-video-coffee-shop")
        .evaluate((el: HTMLVideoElement) => el.paused),
    ).toBe(true);
  });

  test("each overlay announces its own scene and starts playback on Enter/Space", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    const coffee = page.getByTestId("video-poster-overlay-coffee-shop");
    const neighbor = page.getByTestId("video-poster-overlay-neighbor");
    await expect(coffee).toHaveAttribute("aria-label", /咖啡店/);
    await expect(neighbor).toHaveAttribute("aria-label", /邻里/);

    await coffee.focus();
    await page.keyboard.press("Enter");
    await expect(coffee).toBeHidden();

    await neighbor.focus();
    await page.keyboard.press("Space");
    await expect(neighbor).toBeHidden();
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
    const videoBox = await page.getByTestId("observe-scene-coffee-shop").boundingBox();
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
