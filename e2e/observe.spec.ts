import { createHash } from "node:crypto";
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

  test("captions default to English on the custom overlay, with native controls gone", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    for (const id of SCENE_IDS) {
      const video = page.getByTestId(`observe-video-${id}`);
      await expect(video.locator("track")).toHaveCount(0);
      await page.getByTestId(`video-poster-overlay-${id}`).click();
      await expect(page.getByTestId(`observe-cc-${id}`)).toBeVisible();
      await page.getByTestId(`observe-cc-${id}`).click();
      await expect(page.getByTestId(`observe-cc-option-en-${id}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  test("served posters and neighbor video match the doc assets", async ({ request }) => {
    const sha = async (url: string) =>
      createHash("sha256")
        .update(await (await request.get(url)).body())
        .digest("hex");
    expect(await sha("/assets/observe/coffee-shop-poster.png")).toBe(
      "b8152fc854c8829642d63941b6fe8d2c289c0398275452a6786be1d53034a144",
    );
    expect(await sha("/assets/observe/neighbor-poster.jpg")).toBe(
      "6aaf4dd94b92cdba2db25dbec25534f2331f40b3fdac078fdcfe006c92163e5e",
    );
    expect(await sha("/video/greeting-somebody-observe.mp4")).toBe(
      "0ea0e9e7773b16f05e7d21770be6395674f97b94d2a1a76ec82d7f7fe207cd8d",
    );
    const coffee = await request.get("/video/greeting-coffee-shop.mp4");
    expect(coffee.status()).toBe(200);
    expect((await coffee.body()).length).toBeGreaterThan(10_000);
  });

  test("neighbor poster is no longer the Home mission thumbnail", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");
    await expect(page.getByTestId("observe-video-neighbor")).toHaveAttribute(
      "poster",
      "/assets/observe/neighbor-poster.jpg",
    );
  });

  for (const scene of [
    {
      id: "neighbor",
      cues: [
        ["Hey! How's it going?", 0.5],
        ["Pretty good! How about you?", 1.8],
        ["Good! Just enjoying the weather.", 3.5],
        ["Yeah, it's a beautiful day!", 5.8],
        ["See you around!", 7.7],
        ["See you!", 8.7],
      ],
    },
    {
      id: "coffee-shop",
      cues: [
        ["Hi! How are you?", 1],
        ["I'm good, thanks. How are you?", 3],
        ["Good, thanks! What can I get for you?", 5],
        ["A latte, please.", 7.5],
        ["Sure!", 9],
      ],
    },
  ] as const) {
    test(`${scene.id} plays and shows each script line on screen at its cue time`, async ({
      page,
    }) => {
      await resetStorage(page);
      await page.goto("/observe?debug=1");
      const video = page.getByTestId(`observe-video-${scene.id}`);
      await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
        .toBeGreaterThanOrEqual(2);

      await page.getByTestId(`video-poster-overlay-${scene.id}`).click();
      await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime))
        .toBeGreaterThan(0);

      const overlay = page.getByTestId(`observe-cue-overlay-${scene.id}`);
      for (const [text, at] of scene.cues) {
        // Seek into the cue (paused for determinism), then check the overlay.
        await video.evaluate((el: HTMLVideoElement, t: number) => {
          el.pause();
          el.currentTime = t;
        }, at);
        await expect(overlay).toHaveText(text);
        await expect(page.getByTestId(`observe-cue-zh-${scene.id}`)).toHaveCount(0);
      }
    });
  }

  test("custom controls replace the native menu", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    for (const id of SCENE_IDS) {
      await expect(page.getByTestId(`observe-playpause-${id}`)).toHaveCount(0);
    }
    await page.getByTestId("video-poster-overlay-neighbor").click();

    const state = await page
      .getByTestId("observe-video-neighbor")
      .evaluate((el: HTMLVideoElement) => ({
        controls: el.controls,
        pip: el.disablePictureInPicture,
        list: el.getAttribute("controlsList"),
        volume: el.volume,
        muted: el.muted,
        rate: el.playbackRate,
      }));
    expect(state.controls).toBe(false);
    expect(state.pip).toBe(true);
    expect(state.list).toContain("nodownload");
    expect(state).toMatchObject({ volume: 1, muted: false, rate: 1 });
    await expect(page.getByRole("button", { name: /download|picture/i })).toHaveCount(0);

    for (const t of ["playpause", "progress", "mute", "volume", "cc", "speed", "fullscreen"]) {
      await expect(page.getByTestId(`observe-${t}-neighbor`)).toBeVisible();
    }
  });

  test("CC modes change the overlay: English, English + Chinese, Off", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");
    const video = page.getByTestId("observe-video-neighbor");
    await page.getByTestId("video-poster-overlay-neighbor").click();
    await video.evaluate((el: HTMLVideoElement) => {
      el.pause();
      el.currentTime = 0.5;
    });

    const en = page.getByTestId("observe-cue-en-neighbor");
    const zh = page.getByTestId("observe-cue-zh-neighbor");
    await expect(en).toHaveText("Hey! How's it going?");
    await expect(zh).toHaveCount(0);

    await page.getByTestId("observe-cc-neighbor").click();
    await expect(page.getByTestId(/^observe-cc-option-/)).toHaveCount(3);
    await page.getByTestId("observe-cc-option-en-zh-neighbor").click();
    await expect(en).toHaveText("Hey! How's it going?");
    await expect(zh).toHaveText("嗨！最近怎么样？");
    const enBox = await en.boundingBox();
    const zhBox = await zh.boundingBox();
    expect(enBox!.y).toBeLessThan(zhBox!.y);

    await page.getByTestId("observe-cc-neighbor").click();
    await page.getByTestId("observe-cc-option-off-neighbor").click();
    await expect(page.getByTestId("observe-cue-overlay-neighbor")).toHaveCount(0);
  });

  test("speed offers only 0.75 / 1 / 1.25 and sets playbackRate", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");
    const video = page.getByTestId("observe-video-coffee-shop");
    await page.getByTestId("video-poster-overlay-coffee-shop").click();

    await page.getByTestId("observe-speed-coffee-shop").click();
    await expect(page.getByTestId(/^observe-speed-option-/)).toHaveCount(3);
    for (const r of [0.75, 1.25, 1]) {
      await page.getByTestId(`observe-speed-option-${r}-coffee-shop`).click();
      expect(await video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(r);
      await page.getByTestId("observe-speed-coffee-shop").click();
    }
  });

  test("mute toggle and volume slider drive the video", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");
    const video = page.getByTestId("observe-video-neighbor");
    await page.getByTestId("video-poster-overlay-neighbor").click();

    await page.getByTestId("observe-mute-neighbor").click();
    expect(await video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(true);
    await page.getByTestId("observe-mute-neighbor").click();
    expect(await video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);

    await page.getByTestId("observe-volume-neighbor").fill("0.5");
    expect(await video.evaluate((el: HTMLVideoElement) => el.volume)).toBe(0.5);
  });

  test("fullscreen button calls requestFullscreen on the player container", async ({ page }) => {
    await resetStorage(page);
    await page.addInitScript(() => {
      (window as unknown as { __fs: Element[] }).__fs = [];
      Element.prototype.requestFullscreen = function () {
        (window as unknown as { __fs: Element[] }).__fs.push(this);
        return Promise.resolve();
      };
    });
    await page.goto("/observe?debug=1");
    await page.getByTestId("video-poster-overlay-neighbor").click();
    await page.getByTestId("observe-fullscreen-neighbor").click();

    const result = await page.evaluate(() => {
      const fs = (window as unknown as { __fs: Element[] }).__fs;
      const video = document.querySelector('[data-testid="observe-video-neighbor"]')!;
      return { calls: fs.length, containsVideo: fs[0]?.contains(video), isVideo: fs[0] === video };
    });
    expect(result).toEqual({ calls: 1, containsVideo: true, isVideo: false });
  });

  test("controls fit inside the 390x844 viewport after starting", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    for (const id of SCENE_IDS) {
      const overlay = page.getByTestId(`video-poster-overlay-${id}`);
      await overlay.scrollIntoViewIfNeeded();
      await overlay.click();
      const video = page.getByTestId(`observe-video-${id}`);
      await video.scrollIntoViewIfNeeded();
      for (const t of ["cc", "speed", "mute", "volume", "fullscreen"]) {
        const el = page.getByTestId(`observe-${t}-${id}`);
        await el.scrollIntoViewIfNeeded();
        const box = (await el.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(844);
      }
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

  test("the progress row shows 6 dots with Observe as the current one", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/observe?debug=1");

    await expect(page.getByRole("heading", { name: "Observe" })).toBeVisible();
    await expect(page.locator('[data-testid^="progress-dot-"]')).toHaveCount(6);
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
