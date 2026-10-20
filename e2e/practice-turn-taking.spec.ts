import { expect, test } from "@playwright/test";
import {
  PRACTICE_URL,
  emilyFinishesSpeaking,
  emilySays,
  emilyStartsSpeaking,
  emit,
  installFakeCall,
  learnerSpeaks,
  micIsOpen,
  resetStorage,
  startCall,
  startCallAndGreet,
} from "./fixtures";

/**
 * Turn-Taking in a Call (issue #61, CONTEXT.md "Turn-Taking", "Handoff
 * Gap"): the learner cannot interrupt Emily. Her line and the half-second
 * after it belong to nobody else; only then does the floor go back to the
 * learner.
 */

test.describe("Practice — Turn-Taking", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
  });

  test("the microphone is closed while Emily speaks and for the Handoff Gap after her line", async ({ page }) => {
    await startCall(page);
    await expect.poll(() => micIsOpen(page)).toBe(false);

    await emilyStartsSpeaking(page, "e1", "Hi! How are you today?");
    expect(await micIsOpen(page)).toBe(false);

    await emilyFinishesSpeaking(page);
    // Inside the Handoff Gap the learner still may not start.
    expect(await micIsOpen(page)).toBe(false);
    await expect.poll(() => micIsOpen(page)).toBe(true);
  });

  test("speaking over Emily does not cut her off or produce a learner Turn or bubble", async ({ page }) => {
    await startCall(page);
    await emilyStartsSpeaking(page, "e1", "Hi! How are you today?");

    // Anything the server still reports hearing while she talks is ignored.
    await learnerSpeaks(page, "interruption", "Excuse me");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Hi! How are you today?");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);

    // ...and so is speech during the Handoff Gap.
    await emilyFinishesSpeaking(page);
    await learnerSpeaks(page, "too-early", "Hello?");
    await expect(page.getByTestId("learner-message-bubble")).toHaveCount(0);

    // She finished her line: it is whole, and the Call went on.
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Hi! How are you today?");
    await expect(page.getByTestId("call-button")).toHaveAttribute("data-phase", "live");
  });

  test("about half a second after her line the learner is heard normally", async ({ page }) => {
    await startCall(page);
    await emilySays(page, "e1", "Hi!");
    await expect.poll(() => micIsOpen(page)).toBe(true);

    await learnerSpeaks(page, "u1", "Hello, Emily.");
    await expect(page.getByTestId("learner-message-bubble")).toHaveText("Hello, Emily.");
  });

  test("the microphone closes again as soon as Emily starts her reply", async ({ page }) => {
    await startCallAndGreet(page);

    await emit(page, { type: "input_audio_buffer.committed", item_id: "u1" });
    await emit(page, { type: "response.created" });
    expect(await micIsOpen(page)).toBe(false);
  });
});
