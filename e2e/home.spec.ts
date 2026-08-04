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
      { label: "morning", hour: 8, expectedText: "早上好" },
      { label: "afternoon", hour: 14, expectedText: "下午好" },
      { label: "evening", hour: 20, expectedText: "晚上好" },
    ]) {
      test(`shows the ${label} greeting when local time is ${hour}:00`, async ({ page }) => {
        await resetStorage(page);
        await mockLocalHour(page, hour);
        await page.goto("/");

        await expect(page.getByTestId("greeting")).toHaveText(expectedText);
      });
    }
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
