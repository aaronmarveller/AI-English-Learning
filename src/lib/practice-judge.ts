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
 *
 * Issue #5: the underlying call is now `client.messages.stream()`
 * instead of `client.messages.create()`, so the HTTP route can genuinely
 * stream progress to the client instead of blocking on the whole model
 * response — but `judgeTurn`'s own signature and `Promise<TurnResult>`
 * return contract are unchanged, so scripts/eval-judgment.ts (which calls
 * `judgeTurn(input)` with no second argument, expecting a plain resolved
 * promise) keeps working with zero modifications. The route opts into
 * incremental updates via the optional second `callbacks` argument, wired to
 * the SDK's `'inputJson'` event on the streamed forced tool call — see that
 * event's use below for why this is safe even though `tool_choice` forces
 * structured output.
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
 * The SSE wire contract src/app/api/practice/turn/route.ts streams to the
 * client (issue #5) — defined once here, next to `TurnResult`, so the route
 * and the client both import this single shape instead of each hand-writing
 * their own copy and risking silent protocol drift between them.
 */
export type PracticeTurnFinalEvent = { type: "final" } & TurnResult;

export type PracticeTurnStreamEvent =
  | PracticeTurnFinalEvent
  | { type: "partial"; reply_en: string }
  | { type: "error"; error: string };

/** Validates a parsed SSE payload against the `PracticeTurnStreamEvent` contract above. */
export function isPracticeTurnStreamEvent(value: unknown): value is PracticeTurnStreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === "partial") return typeof v.reply_en === "string";
  if (v.type === "error") return typeof v.error === "string";
  if (v.type === "final") return isTurnResult(v);
  return false;
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

/** Optional hooks for callers that want incremental progress while `judgeTurn` is in flight. */
export type JudgeTurnCallbacks = {
  /**
   * Fired zero or more times while the forced tool call's `reply_en` field is
   * still streaming in, with whatever prefix of it has arrived so far. Never
   * fired with the final, complete value — that only ever arrives via this
   * function's resolved `TurnResult` once the whole response is validated.
   * Backed by the Anthropic SDK's `'inputJson'` event (see
   * MessageStream.ts): its `jsonSnapshot` is already a best-effort PARSED
   * partial object (the SDK's own permissive partial-JSON parser), not raw
   * text — so reading a string field off it can't throw the way
   * `JSON.parse` on truncated text would.
   */
  onPartialReply?: (partialReplyEn: string) => void;
};

/**
 * Type guard for the shape `stream.on("inputJson", (_, jsonSnapshot) => ...)`
 * hands back mid-stream: a partial, possibly-incomplete object that may or
 * may not have picked up `reply_en` yet. Deliberately looser than
 * `isTurnResult` (no verdict/highlight_key/enum checks) since the whole
 * point is this can be an in-progress fragment.
 */
function hasPartialReplyEn(value: unknown): value is { reply_en: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.reply_en === "string";
}

/**
 * Calls the real Anthropic API for one Practice conversation turn and
 * returns the validated structured result. Rejects with the raw Anthropic
 * SDK error if the API call itself fails, or `InvalidModelOutputError` if
 * the model didn't return a valid `submit_turn_result` call — callers
 * (the HTTP route, the eval script) distinguish the latter to report
 * "the model misbehaved" separately from "the API call failed".
 *
 * Internally uses `client.messages.stream(...)` (ticket 14) rather than
 * `.create(...)` so the HTTP route can relay progress to the client as it
 * arrives; `tool_choice` behaves identically either way, and this function's
 * own return contract — a single resolved `Promise<TurnResult>`, once the
 * complete response has been validated — is unchanged, so existing callers
 * (scripts/eval-judgment.ts) need no changes and see no behavior difference.
 */
export async function judgeTurn(
  { apiKey, state, message, history }: JudgeTurnInput,
  callbacks?: JudgeTurnCallbacks,
): Promise<TurnResult> {
  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
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

  if (callbacks?.onPartialReply) {
    const onPartialReply = callbacks.onPartialReply;
    stream.on("inputJson", (_partialJson, jsonSnapshot) => {
      if (hasPartialReplyEn(jsonSnapshot)) {
        onPartialReply(jsonSnapshot.reply_en);
      }
    });
  }

  const response = await stream.finalMessage();

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
