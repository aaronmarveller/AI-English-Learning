import { describe, expect, it } from "vitest";
import { parseTurnEventStream } from "@/lib/submit-practice-turn";
import type { PracticeTurnStreamEvent } from "@/lib/practice-turn-protocol";

/**
 * Builds a `Response` whose body streams the given raw text chunks verbatim
 * — one `ReadableStream` enqueue per array entry — so a test can control
 * exactly where a chunk boundary falls relative to an SSE frame, without a
 * real network round-trip. Matches the route's actual wire format: `data:
 * <json>\n\n` per event (see route.ts's doc comment).
 *
 * Issue #16: the wire contract's `final` event shrank to `verdict` +
 * `learner_asked_back`, and the `partial` event was removed entirely (no
 * `reply_en` left to stream — Emily's line is now client-selected from the
 * Lesson's Conversation Script pools).
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
      'data: {"type":"final","verdict":"accepted","learner_asked_back":false}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "final", verdict: "accepted", learner_asked_back: false },
    ]);
  });

  it("parses a final event with learner_asked_back true", async () => {
    const response = makeStreamResponse([
      'data: {"type":"final","verdict":"accepted","learner_asked_back":true}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "final", verdict: "accepted", learner_asked_back: true },
    ]);
  });

  it("parses an error event", async () => {
    const response = makeStreamResponse(['data: {"type":"error","error":"upstream_error"}\n\n']);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([{ type: "error", error: "upstream_error" }]);
  });

  it("reassembles one SSE frame split across two chunks", async () => {
    const fullFrame = 'data: {"type":"final","verdict":"needs_retry","learner_asked_back":false}\n\n';
    // Split well before the frame's trailing "\n\n" boundary, so this
    // genuinely exercises the buffer's cross-chunk reassembly rather than
    // happening to split on a frame boundary already.
    const splitPoint = 40;

    const response = makeStreamResponse([fullFrame.slice(0, splitPoint), fullFrame.slice(splitPoint)]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "final", verdict: "needs_retry", learner_asked_back: false },
    ]);
  });

  it("silently skips a malformed data line without throwing", async () => {
    const response = makeStreamResponse([
      "data: {this is not valid json\n\n",
      'data: {"type":"final","verdict":"accepted","learner_asked_back":false}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await expect(
      parseTurnEventStream(response, (event) => events.push(event)),
    ).resolves.toBeUndefined();

    // The malformed frame produced no event; the valid frame after it still did.
    expect(events).toEqual([
      { type: "final", verdict: "accepted", learner_asked_back: false },
    ]);
  });

  it("rejects a final event missing learner_asked_back", async () => {
    const response = makeStreamResponse(['data: {"type":"final","verdict":"accepted"}\n\n']);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([]);
  });
});
