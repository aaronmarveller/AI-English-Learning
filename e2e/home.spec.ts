import { test, expect, type Page } from "@playwright/test";
import { resetStorage } from "./fixtures";
import { HOME_CONTENT } from "@/content/home";

/**
 * Ticket 04 — Home page. Per spec.md's testing philosophy, every assertion
 * here is something a learner could observe directly: which text is on
 * screen, and where a click lands (URL). Nothing reaches into the progress
 * store or any component's internal state.
 */

/**
 * Freezes the browser's wall clock to a fixed hour (on a fixed date), so
 * GreetingBanner's `new Date().getHours()` read is deterministic.
 *
 * Implemented via page.addInitScript() overriding the global `Date`
 * (rather than Playwright's page.clock API), so it only touches
 * `Date`/`Date.now` — nothing about timers or animation frames — keeping
 * this test isolated from any assumptions about how page.clock's
 * virtual-time model interacts with React's own scheduler. This mirrors
 * the class-extends-a-builtin-inside-addInitScript technique
 * e2e/fixtures.ts's mockSpeechApis already uses for SpeechRecognition.
 */
async function mockLocalHour(page: Page, hour: number): Promise<void> {
  await page.addInitScript((h: number) => {
    const RealDate = Date;
    const fixedMs = new RealDate(2026, 0, 1, h, 0, 0).getTime();

    class MockDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedMs);
        } else {
          // @ts-expect-error -- forwarding an arbitrary Date constructor arg list
          super(...args);
        }
      }
      static now(): number {
        return fixedMs;
      }
    }

    // @ts-expect-error -- intentionally replacing the global Date constructor for this test
    window.Date = MockDate;
  }, hour);
}

test.describe("Home page", () => {
  test.describe("time-of-day greeting", () => {
    for (const { label, hour, expectedText } of [
      { label: "morning", hour: 8, expectedText: "Good Morning" },
      { label: "afternoon", hour: 14, expectedText: "Good Afternoon" },
      { label: "evening", hour: 20, expectedText: "Good Evening" },
    ]) {
      test(`shows the ${label} greeting when local time is ${hour}:00`, async ({ page }) => {
        await resetStorage(page);
        await mockLocalHour(page, hour);
        await page.goto("/");

        await expect(page.getByTestId("greeting")).toHaveText(expectedText);
      });
    }
  });

  test.describe("hero", () => {
    test("shows exactly one greeting, in English", async ({ page }) => {
      await resetStorage(page);
      await mockLocalHour(page, 8);
      await page.goto("/");

      await expect(page.getByText("Good Morning")).toHaveCount(1);
      for (const zh of ["早上好", "下午好", "晚上好"]) {
        await expect(page.getByText(zh)).toHaveCount(0);
      }
    });

    for (const width of [375, 390]) {
      test(`renders "Learn Real English." on a single line at ${width}px with no horizontal scroll`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await resetStorage(page);
        await page.goto("/");

        const heading = page.getByRole("heading", { name: "Learn Real English." });
        await expect(heading).toBeVisible();
        const { height, lineHeight } = await heading.evaluate((el) => ({
          height: el.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(el).lineHeight),
        }));
        expect(height).toBeCloseTo(lineHeight, 0);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    test("promises ten minutes a day and no longer mentions five", async ({ page }) => {
      await resetStorage(page);
      await page.goto("/");

      await expect(page.getByText("每天 10 分钟，轻松开口说英语。")).toBeVisible();
      await expect(page.getByText("每天 5 分钟")).toHaveCount(0);
    });
  });

  test.describe("Today's Mission", () => {
    test("shows the 10-minute duration and no 5-minute copy anywhere on Home", async ({ page }) => {
      await resetStorage(page);
      await page.goto("/");

      await expect(page.getByText("10 min", { exact: true })).toBeVisible();
      await expect(page.getByText("5 分钟")).toHaveCount(0);
      await expect(page.getByText("5–10 分钟")).toHaveCount(0);
    });

    test("lists the intro line and the three Learning Objectives in order", async ({ page }) => {
      await resetStorage(page);
      await page.goto("/");

      const card = page.getByTestId("mission-card");
      const expected = [
        "学完这节课，你将能够：",
        "回应日常问候",
        "简单分享自己的近况（可选）",
        "自然地继续或结束交流",
      ];
      for (const text of expected) {
        await expect(card.getByText(text, { exact: true })).toBeVisible();
      }
      const body = await card.innerText();
      const positions = expected.map((t) => body.indexOf(t));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    test("drops the Chinese subtitle, category and globe", async ({ page }) => {
      await resetStorage(page);
      await page.goto("/");

      const card = page.getByTestId("mission-card");
      await expect(card.getByText("邻里问候", { exact: true })).toHaveCount(0);
      await expect(card.getByText("日常社交")).toHaveCount(0);
      await expect(card.getByText("🌐")).toHaveCount(0);
      await expect(card.getByText("👋")).toBeVisible();
    });

    test("keeps the card's accessible name and names the button 开始学习", async ({ page }) => {
      await resetStorage(page);
      await page.goto("/");

      await expect(
        page.getByRole("button", { name: "开始今日课程 Greeting Someone 邻里问候" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "开始学习", exact: true })).toBeVisible();
    });
  });

  test("clicking anywhere on the Mission card starts the lesson, same as the primary button", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/");

    // The card renders no nested button at all — clicking a spot near its
    // edge (the thumbnail placeholder, not any text/control) proves the
    // whole card is the tap target, not just some inner element.
    await page.getByTestId("mission-card").click({ position: { x: 10, y: 10 } });

    await expect(page).toHaveURL(/\/observe$/);
  });

  test("clicking the primary button starts the lesson directly, with no intermediate screen", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/");

    await page.getByTestId("start-lesson-button").click();

    await expect(page).toHaveURL(/\/observe$/);
  });

  test("header shows only a non-interactive Home tab, with no Progress or Profile control", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav.getByText("Home", { exact: true })).toBeVisible();
    await expect(page.getByText("Progress", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Profile", { exact: true })).toHaveCount(0);
    await expect(nav.getByRole("button")).toHaveCount(0);
    await expect(nav.getByRole("link")).toHaveCount(0);

    await nav.getByText("Home", { exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("clicking a locked Coming Next item does not navigate anywhere", async ({ page }) => {
    await resetStorage(page);
    await page.goto("/");

    for (const item of HOME_CONTENT.comingNext) {
      await page.getByTestId(`coming-next-${item.id}`).click();
      // Nothing is bound to these rows, so any accidental navigation would
      // have to be async — give it a beat before asserting it never came.
      await page.waitForTimeout(150);
      await expect(page).toHaveURL(/\/$/);
    }
  });
});
