import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/practice/speak/route";

describe("GET /api/practice/speak", () => {
  const previousApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
    vi.unstubAllGlobals();
  });

  it("accepts a Chinese explanation up to 1000 characters", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    const text = "中".repeat(1000);

    const response = await GET(
      new Request(`http://localhost/api/practice/speak?text=${encodeURIComponent(text)}`),
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });

  it("rejects text longer than 1000 characters before calling the provider", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const text = "中".repeat(1001);

    const response = await GET(
      new Request(`http://localhost/api/practice/speak?text=${encodeURIComponent(text)}`),
    );

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
