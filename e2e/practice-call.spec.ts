import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PRACTICE_URL,
  emilySays,
  emilyStartsSpeaking,
  emit,
  installFakeCall,
  learnerSpeaks,
  resetStorage,
  sentEvents,
  startCall,
  startCallAndGreet,
} from "./fixtures";

/**
 * A live Call replaces the scripted conversation on Practice (issue #60).
 * The Realtime connection, microphone and session route are fakes; the page,
 * its persistence and its bubbles are the real thing.
 */

test.describe("Practice — a live Call with Emily", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test("tapping 开始对话 asks for the microphone, connects, and Emily is asked to greet", async ({ page }) => {
    const network = await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    await expect(page.getByTestId("call-button")).toHaveText("开始对话");
    await expect(page.getByTestId("call-counter")).toContainText("第 1 / 3 通");

    await startCall(page);

    expect(await page.evaluate(() => window.__fakeCall?.micRequests)).toBe(1);
    expect(network.sessionRequests).toBe(1);
    expect(await sentEvents(page)).toEqual([{ type: "response.create" }]);
    await expect(page.getByTestId("call-button")).toContainText("挂断对话");

    await emilySays(page, "emily-1", "Hi there! How are you today?");
    await expect(page.getByTestId("emily-message-bubble")).toHaveText("Hi there! How are you today?");
  });

  test("the 45 s countdown starts only after Emily's opening line has finished", async ({ page }) => {
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    await startCall(page);

    await emilyStartsSpeaking(page, "emily-1", "Hi! I'm Emily. It's nice to meet you.");
    await emit(page, { type: "response.done" });
    // Her audio is still playing: well over a second passes and not a second is spent.
    await page.waitForTimeout(2_200);
    await expect(page.getByTestId("call-button")).toHaveText("挂断对话 45s");

    await emit(page, { type: "output_audio_buffer.stopped" });
    await expect.poll(async () => page.getByTestId("call-button").textContent(), { timeout: 5_000 }).toMatch(
      /挂断对话 4[0-4]s/,
    );
  });

  test("tapping 挂断对话 ends the Call early and releases the microphone", async ({ page }) => {
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    await startCallAndGreet(page);

    await page.getByTestId("call-button").click();

    await expect(page.getByTestId("call-button")).toHaveText("开始对话");
    expect(await page.evaluate(() => window.__fakeCall?.micStopped)).toBe(true);
    expect(await page.evaluate(() => window.__fakeCall?.closed)).toBe(1);
  });

  test("the learner's Turn appears before Emily's reply even when its transcript arrives later", async ({ page }) => {
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    await startCallAndGreet(page);

    await emit(page, { type: "input_audio_buffer.speech_started", item_id: "u1" });
    await emit(page, { type: "input_audio_buffer.speech_stopped", item_id: "u1" });
    await emit(page, { type: "input_audio_buffer.committed", item_id: "u1" });
    await emit(page, { type: "response.created" });
    await emit(page, { type: "response.output_audio_transcript.delta", item_id: "e2", delta: "Great to hear!" });
    // The learner's transcript only arrives after Emily has started replying.
    await emit(page, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u1",
      transcript: "I'm good, thanks.",
    });

    const bubbles = page.getByTestId("call-transcript").locator("> div[data-testid]");
    await expect(bubbles).toHaveText(["Hi! I'm Emily.", "I'm good, thanks.", "Great to hear!"]);
    await expect(bubbles).toHaveCount(3);
  });

  test("shows Turns in their original language, with no Chinese translation", async ({ page }) => {
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    await startCallAndGreet(page);
    await learnerSpeaks(page, "u1", "这句话用英语怎么说？");
    await emilySays(page, "e2", "你可以说 \"How are you?\"。");

    await expect(page.getByTestId("learner-message-bubble")).toHaveText("这句话用英语怎么说？");
    await expect(page.getByTestId("emily-message-bubble").last()).toHaveText("你可以说 \"How are you?\"。");
    await expect(page.getByTestId("emily-message-zh")).toHaveCount(0);
    await expect(page.getByTestId("subtitle-toggle-button")).toHaveCount(0);
  });

  test("the typing input, 中文提问, the progress bar and 重新练习 are gone", async ({ page }) => {
    await installFakeCall(page);
    await page.goto(PRACTICE_URL);

    await expect(page.getByTestId("practice-text-input")).toHaveCount(0);
    await expect(page.getByTestId("practice-mic-button")).toHaveCount(0);
    await expect(page.getByTestId("ask-in-chinese-button")).toHaveCount(0);
    await expect(page.getByTestId("restart-practice-button")).toHaveCount(0);
    await expect(page.getByTestId("practice-step-greeting")).toHaveCount(0);
    await expect(page.getByText("中文提问")).toHaveCount(0);
    await expect(page.getByText("重新练习")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("on a non-secure origin the page explains why instead of crashing", async ({ page }) => {
    await installFakeCall(page, { insecureContext: true });
    await page.goto(PRACTICE_URL);

    await page.getByTestId("call-button").click();

    await expect(page.getByTestId("practice-error")).toContainText("不是安全连接");
    await expect(page.getByTestId("call-button")).toHaveText("开始对话");
    await expect(page.getByTestId("call-button")).toBeEnabled();
  });

  test("the browser only ever receives a short-lived client secret, never the API key", async ({ page }) => {
    const network = await installFakeCall(page);
    await page.goto(PRACTICE_URL);
    await startCallAndGreet(page);

    // The only credential the page presents to OpenAI is the client secret
    // our session route minted, and nothing else reached a real provider.
    expect(network.openaiAuthorization).toEqual(["Bearer ek_fake_client_secret"]);
    expect(network.unexpectedRequests).toEqual([]);

    // And the keys' names appear nowhere in what the browser is served.
    const staticDir = join(process.cwd(), ".next", "static");
    const leaks: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(js|css|html|json)$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (/OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-ant-|sk-proj-/.test(text)) leaks.push(path);
        }
      }
    };
    walk(staticDir);
    expect(leaks).toEqual([]);
  });

  test("the standalone /realtime-demo page no longer exists", async ({ page }) => {
    const response = await page.goto("/realtime-demo");
    expect(response?.status()).toBe(404);
  });
});
