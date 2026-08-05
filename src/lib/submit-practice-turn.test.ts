import { describe, expect, it } from "vitest";
import { parseTurnEventStream } from "@/lib/submit-practice-turn";
import type { PracticeTurnStreamEvent } from "@/lib/practice-turn-protocol";

/**
 * Builds a `Response` whose body streams the given raw text chunks verbatim
 * — one `ReadableStream` enqueue per array entry — so a test can control
 * exactly where a chunk boundary falls relative to an SSE frame, without a
 * real network round-trip. Matches the route's actual wire format: `data:
 * <json>\n\n` per event (see route.ts's doc comment).
 */
function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  );
}

describe("parseTurnEventStream", () => {
  it("parses a single final event", async () => {
    const response = makeStreamResponse([
      'data: {"type":"final","verdict":"accepted","reply_en":"Hi!","reply_zh":"嗨！","highlight_key":"used-whitelist-phrase"}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      {
        type: "final",
        verdict: "accepted",
        reply_en: "Hi!",
        reply_zh: "嗨！",
        highlight_key: "used-whitelist-phrase",
      },
    ]);
  });

  it("parses a partial event followed by a final event, in order", async () => {
    const response = makeStreamResponse([
      'data: {"type":"partial","reply_en":"Hi"}\n\n',
      'data: {"type":"final","verdict":"accepted","reply_en":"Hi there!","reply_zh":"嗨，你好！","highlight_key":"natural-paraphrase"}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "partial", reply_en: "Hi" },
      {
        type: "final",
        verdict: "accepted",
        reply_en: "Hi there!",
        reply_zh: "嗨，你好！",
        highlight_key: "natural-paraphrase",
      },
    ]);
  });

  it("parses an error event", async () => {
    const response = makeStreamResponse(['data: {"type":"error","error":"upstream_error"}\n\n']);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([{ type: "error", error: "upstream_error" }]);
  });

  it("reassembles one SSE frame split across two chunks", async () => {
    const fullFrame =
      'data: {"type":"final","verdict":"accepted","reply_en":"Hi there!","reply_zh":"嗨！","highlight_key":"confident-full-turn"}\n\n';
    // Split well before the frame's trailing "\n\n" boundary, so this
    // genuinely exercises the buffer's cross-chunk reassembly rather than
    // happening to split on a frame boundary already.
    const splitPoint = 40;

    const response = makeStreamResponse([fullFrame.slice(0, splitPoint), fullFrame.slice(splitPoint)]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      {
        type: "final",
        verdict: "accepted",
        reply_en: "Hi there!",
        reply_zh: "嗨！",
        highlight_key: "confident-full-turn",
      },
    ]);
  });

  it("silently skips a malformed data line without throwing", async () => {
    const response = makeStreamResponse([
      "data: {this is not valid json\n\n",
      'data: {"type":"final","verdict":"accepted","reply_en":"Hi!","reply_zh":"嗨！","highlight_key":"used-whitelist-phrase"}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await expect(
      parseTurnEventStream(response, (event) => events.push(event)),
    ).resolves.toBeUndefined();

    // The malformed frame produced no event; the valid frame after it still did.
    expect(events).toEqual([
      {
        type: "final",
        verdict: "accepted",
        reply_en: "Hi!",
        reply_zh: "嗨！",
        highlight_key: "used-whitelist-phrase",
      },
    ]);
  });
});
