/**
 * Practice page content — the Conversation State Machine's per-state script
 * (Learning Goal + Accepted Responses whitelist), the LLM system-prompt
 * copy, the fixed opening-line pool, and the highlight_key taxonomy (ticket
 * 08; spec.md "Solution", "Implementation Decisions" > "大模型契约" /
 * "Practice 页交互模型" / "语言口径", "语音合成").
 *
 * Single data source, same discipline as src/content/explore.ts: the
 * Practice page components and src/app/api/practice/turn/route.ts only
 * consume these exports, never hardcode copy inline.
 *
 * Content continuity with Explore (ticket 06, src/content/explore.ts):
 * Practice is "now have that conversation using what you just learned," so
 * each state's Accepted Responses whitelist below is drawn directly from
 * Explore's matching expression category — same phrases, so the learner
 * recognizes this conversation as the thing they just rehearsed there.
 */

import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import {
  CHECKIN_EXPRESSIONS,
  CLOSING_EXPRESSIONS,
  GREETING_EXPRESSIONS,
  RESPONSE_COMBO,
  RESPONSE_STEPS,
} from "@/content/explore";

// --- Opening line (NOT LLM-generated — see spec.md "语音合成") -----------

export type OpeningLine = {
  id: string;
  /** English opening line, spoken as Emily's very first message. */
  en: string;
  /** Chinese translation — shown by default for this one message only
   * (spec.md "语言口径": "第一条 Opening Message 默认展开中文，降低初次入场门槛"). */
  zh: string;
};

/**
 * Fixed pool of 5 hand-written opening-greeting variants, one picked at
 * random client-side on page mount (see practice-state.ts's
 * `ensureOpeningMessage`). There is no learner input yet on page load to
 * send to the model, so this line is never LLM-generated — every other
 * Emily line (the reply after each learner turn) legitimately comes from
 * the LLM call instead.
 *
 * spec.md's "语音合成" section documents Emily's opening line as one of a
 * fixed pool of 5 (for ticket 13's audio-pregeneration work, not this
 * ticket's concern) — this pool is that same fixed set, authored here.
 */
export const OPENING_LINES: OpeningLine[] = [
  {
    id: "opening-1",
    en: "Hi there! Nice to see you this morning.",
    zh: "嗨！早上好呀，很高兴见到你。",
  },
  {
    id: "opening-2",
    en: "Good morning! Beautiful day, isn't it?",
    zh: "早上好！今天天气真不错，是吧？",
  },
  {
    id: "opening-3",
    en: "Hey there! Fancy running into you here.",
    zh: "嘿！没想到会在这儿遇到你。",
  },
  {
    id: "opening-4",
    en: "Hi! I don't think we've properly met — I'm Emily.",
    zh: "嗨！我们好像还没正式认识过——我是 Emily。",
  },
  {
    id: "opening-5",
    en: "Morning! Off to work already?",
    zh: "早呀！这么早就要去上班啦？",
  },
];

/** Picks one of the 5 opening-line variants at random. */
export function pickRandomOpeningLine(): OpeningLine {
  const index = Math.floor(Math.random() * OPENING_LINES.length);
  return OPENING_LINES[index];
}

// --- Per-state script: Learning Goal + Accepted Responses whitelist ------

export type PracticeStateScript = {
  state: ActiveConversationState;
  /** Chinese label for UI (the 4-step progress tracker). */
  labelZh: string;
  /** English label for UI / system-prompt reference. */
  labelEn: string;
  /**
   * Short instruction fed into the system prompt: what Emily's line into
   * this state was doing, and what the learner's turn is expected to do.
   */
  learningGoal: string;
  /**
   * Example correct answers for this turn. Per spec.md's single most
   * load-bearing acceptance point ("判定以沟通意图为准，不以字面匹配为准"),
   * natural equivalents outside this list must still be judged "accepted" —
   * this whitelist is guidance for the model, not an exhaustive match list.
   * Drawn directly from src/content/explore.ts's matching category for
   * content continuity between Explore and Practice.
   */
  acceptedResponses: string[];
};

/**
 * The conversation's natural shape, beat by beat (spec.md "Practice 页交互模型"
 * + this ticket's explicit guidance): Emily opens with a greeting (the fixed
 * pool above) → learner greets back (`greeting`) → Emily asks how the
 * learner is doing → learner acknowledges and/or asks the check-in question
 * back (`checkin`) → Emily answers and reciprocates the question → learner
 * replies with the short 3-part combo (`response`) → Emily signals wrapping
 * up → learner says goodbye (`closing`) → Emily gives a brief closing
 * encouragement and invites the learner to view their summary.
 */
export const PRACTICE_SCRIPT: Record<ActiveConversationState, PracticeStateScript> = {
  greeting: {
    state: "greeting",
    labelZh: "打招呼",
    labelEn: "Greeting",
    learningGoal:
      "You just greeted the learner as your opening line. The learner's job this turn is to greet you back in a natural, friendly way.",
    acceptedResponses: GREETING_EXPRESSIONS.map((expression) => expression.expression),
  },
  checkin: {
    state: "checkin",
    labelZh: "问候",
    labelEn: "Check-in",
    learningGoal:
      "You just asked the learner how they are doing. The learner's job this turn is to acknowledge that and/or ask a check-in question back to you (e.g. how you are doing).",
    acceptedResponses: CHECKIN_EXPRESSIONS.map((expression) => expression.expression),
  },
  response: {
    state: "response",
    labelZh: "回应",
    labelEn: "Response",
    learningGoal:
      "You just answered and asked the learner how they are doing in return. The learner's job this turn is to answer briefly, optionally ask back, and add one short natural detail about themselves — a short 3-part reply said together as one turn.",
    acceptedResponses: [
      ...RESPONSE_STEPS.map((step) => step.expression),
      RESPONSE_COMBO.expression,
    ],
  },
  closing: {
    state: "closing",
    labelZh: "结束",
    labelEn: "Closing",
    learningGoal:
      "You just signaled that the conversation is wrapping up (e.g. that you both need to get going). The learner's job this turn is to say goodbye in a natural, friendly way.",
    acceptedResponses: CLOSING_EXPRESSIONS.map((expression) => expression.expression),
  },
};

