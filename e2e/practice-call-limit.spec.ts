import { expect, test } from "@playwright/test";
import {
  PRACTICE_URL,
  hangUp,
  installFakeCall,
  makeCall,
  persistedCalls,
  resetStorage,
  resetStorageOnce,
  startCall,
} from "./fixtures";

/**
 * At most three Calls per Practice, persisted across reloads (issue #63).
 */

test.describe("Practice — three Calls", () => {
  test("shows which Call this is, counting up as Calls connect, and disables the button after the third", async ({
    page,
  }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);

    for (const n of [1, 2, 3]) {
      await expect(page.getByTestId("call-counter")).toContainText(`第 ${n} / 3 通`);
      await makeCall(page, null, n);
    }

    await expect(page.getByTestId("call-button")).toBeDisabled();
    await expect(page.getByTestId("call-button")).toHaveText("3 次通话已用完");
    // The latest Call's Turns stay on screen.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Hi! This is call 3.");
  });

  test("a Call that connects counts even when the learner says nothing", async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);

    await startCall(page);
    await hangUp(page);

    await expect(page.getByTestId("call-counter")).toContainText("第 2 / 3 通");
    expect(await persistedCalls(page)).toHaveLength(1);
  });

  test("a Call that fails to connect does not use up a Call", async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page, { sessionFails: true });
    await page.goto(PRACTICE_URL);

    await page.getByTestId("call-button").click();

    await expect(page.getByTestId("practice-error")).toBeVisible();
    await expect(page.getByTestId("call-button")).toHaveText("开始对话");
    await expect(page.getByTestId("call-counter")).toContainText("第 1 / 3 通");
    expect(await persistedCalls(page)).toEqual([]);
  });

  test("reloading keeps the Call count and shows the latest Call's Turns", async ({ page }) => {
    await resetStorageOnce(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);

    await makeCall(page, "Hello, Emily.", 1);
    await makeCall(page, "I'm good.", 2);

    await page.reload();

    await expect(page.getByTestId("call-counter")).toContainText("第 3 / 3 通");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Hi! This is call 2.");
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("I'm good.");
    // Both Calls' transcripts survived, not only the latest.
    const calls = await persistedCalls(page);
    expect(calls.map((c) => c.lines.filter((l) => l.role === "learner").map((l) => l.text))).toEqual([
      ["Hello, Emily."],
      ["I'm good."],
    ]);
  });

  test("a reload never grants Calls back", async ({ page }) => {
    await resetStorageOnce(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    for (const n of [1, 2, 3]) await makeCall(page, null, n);

    await page.reload();

    await expect(page.getByTestId("call-button")).toBeDisabled();
    await expect(page.getByTestId("call-button")).toHaveText("3 次通话已用完");
  });

  test("a Call cut off by a reload is over, keeping what was already said", async ({ page }) => {
    await resetStorageOnce(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);

    await startCall(page);
    await page.evaluate(() => window.__fakeCall?.emit({ type: "response.created" }));
    await page.evaluate(() =>
      window.__fakeCall?.emit({ type: "response.output_audio_transcript.delta", item_id: "e1", delta: "Hi!" }),
    );
    await page.reload();

    await expect(page.getByTestId("call-counter")).toContainText("第 2 / 3 通");
    await expect(page.getByTestId("call-button")).toHaveText("开始对话");
    await expect.poll(async () => (await persistedCalls(page))[0]?.ended).toBe(true);
  });
});
