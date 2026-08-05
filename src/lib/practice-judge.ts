import Anthropic from "@anthropic-ai/sdk";
import {
  VERDICTS,
  type ActiveConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";
import {
  GLOBAL_SYSTEM_RULES,
  HIGHLIGHT_KEYS,
  buildStateSystemPromptSection,
  type HighlightKey,
} from "@/content/practice";

/**
 * Practice conversation-turn judging (ticket 08; spec.md "Implementation
 * Decisions" > "大模型契约"). Single call + forced structured output via
 * Claude's tool-use mechanism — `tool_choice` forces the model to call
 * `submit_turn_result`, so every response is the four contracted fields —
 * verdict / reply_en / reply_zh / highlight_key — never free text to parse
 * out of a completion.
 *
 * Extracted out of the HTTP route (src/app/api/practice/turn/route.ts) so
 * that ticket 12's judgment-quality eval (scripts/eval-judgment.ts) calls
 * this exact same code path against the real API instead of reimplementing
 * it — the eval is only a meaningful regression guard for the system prompt
 * if it can't drift from what production actually sends.
 */

/** spec.md "三个适配层": Anthropic `claude-haiku-4-5-20251001` for this ticket's LLM adapter. */
export const MODEL_ID = "claude-haiku-4-5-20251001";

export type HistoryTurn = { role: "user" | "assistant"; content: string };

export type TurnResult = {
  verdict: Verdict;
  reply_en: string;
  reply_zh: string;
  highlight_key: HighlightKey;
};

export type JudgeTurnInput = {
  apiKey: string;
  state: ActiveConversationState;
  message: string;
  history: HistoryTurn[];
};

/** The model call succeeded but didn't return a valid `submit_turn_result` payload. */
export class InvalidModelOutputError extends Error {}

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

/**
 * Calls the real Anthropic API for one Practice conversation turn and
 * returns the validated structured result. Rejects with the raw Anthropic
 * SDK error if the API call itself fails, or `InvalidModelOutputError` if
 * the model didn't return a valid `submit_turn_result` call — callers
 * (the HTTP route, the eval script) distinguish the latter to report
 * "the model misbehaved" separately from "the API call failed".
 */
export async function judgeTurn({
  apiKey,
  state,
  message,
  history,
}: JudgeTurnInput): Promise<TurnResult> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system: buildSystemPrompt(state),
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: message },
    ],
    tools: [SUBMIT_TURN_RESULT_TOOL],
    tool_choice: { type: "tool", name: "submit_turn_result" },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse || !isTurnResult(toolUse.input)) {
    throw new InvalidModelOutputError(
      `practice/turn: model did not return a valid submit_turn_result call: ${JSON.stringify(response.content)}`,
    );
  }

  return toolUse.input;
}