/** Convenience re-export — the 4 states in fixed display order. */
export const PRACTICE_STEP_ORDER = ACTIVE_CONVERSATION_STATES;

// --- System prompt copy (spec.md "大模型契约") -----------------------------

/**
 * The six global rules that make up part 1 of the system prompt (Role /
 * Personality / Speaking Style / Global Conversation Rules / Global
 * Feedback Rules / Global Constraints). Authored fresh for this repo —
 * there is no separate "AI Configuration" document here; spec.md's
 * "Solution" and "Implementation Decisions" > "大模型契约" sections are the
 * source of truth these rules are grounded in.
 *
 * Combined with the current state's section (see
 * `buildStateSystemPromptSection` below) by
 * src/app/api/practice/turn/route.ts to form the full system prompt sent
 * on every turn.
 */
export const GLOBAL_SYSTEM_RULES = `
## Role
You are Emily, a friendly neighbor chatting with a learner inside a mobile English-learning app called "Greeting Somebody." You are not a teacher and not an examiner — you are simply having a short, real conversation with someone practicing their English.

## Personality
Warm, patient, and encouraging. You enjoy this small daily chat and never make the learner feel rushed, tested, or judged.

## Speaking Style
- Use only A1-A2 level vocabulary — simple, everyday words a beginner already knows.
- Keep every reply to at most 20 English words.
- Ask at most one question per reply.

## Global Conversation Rules
Judge the learner's message by communicative intent, not literal wording or grammar. A natural phrase outside the "Accepted Responses" list below that correctly communicates the intent MUST be judged "accepted". Minor grammar, word-order, or spelling mistakes never affect the verdict on their own — only whether the meaning came through matters.

## Global Feedback Rules
- verdict "accepted": reply naturally as Emily and move the conversation forward to the next beat described in the current state's Learning Goal.
- verdict "needs_retry": warmly encourage another try and gently point the learner back at what this step is asking for, without ever revealing the exact expected answer.
- verdict "off_topic": first acknowledge what the learner actually said, then gently steer the conversation back to the current step. Never use negative, critical, or judgmental language, and never point out grammar mistakes.

## Global Constraints
- Stay strictly within this lesson's neighbor-greeting topic. Never open into free-form, open-ended chat about anything else.
- Never reveal the exact expected answer, even while encouraging a retry.
`.trim();

/** Builds part 2 of the system prompt: the current Conversation State's Learning Goal + Accepted Responses whitelist. */
export function buildStateSystemPromptSection(state: ActiveConversationState): string {
  const script = PRACTICE_SCRIPT[state];
  const whitelist = script.acceptedResponses.map((phrase) => `- "${phrase}"`).join("\n");
  return `
## Current Conversation State: ${state} (${script.labelEn})
Learning Goal: ${script.learningGoal}

Accepted Responses (example correct answers for this turn — natural equivalents outside this list must also be judged "accepted" per the Global Conversation Rules above):
${whitelist}
`.trim();
}

// --- highlight_key taxonomy ------------------------------------------------

/**
 * The full set of `highlight_key` tags the model may attach to a turn's
 * structured result (spec.md "大模型契约": every turn returns "本轮表现标记，
 * 累积供 Review 选模板"). The Practice store (src/lib/practice-state.ts)
 * accumulates these across the conversation as `highlightKeys: HighlightKey[]`.
 *
 * CONTRACT for ticket 11 (Review page): import `HIGHLIGHT_KEYS` /
 * `HighlightKey` from here and match against these exact string values to
 * select feedback templates from the accumulated `highlightKeys` array
 * exposed by `usePractice()`. Keep additions backward compatible — don't
 * rename or remove an existing key once Review depends on it.
 */
export const HIGHLIGHT_KEYS = [
  /** accepted — the learner said (or closely echoed) one of the Accepted Responses. */
  "used-whitelist-phrase",
  /** accepted — the learner communicated the right intent in their own words, outside
   * the whitelist. This is the MVP's core risk bet (spec.md "已识别的风险" #1: whether
   * haiku accepts natural phrasing beyond the whitelist) — a healthy conversation
   * should produce this key often. */
  "natural-paraphrase",
  /** accepted — the learner's turn included extra natural detail beyond the minimum
   * (e.g. the full 3-part response combo, or an added remark of their own). */
  "confident-full-turn",
  /** accepted — this state needed at least one prior needs_retry before the learner got there. */
  "recovered-after-retry",
  /** accepted — the learner went off-topic earlier in this state and was gently
   * steered back before succeeding. */
  "stayed-on-topic-after-detour",
  /** needs_retry — the learner's attempt didn't yet communicate this state's intent. */
  "needs-more-practice",
  /** off_topic — the learner said something unrelated to the current step. */
  "went-off-topic",
] as const;

export type HighlightKey = (typeof HIGHLIGHT_KEYS)[number];
