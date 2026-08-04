import { test, expect } from "@playwright/test";
import { mockApiRoute, mockSpeechApis } from "./fixtures";

/**
 * Smoke tests for the reusable stub fixtures ticket 03 hands to tickets
 * 08/09 (LLM proxy route + Web Speech API aren't built yet — those tickets
 * will point these helpers at their real routes/consumers). These only
 * prove the fixtures themselves behave as documented in ./fixtures.ts;
 * they don't stand in for ticket-08/09-specific coverage.
 */

test.describe("reusable E2E fixtures", () => {
  test("mockApiRoute fulfills matching requests with the given JSON body", async ({ page }) => {
    await mockApiRoute(page, "**/__e2e_fixture_check__", { ok: true, echoed: "example" });
    await page.goto("/");

    const body = await page.evaluate(async () => {
      const res = await fetch("/__e2e_fixture_check__");
      return res.json();
    });

    expect(body).toEqual({ ok: true, echoed: "example" });
  });

  test("mockSpeechApis installs a controllable SpeechRecognition stub", async ({ page }) => {
    await mockSpeechApis(page);
    await page.goto("/");

    const transcript = await page.evaluate(() => {
      type MockRecognition = {
        onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
        start: () => void;
      };
      type MockRecognitionCtor = new () => MockRecognition;
      type MockController = {
        emitResult: (transcript: string, options?: { isFinal?: boolean }) => void;
      };

      return new Promise<string>((resolve) => {
        const Recognition = (window as unknown as { SpeechRecognition: MockRecognitionCtor })
          .SpeechRecognition;
        const recognition = new Recognition();
        recognition.onresult = (event) => resolve(event.results[0][0].transcript);
        recognition.start();

        const controller = (window as unknown as { __mockSpeechRecognition?: MockController })
          .__mockSpeechRecognition;
        controller?.emitResult("hello Emily", { isFinal: true });
      });
    });

    expect(transcript).toBe("hello Emily");
  });

  test("mockSpeechApis installs a controllable speechSynthesis stub", async ({ page }) => {
    await mockSpeechApis(page);
    await page.goto("/");

    const voiceCount = await page.evaluate(() => window.speechSynthesis.getVoices().length);
    expect(voiceCount).toBeGreaterThan(0);

    const utteranceEnded = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const utterance = { onend: () => resolve(true) } as unknown as SpeechSynthesisUtterance;
        window.speechSynthesis.speak(utterance);
      });
    });

    expect(utteranceEnded).toBe(true);
  });
});
