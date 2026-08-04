import { test, expect } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * E2E coverage for the Notice page (ticket 07). Per spec.md's testing
 * philosophy ("外部可观察行为，不测实现细节"), everything here asserts what
 * a learner could see or do — a card's `data-state` attribute, which bodies
 * are actually visible, and where a click on Continue lands — never
 * internal React state.
 *
 * Reached via `?debug=1` (see src/lib/debug.ts / the learning layout's
 * guard) since Notice's normal prerequisite is completing Explore, which
 * isn't this ticket's concern to drive through.
 */

const NOTICE_URL = "/notice?debug=1";

test.describe("Notice page", () => {
  test("defaults to only the first Cultural Insight Card expanded; the other two start collapsed", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(NOTICE_URL);

    await expect(page.getByTestId("who-greets")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("keep-chatting")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("small-talk-topics")).toHaveAttribute("data-state", "collapsed");

    // The first card's US/China comparison and "why" explanation are visible...
    await expect(page.getByTestId("who-greets-us")).toBeVisible();
    await expect(page.getByTestId("who-greets-china")).toBeVisible();
    await expect(page.getByTestId("who-greets-why")).toBeVisible();

    // ...the other two cards' bodies are not.
    await expect(page.getByTestId("keep-chatting-body")).not.toBeVisible();
    await expect(page.getByTestId("small-talk-topics-body")).not.toBeVisible();
  });

  test("opening a second card auto-collapses the first — only one card is expanded at a time", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(NOTICE_URL);

    await expect(page.getByTestId("who-greets")).toHaveAttribute("data-state", "expanded");

    await page.getByTestId("keep-chatting-header").click();

    await expect(page.getByTestId("keep-chatting")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("who-greets")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("small-talk-topics")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("who-greets-body")).not.toBeVisible();

    // Opening the third card collapses the second in turn — never two open
    // at once, no matter which card was previously open.
    await page.getByTestId("small-talk-topics-header").click();

    await expect(page.getByTestId("small-talk-topics")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("keep-chatting")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("who-greets")).toHaveAttribute("data-state", "collapsed");

    const expandedCount = await page
      .locator('[data-testid$="-greets"], [data-testid$="-chatting"], [data-testid$="-topics"]')
      .evaluateAll(
        (elements) => elements.filter((el) => el.getAttribute("data-state") === "expanded").length,
      );
    expect(expandedCount).toBe(1);
  });

  test("the Continue button is reachable without expanding any card, and navigates to /practice", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(NOTICE_URL);

    // Collapse the default-open first card so nothing at all is expanded.
    await page.getByTestId("who-greets-header").click();
    await expect(page.getByTestId("who-greets")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("keep-chatting")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("small-talk-topics")).toHaveAttribute("data-state", "collapsed");

    await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/practice(\?|$)/);
  });
});
