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
 * Issue #16: the wire contract's `final` event shrank to two fields, and the
 * `partial` event was removed entirely (no `reply_en` left to stream —
 * Emily's line is now client-selected from the Lesson's Conversation Script
 * pools). Issue #47 replaced `verdict` with the Judge's `goal_report`: the
 * Verdict is derived from that report on the client
 * (src/lib/goal-progress.ts's `deriveVerdict`), so it is no longer on the
 * wire in either direction.
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
      'data: {"type":"final","goal_report":{"greeting":"achieved"},"learner_asked_back":false}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "final", goal_report: { greeting: "achieved" }, learner_asked_back: false },
    ]);
  });

  it("parses a final event with learner_asked_back true and a multi-Goal report", async () => {
    const response = makeStreamResponse([
      'data: {"type":"final","goal_report":{"checkin":"achieved","response":"untouched"},"learner_asked_back":true}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      {
        type: "final",
        goal_report: { checkin: "achieved", response: "untouched" },
        learner_asked_back: true,
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
      'data: {"type":"final","goal_report":{"greeting":"failed"},"learner_asked_back":false}\n\n';
    // Split well before the frame's trailing "\n\n" boundary, so this
    // genuinely exercises the buffer's cross-chunk reassembly rather than
    // happening to split on a frame boundary already.
    const splitPoint = 40;

    const response = makeStreamResponse([fullFrame.slice(0, splitPoint), fullFrame.slice(splitPoint)]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "final", goal_report: { greeting: "failed" }, learner_asked_back: false },
    ]);
  });

  it("silently skips a malformed data line without throwing", async () => {
    const response = makeStreamResponse([
      "data: {this is not valid json\n\n",
      'data: {"type":"final","goal_report":{"greeting":"achieved"},"learner_asked_back":false}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await expect(
      parseTurnEventStream(response, (event) => events.push(event)),
    ).resolves.toBeUndefined();

    // The malformed frame produced no event; the valid frame after it still did.
    expect(events).toEqual([
      { type: "final", goal_report: { greeting: "achieved" }, learner_asked_back: false },
    ]);
  });

  it("rejects a final event missing learner_asked_back", async () => {
    const response = makeStreamResponse([
      'data: {"type":"final","goal_report":{"greeting":"achieved"}}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([]);
  });

  it("rejects a final event missing goal_report (the pre-#47 verdict shape)", async () => {
    const response = makeStreamResponse([
      'data: {"type":"final","verdict":"accepted","learner_asked_back":false}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([]);
  });

  it("rejects a final event whose goal_report carries a value that is none of the three", async () => {
    const response = makeStreamResponse([
      'data: {"type":"final","goal_report":{"greeting":"accepted"},"learner_asked_back":false}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([]);
  });

  it("accepts a report naming a Goal outside the open set — dropped later, never invalid (ADR-0012)", async () => {
    const response = makeStreamResponse([
      'data: {"type":"final","goal_report":{"greeting":"achieved","pizza":"achieved"},"learner_asked_back":false}\n\n',
    ]);

    const events: PracticeTurnStreamEvent[] = [];
    await parseTurnEventStream(response, (event) => events.push(event));

    expect(events).toEqual([
      {
        type: "final",
        goal_report: { greeting: "achieved", pizza: "achieved" },
        learner_asked_back: false,
      },
    ]);
  });
});
