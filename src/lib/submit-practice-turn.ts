import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import {
  isPracticeTurnStreamEvent,
  type HistoryTurn,
  type PracticeTurnStreamEvent,
  type TurnResult,
} from "@/lib/practice-turn-protocol";

/**
 * Client-side deep module for submitting one Practice conversation turn —
 * the symmetric counterpart to `judgeTurn` (src/lib/practice-judge.ts,
 * server-only). Like that module, this one owns everything about its side
 * of the seam (the fetch call, SSE framing, failure classification) behind
 * a small surface, so callers (practice-page-content.tsx) don't need to know
 * the wire format at all. This file has no `"use client"` directive — same
 * as src/lib/speech-recognition.ts — because it only exports plain
 * functions, not a component; Next.js only requires the directive on module
 * graphs that render.
 *
 * Only `@/lib/practice-turn-protocol` (zero-dependency) is imported here —
 * never `@/lib/practice-judge`, whose `@anthropic-ai/sdk` import must never
 * reach the browser bundle.
 */

const PRACTICE_TURN_ENDPOINT = "/api/practice/turn";

// --- Streamed turn response parsing --------------------------------------
//
// The `/api/practice/turn` route streams Server-Sent Events rather than one
// blocking JSON body (see that route's doc comment for the exact wire
// format). Exported (rather than kept private) so it can be unit-tested
// directly against a hand-built `Response`, without exercising the network
// call `submitPracticeTurn` wraps it in.

/**
 * Consumes `response.body` as Server-Sent Events, parsing out each `data:`
 * line's JSON payload as it arrives. Calls `onEvent` for every well-formed
 * event this module recognizes; malformed/unrecognized lines are silently
 * skipped — the caller decides what "the stream ended without ever
 * producing a valid final event" means for its own error handling.
 */
export async function parseTurnEventStream(
  response: Response,
  onEvent: (event: PracticeTurnStreamEvent) => void,
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error("practice turn response had no body to stream");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a single frame may itself
    // be split across chunks, so only split on complete "\n\n" boundaries
    // and keep any trailing partial frame in the buffer for the next read.
    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const jsonText = line.slice("data:".length).trim();
        if (!jsonText) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          continue;
        }
        if (isPracticeTurnStreamEvent(parsed)) {
          onEvent(parsed);
        }
      }
    }
  }
}

// --- submitPracticeTurn ----------------------------------------------------

export type SubmitTurnInput = {
  priorState: ActiveConversationState;
  message: string;
  history: HistoryTurn[];
};

export type SubmitTurnResult =
  | { ok: true; data: TurnResult }
  | {
      ok: false;
      reason: "request_failed" | "invalid_model_output" | "upstream_error" | "stream_ended_early" | "aborted";
    };

export type SubmitPracticeTurnOptions = {
  /** Fired zero or more times as Emily's reply streams in, before the final verdict lands. */
  onPartialReply?: (partialReplyEn: string) => void;
  /** Aborts the in-flight request (e.g. the page is unmounting). */
  signal?: AbortSignal;
};

/** The two `error` values route.ts's stream ever actually sends — passed through as-is, never remapped to a new name. */
function isKnownStreamErrorReason(value: string): value is "invalid_model_output" | "upstream_error" {
  return value === "invalid_model_output" || value === "upstream_error";
}

/**
 * Submits one Practice turn and resolves with a discriminated result —
 * never throws/rejects, so callers don't need a try/catch to tell "Emily
 * didn't get the message" apart from a genuine bug. Every failure mode
 * (network failure, non-2xx status, an `error` event on the stream, the
 * stream ending without ever sending `final`, or the caller aborting via
 * `options.signal`) collapses to `{ ok: false, reason }` with a distinct
 * `reason`, so a caller that wants to react differently to one particular
 * case (today, only "aborted" gets different treatment — see
 * practice-page-content.tsx) can, without everyone else having to.
 */
export async function submitPracticeTurn(
  input: SubmitTurnInput,
  options?: SubmitPracticeTurnOptions,
): Promise<SubmitTurnResult> {
  let response: Response;
  try {
    response = await fetch(PRACTICE_TURN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: input.priorState,
        message: input.message,
        history: input.history,
      }),
      signal: options?.signal,
    });
  } catch (error) {
    const wasAborted =
      options?.signal?.aborted === true ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error as { name?: unknown } | null)?.name === "AbortError";
    return wasAborted ? { ok: false, reason: "aborted" } : { ok: false, reason: "request_failed" };
  }

  if (!response.ok) {
    return { ok: false, reason: "request_failed" };
  }

  // The route streams Server-Sent Events rather than one blocking JSON body
  // (issue #5). `final` is the one event that gets committed by the caller —
  // exactly once — and `error` (or the stream simply ending without ever
  // sending `final`) is reported back as a distinct failure reason instead.
  let finalResult: TurnResult | null = null;
  let streamError: "invalid_model_output" | "upstream_error" | null = null;
  await parseTurnEventStream(response, (event) => {
    if (event.type === "final") {
      // Strip the `final` discriminant — SubmitTurnResult's own `ok: true`
      // already carries that role, so `data` is just the plain TurnResult.
      finalResult = {
        verdict: event.verdict,
        reply_en: event.reply_en,
        reply_zh: event.reply_zh,
        highlight_key: event.highlight_key,
      };
    } else if (event.type === "error") {
      if (isKnownStreamErrorReason(event.error)) {
        streamError = event.error;
      }
    } else {
      options?.onPartialReply?.(event.reply_en);
    }
  });

  if (streamError) {
    return { ok: false, reason: streamError };
  }
  if (!finalResult) {
    return { ok: false, reason: "stream_ended_early" };
  }

  return { ok: true, data: finalResult };
}
