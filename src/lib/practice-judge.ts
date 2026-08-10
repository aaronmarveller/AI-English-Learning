import Anthropic from "@anthropic-ai/sdk";
import { VERDICTS, type ActiveConversationState } from "@/lib/conversation-state-machine";
import { GLOBAL_SYSTEM_RULES, buildStateSystemPromptSection } from "@/content/practice";
import { isTurnResult, type HistoryTurn, type TurnResult } from "@/lib/practice-turn-protocol";

/**
 * Practice conversation-turn judging (ticket 08; issue #16). Single call +
 * forced structured output via Claude's tool-use mechanism — `tool_choice`
 * forces the model to call `submit_turn_result`, so every response is the
 * two contracted fields — verdict / learner_asked_back — never free text to
 * parse out of a completion.
 *
 * Issue #16 (docs/ai-configuration.md; ADR-0005): the model's contract
 * shrinks to exactly `verdict` and `learner_asked_back`. Emily no longer
 * improvises `reply_en`/`reply_zh`, and no longer self-tags a
 * `highlight_key` — the client selects Emily's line from the current
 * Lesson's fixed Conversation Script pools instead (see
 * src/lib/emily-reply-selector.ts). The streaming partial-reply mechanism
 * that used to relay `reply_en` as it arrived is gone with it — there is no
 * model-authored text left to stream.
 *
 * Extracted out of the HTTP route (src/app/api/practice/turn/route.ts) so
 * that the judgment-quality eval (scripts/eval-judgment.ts) calls this exact
 * same code path against the real API instead of reimplementing it — the
 * eval is only a meaningful regression guard for the system prompt if it
 * can't drift from what production actually sends.
 */

/** spec.md "三个适配层": Anthropic `claude-haiku-4-5-20251001` for this ticket's LLM adapter. */
export const MODEL_ID = "claude-haiku-4-5-20251001";

// HistoryTurn/TurnResult/isTurnResult live in practice-turn-protocol.ts — a
// zero-dependency module shared with the client (submit-practice-turn.ts) —
// so this file's `@anthropic-ai/sdk` import never has a reason to be pulled
// into a client bundle through them.

export type JudgeTurnInput = {
  apiKey: string;
  state: ActiveConversationState;
  message: string;
  history: HistoryTurn[];
};

/** The model call succeeded but didn't return a valid `submit_turn_result` payload. */
export class InvalidModelOutputError extends Error {}

/**
 * The single tool the model is forced to call via `tool_choice`. This is
 * the structured-output mechanism (spec.md: "强制结构化输出") — we never do
 * a free-text completion and try to parse JSON out of it.
 *
 * Issue #16: exactly two fields. The model's job is judging communicative
 * intent and detecting whether the learner asked a question back — nothing
 * about what Emily says next, which is entirely client-selected now.
 */
const SUBMIT_TURN_RESULT_TOOL: Anthropic.Tool = {
  name: "submit_turn_result",
  description:
    "Submit the structured result for this Practice conversation turn: your verdict on the learner's message, and whether the learner asked a question back.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: [...VERDICTS],
        description:
          'accepted: the learner communicated this state\'s intent (even in their own words, outside the Accepted Responses list). needs_retry: the attempt did not yet communicate the intent — including when the learner said something unrelated to the current step; off-topic input is judged needs_retry, never a separate value.',
      },
      learner_asked_back: {
        type: "boolean",
        description:
          'Whether the learner\'s message asked a question back to Emily (e.g. "How about you?", "And you?"). This only meaningfully changes Emily\'s next line during the Check-in state, but must accurately reflect the learner\'s actual message on every turn.',
      },
    },
    required: ["verdict", "learner_asked_back"],
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
 *
 * Issue #16 removed the `callbacks`/`onPartialReply` second argument that
 * used to exist here — there's no `reply_en` left to stream partial
 * progress for. `judgeTurn`'s signature is now just `(input) =>
 * Promise<TurnResult>`, which scripts/eval-judgment.ts already calls this
 * way, so it needed no changes.
 */
export async function judgeTurn({ apiKey, state, message, history }: JudgeTurnInput): Promise<TurnResult> {
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
