import { test, expect } from "@playwright/test";
import { emit, installFakeCall, mockApiRoute } from "./fixtures";

/**
 * Smoke tests for the reusable stub fixtures. These only prove the fixtures
 * themselves behave as documented in ./fixtures.ts; they don't stand in for
 * Practice's own coverage.
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

  test("installFakeCall replaces the microphone and the peer connection with controllable fakes", async ({ page }) => {
    await installFakeCall(page);
    await page.goto("/");

    const received = await page.evaluate(async () => {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = new RTCPeerConnection();
      const channel = pc.createDataChannel("oai-events");
      const messages: string[] = [];
      channel.onmessage = (e) => messages.push(e.data);
      await pc.setRemoteDescription({ type: "answer", sdp: "x" });
      window.__fakeCall?.emit({ type: "response.created" });
      return { messages, micRequests: window.__fakeCall?.micRequests, connections: window.__fakeCall?.connections };
    });

    expect(received).toEqual({
      messages: [JSON.stringify({ type: "response.created" })],
      micRequests: 1,
      connections: 1,
    });
  });

  test("installFakeCall blocks any request that would reach OpenAI or Anthropic", async ({ page }) => {
    const network = await installFakeCall(page);
    await page.goto("/");

    const outcome = await page.evaluate(async () => {
      try {
        await fetch("https://api.anthropic.com/v1/messages", { method: "POST", body: "{}" });
        return "reached";
      } catch {
        return "blocked";
      }
    });

    expect(outcome).toBe("blocked");
    expect(network.unexpectedRequests).toEqual(["https://api.anthropic.com/v1/messages"]);
  });

  test("emit delivers nothing before a data channel exists, without throwing", async ({ page }) => {
    await installFakeCall(page);
    await page.goto("/");
    await emit(page, { type: "response.created" });
  });
});
