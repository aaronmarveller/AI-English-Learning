import { NextResponse } from "next/server";
import {
  isActiveConversationState,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import {
  InvalidModelOutputError,
  judgeTurn,
  type HistoryTurn,
} from "@/lib/practice-judge";

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

  try {
    const result = await judgeTurn({
      apiKey,
      state: parsed.state,
      message: parsed.message,
      history: parsed.history,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidModelOutputError) {
      console.error(error.message);
      return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
    }
    console.error("practice/turn: upstream Anthropic API error", error);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
