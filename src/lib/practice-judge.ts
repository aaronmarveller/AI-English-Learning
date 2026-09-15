import Anthropic from "@anthropic-ai/sdk";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";
import { getOpenGoals, type GoalProgress } from "@/lib/goal-progress";
import { GLOBAL_SYSTEM_RULES, buildGoalSetSystemPromptSection } from "@/content/practice";
import {
  GOAL_REPORT_VALUES,
  isTurnResult,
  type HistoryTurn,
  type TurnResult,
} from "@/lib/practice-turn-protocol";

/**
 * Practice conversation-turn judging (ticket 08; issue #16; issue #47).
 * Single call + forced structured output via Claude's tool-use mechanism —
 * `tool_choice` forces the model to call `submit_turn_result`, so every
 * response is the two contracted fields — `goal_report` /
 * `learner_asked_back` — never free text to parse out of a completion.
 *
 * Issue #16 (docs/ai-configuration.md; ADR-0005): Emily no longer improvises
 * `reply_en`/`reply_zh`, and no longer self-tags a `highlight_key` — the
 * client selects Emily's line from the current Lesson's fixed Conversation
 * Script pools instead (see src/lib/emily-reply-selector.ts). The streaming
 * partial-reply mechanism that used to relay `reply_en` as it arrived is gone
 * with it — there is no model-authored text left to stream.
 *
 * Issue #47 (ADR-0012): the request carries Goal Progress instead of one
 * Conversation State, and the model no longer returns a `verdict` — it
 * returns a **Goal Report** over the *open* Goals, from which the client
 * derives the Verdict (src/lib/goal-progress.ts's `deriveVerdict`). "Over the
 * open Goals" is enforced structurally, not only by prompt wording: the
 * `goal_report` object's properties are built per request from
 * `getOpenGoals(goalProgress)`, so under `strict: true` the model cannot even
 * emit an entry for a Goal it wasn't asked about. Accepting a report that
 * does anyway (a non-strict fallback, a future caller handing in a wider
 * report) is the *client's* job — see src/lib/practice-turn-protocol.ts's
 * `isGoalReport` and src/lib/goal-progress.ts's `applyGoalReport`.
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
  /** The set of Conversation Goals achieved so far — the wire's replacement for the old single Conversation State (issue #47). */
  goalProgress: GoalProgress;
  message: string;
  history: HistoryTurn[];
};

/** The model call succeeded but didn't return a valid `submit_turn_result` payload. */
export class InvalidModelOutputError extends Error {}

/** The single tool the model is forced to call via `tool_choice` (spec.md: "强制结构化输出"). */
const SUBMIT_TURN_RESULT_TOOL_NAME = "submit_turn_result";

/**
 * The single tool the model is forced to call via `tool_choice`. This is
 * the structured-output mechanism — we never do a free-text completion and
 * try to parse JSON out of it.
 *
 * Built per request (issue #47) because `goal_report`'s properties *are* the
 * open Goals: one required entry, per open Goal, of `achieved` / `failed` /
 * `untouched`. A Goal already in Goal Progress is absent from the schema
 * entirely, which is how "the Judge is only ever asked about open Goals"
 * (ADR-0012) holds even if the model wanted to re-credit one. `strict: true`
 * constrains decoding to this schema, which is also why the per-Goal entries
 * are enumerated here rather than described once in prose: a Goal the learner
 * already achieved cannot be reported at all, recredited or otherwise.
 *
 * An empty open set (never sent in practice — the client stops submitting once
 * Practice is complete, docs/ai-configuration.md section 4) degenerates to an
 * empty report object, which derives to `needs_retry` like any other report
 * that achieves nothing.
 */
function buildSubmitTurnResultTool(openGoals: ActiveConversationState[]): Anthropic.Tool {
  return {
    name: SUBMIT_TURN_RESULT_TOOL_NAME,
    description:
      "Submit the structured result for this Practice conversation turn: your Goal Report on the learner's message for each open Conversation Goal, and whether the learner asked a question back.",
    input_schema: {
      type: "object",
      properties: {
        goal_report: {
          type: "object",
          description:
            'One entry per open Conversation Goal listed here. "achieved": the learner\'s message communicated this Goal\'s intent — in their own words or not, prompted by Emily or not. "failed": the message recognisably attempted this Goal\'s intent but did not communicate it; grammar alone never makes an attempt "failed". "untouched": the message did not attempt this Goal — unrelated chatter, filler, and a bare "Yes." are all "untouched", never "failed".',
          properties: Object.fromEntries(
            openGoals.map((goal) => [
              goal,
              {
                type: "string",
                enum: [...GOAL_REPORT_VALUES],
                description: `Your report for the open "${goal}" Conversation Goal.`,
              },
            ]),
          ),
          required: [...openGoals],
          additionalProperties: false,
        },
        learner_asked_back: {
          type: "boolean",
          description:
            'Whether the learner\'s message asked a question back to Emily (e.g. "How about you?", "And you?"). This only meaningfully changes Emily\'s next line right after the learner answers how they are, but must accurately reflect the learner\'s actual message on every turn.',
        },
      },
      required: ["goal_report", "learner_asked_back"],
      additionalProperties: false,
    },
    strict: true,
  };
}

function buildSystemPrompt(goalProgress: GoalProgress): string {
  return `${GLOBAL_SYSTEM_RULES}\n\n${buildGoalSetSystemPromptSection(goalProgress)}`;
}

/**
 * Calls the real Anthropic API for one Practice conversation turn and
 * returns the validated structured result. Rejects with the raw Anthropic
 * SDK error if the API call itself fails, or `InvalidModelOutputError` if
 * the model didn't return a valid `submit_turn_result` call — callers
 * (the HTTP route, the eval script) distinguish the latter to report
 * "the model misbehaved" separately from "the API call failed".
 *
 * Issue #47: `goalProgress` in, a `Goal Report` out. No Verdict is produced
 * anywhere in this module — that is derived from the report on the client
 * (src/lib/goal-progress.ts's `deriveVerdict`), so the model can never state
 * one and have it contradict the report it came with.
 */
export async function judgeTurn({
  apiKey,
  goalProgress,
  message,
  history,
}: JudgeTurnInput): Promise<TurnResult> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system: buildSystemPrompt(goalProgress),
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: message },
    ],
    tools: [buildSubmitTurnResultTool(getOpenGoals(goalProgress))],
    tool_choice: { type: "tool", name: SUBMIT_TURN_RESULT_TOOL_NAME },
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
