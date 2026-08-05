import { NextResponse } from "next/server";
import {
  isActiveConversationState,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import { InvalidModelOutputError, judgeTurn } from "@/lib/practice-judge";
import type { HistoryTurn, PracticeTurnStreamEvent } from "@/lib/practice-turn-protocol";

/**
 * Practice conversation-turn proxy (ticket 08; spec.md "Implementation
 * Decisions" > "技术架构" and "大模型契约").
 *
 * This is the ONLY place `ANTHROPIC_API_KEY` is read. Route Handlers run
 * server-side only in Next.js — this file is never bundled for the client —
 * so the key never reaches the browser. See ticket 08's DoD: after
 * `npm run build`, the `.next` output is grepped for the literal string
 * `sk-ant-` and must come back with zero matches.
 *
 * The actual model call (system-prompt assembly, forced structured output,
 * response validation) lives in src/lib/practice-judge.ts — shared with
 * ticket 12's judgment-quality eval (scripts/eval-judgment.ts) so the eval
 * exercises the exact same code path production traffic does. This file is
 * just the HTTP wrapper: parse the request, read the server-only API key,
 * map judgeTurn's outcome to a response.
 *
 * Request body: `{ state: ActiveConversationState, message: string, history?:
 * { role: "user" | "assistant"; content: string }[] }`. `history` is the
 * prior transcript (Emily's lines as "assistant", the learner's prior turns
 * as "user") — passed so the model has enough context to judge, e.g.,
 * `recovered-after-retry` or `stayed-on-topic-after-detour` when a retry or
 * a detour happened earlier in the same state.
 *
 * Response (issue #5 — real streaming instead of one blocking
 * response after the whole model call completes): `text/event-stream`
 * (Server-Sent Events). The stream opens immediately (before `judgeTurn`'s
 * promise even resolves) and carries zero or more events, one JSON payload
 * per `data:` line:
 *
 *   - `{"type":"partial","reply_en":string}` — zero or more, as the forced
 *     tool call's `reply_en` field streams in from the model. Purely a
 *     progress signal; never authoritative and never itself committed to
 *     the Practice store.
 *   - `{"type":"final","verdict":...,"reply_en":...,"reply_zh":...,
 *     "highlight_key":...}` — exactly one, once the complete response has
 *     been validated. This is the only event the client commits to the
 *     Practice store.
 *   - `{"type":"error","error":string}` — exactly one, in place of `final`,
 *     if `judgeTurn` rejects (`InvalidModelOutputError` or an upstream API
 *     error). HTTP status is always 200 by the time any of this is known,
 *     since the stream has already started — the error is encoded in the
 *     stream body instead, and the client treats an `error` event the same
 *     way it used to treat a non-2xx status or a malformed body.
 *
 * Exactly one of `final`/`error` is ever sent, always as the last event,
 * and the stream is closed immediately after.
 */

// Route Handlers run on the Node.js runtime by default in the App Router,
// but this is stated explicitly since the Anthropic SDK requires Node APIs
// (not the Edge runtime).
export const runtime = "nodejs";

type TurnRequestBody = {
  state: ActiveConversationState;
  message: string;
  history: HistoryTurn[];
};

function isHistoryTurn(value: unknown): value is HistoryTurn {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.role === "user" || v.role === "assistant") && typeof v.content === "string";
}

function parseRequestBody(body: unknown): TurnRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!isActiveConversationState(b.state)) return null;
  if (typeof b.message !== "string" || b.message.trim().length === 0) return null;
  const history = Array.isArray(b.history) ? b.history.filter(isHistoryTurn) : [];
  return { state: b.state, message: b.message, history };
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseRequestBody(rawBody);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Server-only: this env var is never read from a Client Component, so it
  // never enters the client bundle. No real key exists in this dev
  // environment — that's expected; live calls fail auth at runtime, which
  // is fine since E2E stubs this whole route.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("practice/turn: ANTHROPIC_API_KEY is not set");
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function sendEvent(payload: PracticeTurnStreamEvent): void {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }

      try {
        const result = await judgeTurn(
          {
            apiKey,
            state: parsed.state,
            message: parsed.message,
            history: parsed.history,
          },
          {
            onPartialReply: (partialReplyEn) => {
              sendEvent({ type: "partial", reply_en: partialReplyEn });
            },
          },
        );
        sendEvent({ type: "final", ...result });
      } catch (error) {
        if (error instanceof InvalidModelOutputError) {
          console.error(error.message);
          sendEvent({ type: "error", error: "invalid_model_output" });
        } else {
          console.error("practice/turn: upstream Anthropic API error", error);
          sendEvent({ type: "error", error: "upstream_error" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
