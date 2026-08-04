import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  isActiveConversationState,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import {
  GLOBAL_SYSTEM_RULES,
  HIGHLIGHT_KEYS,
  buildStateSystemPromptSection,
  type HighlightKey,
} from "@/content/practice";

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
 * Single call + forced structured output via Claude's tool-use mechanism
 * (spec.md: "单次调用 + 强制结构化输出（不做「先判定后生成」的两跳，口语练习
 * 对首字延迟极敏感）"). `tool_choice` forces the model to call
 * `submit_turn_result`, so every response is the four contracted fields —
 * verdict / reply_en / reply_zh / highlight_key — never free text to parse
 * out of a completion.
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

/** spec.md "三个适配层": Anthropic `claude-haiku-4-5-20251001` for this ticket's LLM adapter. */
const MODEL_ID = "claude-haiku-4-5-20251001";

const VERDICTS = ["accepted", "needs_retry", "off_topic"] as const;
type Verdict = (typeof VERDICTS)[number];

type HistoryTurn = { role: "user" | "assistant"; content: string };

type TurnRequestBody = {
  state: ActiveConversationState;
  message: string;
  history: HistoryTurn[];
};

type TurnResult = {
  verdict: Verdict;
  reply_en: string;
  reply_zh: string;
  highlight_key: HighlightKey;
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

function isTurnResult(value: unknown): value is TurnResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.verdict === "string" &&
    (VERDICTS as readonly string[]).includes(v.verdict) &&
    typeof v.reply_en === "string" &&
    typeof v.reply_zh === "string" &&
    typeof v.highlight_key === "string" &&
    (HIGHLIGHT_KEYS as readonly string[]).includes(v.highlight_key)
  );
}

/**
 * The single tool the model is forced to call via `tool_choice`. This is
 * the structured-output mechanism (spec.md: "强制结构化输出") — we never do
 * a free-text completion and try to parse JSON out of it.
 */
const SUBMIT_TURN_RESULT_TOOL: Anthropic.Tool = {
  name: "submit_turn_result",
  description:
    "Submit the structured result for this Practice conversation turn: your verdict on the learner's message, your reply as Emily, its Chinese translation, and a tag describing the learner's performance this turn.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: [...VERDICTS],
        description:
          'accepted: the learner communicated this state\'s intent (even in their own words, outside the Accepted Responses list). needs_retry: the attempt did not yet communicate the intent. off_topic: the learner said something unrelated to the current step.',
      },
      reply_en: {
        type: "string",
        description: "Emily's reply in English. At most 20 words, at most one question.",
      },
      reply_zh: {
        type: "string",
        description: "Chinese translation of reply_en.",
      },
      highlight_key: {
        type: "string",
        enum: [...HIGHLIGHT_KEYS],
        description: "A short tag describing the learner's performance this turn.",
      },
    },
    required: ["verdict", "reply_en", "reply_zh", "highlight_key"],
    additionalProperties: false,
  },
  strict: true,
};

function buildSystemPrompt(state: ActiveConversationState): string {
  return `${GLOBAL_SYSTEM_RULES}\n\n${buildStateSystemPromptSection(state)}`;
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

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: buildSystemPrompt(parsed.state),
      messages: [
        ...parsed.history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user" as const, content: parsed.message },
      ],
      tools: [SUBMIT_TURN_RESULT_TOOL],
      tool_choice: { type: "tool", name: "submit_turn_result" },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (!toolUse || !isTurnResult(toolUse.input)) {
      console.error(
        "practice/turn: model did not return a valid submit_turn_result call",
        JSON.stringify(response.content),
      );
      return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
    }

    const result: TurnResult = toolUse.input;
    return NextResponse.json(result);
  } catch (error) {
    console.error("practice/turn: upstream Anthropic API error", error);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
