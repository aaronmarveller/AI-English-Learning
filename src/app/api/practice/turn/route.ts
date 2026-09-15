import { NextResponse } from "next/server";
import { isGoalProgress, unexpectedGoalReportKeys, type GoalProgress } from "@/lib/goal-progress";
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
 * Request body (issue #47): `{ goalProgress: ActiveConversationState[],
 * message: string, history?: { role: "user" | "assistant"; content: string
 * }[] }` — the client sends the set of Conversation Goals achieved so far
 * (ADR-0012) in place of the single Conversation State it used to send.
 * `history` is the prior transcript (Emily's lines as "assistant", the
 * learner's prior turns as "user") — passed so the model has enough context
 * to judge, e.g. whether a Goal was attempted and failed before, or whether
 * the learner has wandered off the topic and come back.
 *
 * Response (issue #5 — real streaming instead of one blocking
 * response after the whole model call completes): `text/event-stream`
 * (Server-Sent Events). The stream opens immediately (before `judgeTurn`'s
 * promise resolves) and carries exactly one event, one JSON payload per
 * `data:` line:
 *
 *   - `{"type":"final","goal_report":...,"learner_asked_back":...}` —
 *     exactly one, once the complete response has been validated. This is
 *     the only event the client commits to the Practice store. Issue #16
 *     removed the `partial` event entirely — Emily's reply text is no longer
 *     model-generated (the client selects it from the current Lesson's
 *     Conversation Script pools; see src/lib/emily-reply-selector.ts), so
 *     there's no `reply_en` left to stream progress for. Issue #47 removed
 *     `verdict` from it: the client derives the Verdict from `goal_report`.
 *     The stream stays as transport for `final`/`error` regardless.
 *   - `{"type":"error","error":string}` — exactly one, in place of `final`,
 *     if `judgeTurn` rejects (`InvalidModelOutputError` or an upstream API
 *     error). HTTP status is always 200 by the time any of this is known,
 *     since the stream has already started — the error is encoded in the
 *     stream body instead, and the client treats an `error` event the same
 *     way it used to treat a non-2xx status or a malformed body.
 *
 * Exactly one of `final`/`error` is ever sent, and the stream is closed
 * immediately after.
 */

// Route Handlers run on the Node.js runtime by default in the App Router,
// but this is stated explicitly since the Anthropic SDK requires Node APIs
// (not the Edge runtime).
export const runtime = "nodejs";

type TurnRequestBody = {
  goalProgress: GoalProgress;
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
  if (!isGoalProgress(b.goalProgress)) return null;
  if (typeof b.message !== "string" || b.message.trim().length === 0) return null;
  const history = Array.isArray(b.history) ? b.history.filter(isHistoryTurn) : [];
  return { goalProgress: b.goalProgress, message: b.message, history };
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
        const result = await judgeTurn({
          apiKey,
          goalProgress: parsed.goalProgress,
          message: parsed.message,
          history: parsed.history,
        });
        // ADR-0012: a report key outside the open Goals — one already in Goal
        // Progress, or no Goal at all — is dropped silently by the client
        // (src/lib/goal-progress.ts), never treated as model misbehaviour.
        // This is the "logged server-side" half: whoever runs the server can
        // still see a prompt or schema whose reports are drifting.
        const unexpectedKeys = unexpectedGoalReportKeys(parsed.goalProgress, result.goal_report);
        if (unexpectedKeys.length > 0) {
          console.warn(
            `practice/turn: Goal Report named Goal(s) outside the open set: ${unexpectedKeys.join(", ")} — dropped`,
          );
        }
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
