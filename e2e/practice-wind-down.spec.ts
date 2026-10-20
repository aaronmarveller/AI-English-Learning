import { expect, test } from "@playwright/test";
import {
  PRACTICE_URL,
  emilySays,
  emilyStartsSpeaking,
  emilyFinishesSpeaking,
  installFakeCall,
  resetStorage,
  sentEvents,
  startCall,
} from "./fixtures";

/**
 * A Call that runs out ends gracefully (issue #62): Emily says goodbye with
 * about eight seconds left, and a Call whose time is up while she is mid-line
 * ends only once that line has finished. Time is driven with Playwright's
 * clock so the 45 s limit costs nothing to run.
 */

test.describe("Practice — a Call winds down", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await page.clock.install();
    await page.goto(PRACTICE_URL);
  });

  async function startAndGreet(page: import("@playwright/test").Page) {
    await startCall(page);
    await emilySays(page, "e1", "Hi! How are you today?");
    await page.clock.runFor(600);
    await expect(page.getByTestId("call-button")).toHaveText("挂断对话 45s");
  }

  test("with about eight seconds left Emily is asked to say a short goodbye", async ({ page }) => {
    await startAndGreet(page);
    expect((await sentEvents(page)).filter((e) => e.type === "response.create")).toHaveLength(1);

    await page.clock.runFor(36_500);
    await expect(page.getByTestId("call-button")).toContainText("挂断对话 8s");
    await page.clock.runFor(500);

    const creates = (await sentEvents(page)).filter((e) => e.type === "response.create");
    expect(creates).toHaveLength(2);
    expect(JSON.stringify(creates[1])).toMatch(/goodbye/i);
  });

  test("at 0 s, while Emily is mid-line, the Call ends only once her line has finished", async ({ page }) => {
    await startAndGreet(page);
    await page.clock.runFor(38_000);
    await emilyStartsSpeaking(page, "e2", "It was lovely talking to you. Goodbye!");

    await page.clock.runFor(10_000);
    // Time is up, but she is still talking: the Call is still live, and the
    // countdown stops at zero rather than going negative.
    await expect(page.getByTestId("call-button")).toHaveText("挂断对话 0s");
    await expect(page.getByTestId("call-button")).toHaveAttribute("data-phase", "live");
    await expect(page.getByTestId("emily-message-bubble").last()).toHaveText("It was lovely talking to you. Goodbye!");

    await emilyFinishesSpeaking(page);
    await expect(page.getByTestId("call-button")).toHaveAttribute("data-phase", "idle");
    await expect(page.getByTestId("call-button")).toHaveText("开始对话");
  });

  test("at 0 s, with Emily silent, the Call ends at once", async ({ page }) => {
    await startAndGreet(page);
    await page.clock.runFor(38_000);
    await emilySays(page, "e2", "Goodbye!");

    await page.clock.runFor(8_000);
    await expect(page.getByTestId("call-button")).toHaveAttribute("data-phase", "idle");
  });

  test("tapping 挂断对话 still ends the Call immediately", async ({ page }) => {
    await startAndGreet(page);
    await page.getByTestId("call-button").click();
    await expect(page.getByTestId("call-button")).toHaveAttribute("data-phase", "idle");
  });
});
