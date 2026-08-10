/**
 * The Lesson structure (ticket 14; spec.md "Implementation Decisions" >
 * "Lesson parameterisation, deliberately shallow"): everything specific to
 * the "Greeting Somebody" Lesson — its Conversation Script pools, Accepted
 * Responses, learning goals, and Chinese help content — lives here, separate
 * from Emily's global personality/constraint rules (GLOBAL_SYSTEM_RULES,
 * still in src/content/practice.ts).
 *
 * Deliberately shallow (spec.md, same section): this file holds exactly one
 * Lesson (`GREETING_SOMEBODY_LESSON`). No variable step counts, no
 * lesson-scoped routing, no lesson-scoped storage keys, no per-lesson
 * progress — the four-state Conversation State flow
 * (`ACTIVE_CONVERSATION_STATES` in conversation-state-machine.ts) stays a
 * fixed literal. Building a multi-lesson abstraction now, against a single
 * example whose conversational shape is the only one that exists, would
 * almost certainly be wrong — see issue #12's "Out of Scope".
 *
 * Issue #16 (docs/ai-configuration.md section 3; ADR-0005 "verbatim
 * Conversation Script, not model-generated"): Emily stops improvising.
 * Every English sentence she speaks — on `accepted` and on `needs_retry` —
 * is now selected at random from a fixed pool that lives on this Lesson,
 * never paraphrased or composed. This file grew four new pools
 * (`checkinLines`, `responseLines`, `closingLines`, `needsRetryLines` per
 * state) and turned the old single silence-timeout line into a 3-line pool
 * (`silenceNudgeLines`) — every one of them copied verbatim from
 * docs/ai-configuration.md section 3, with Chinese translations authored
 * fresh here (the AI Configuration doc only specifies the English). The
 * opening-line and completion-message pools are unchanged (spec.md's own
 * table: "existing pool, unchanged"). Selection itself lives in
 * src/lib/emily-reply-selector.ts, not here — this file only owns content.
 */

import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import { CONVERSATION_STAGE_LABELS } from "@/content/conversation-stages";
import { CLOSING_EXPRESSIONS } from "@/content/explore";

/**
 * One English line + its Chinese translation — the shape every Conversation
 * Script pool below is made of (issue #16). Distinct from `OpeningLine`
 * (which additionally carries an `id` for audio-manifest lookup, ticket 13's
 * concern, not this ticket's) even though the two shapes coincide today.
 */
export type ScriptLine = { en: string; zh: string };

// --- Opening line (NOT LLM-generated — see spec.md "语音合成") -----------

export type OpeningLine = {
  id: string;
  /** English opening line, spoken as Emily's very first message. */
  en: string;
  /** Chinese translation — available through the per-message subtitle
   * toggle; AI Configuration keeps it hidden by default. */
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
const OPENING_LINES: OpeningLine[] = [
  {
    id: "opening-1",
    en: "Hi!",
    zh: "嗨！",
  },
  {
    id: "opening-2",
    en: "Hello!",
    zh: "你好！",
  },
  {
    id: "opening-3",
    en: "Good morning!",
    zh: "早上好！",
  },
  {
    id: "opening-4",
    en: "Good afternoon!",
    zh: "下午好！",
  },
  {
    id: "opening-5",
    en: "Good evening!",
    zh: "晚上好！",
  },
];

/**
 * The fixed completion-message library from AI Configuration section ②.
 * Emily selects one entry verbatim client-side (src/lib/emily-reply-selector.ts)
 * when an accepted Closing turn advances the conversation to "complete" —
 * unchanged by issue #16 (spec.md's own table: "existing completion pool,
 * unchanged"), just no longer selected by the model. English-only, same as
 * before ticket 16 — the model used to supply its own `reply_zh` translation
 * for whichever entry it picked; now that selection is client-side, there is
 * no accompanying Chinese translation authored for this pool specifically.
 */
const COMPLETION_MESSAGES = [
  "Great job! Let's check your learning summary.",
  "Nice work! Let's see what you learned today.",
  "Well done! Time to review today's lesson.",
] as const;

// --- Conversation Script pools added by issue #16 (docs/ai-configuration.md
// section 3) — verbatim English from that document, Chinese translations
// authored fresh here. Emily selects one line at random from the pool that
// matches the Conversation State she's entering (see
// src/lib/emily-reply-selector.ts); she never paraphrases or composes. ------

/** Check-in (3) — spoken entering the `checkin` state, after an accepted `greeting` turn. */
const CHECKIN_LINES: ScriptLine[] = [
  { en: "How are you doing today?", zh: "你今天过得怎么样？" },
  { en: "How's it going?", zh: "最近怎么样？" },
  { en: "How have you been?", zh: "你最近过得如何？" },
];

/**
 * Response (6 total, split into two sub-pools) — spoken entering the
 * `response` state, after an accepted `checkin` turn. Which sub-pool Emily
 * draws from is decided by `learner_asked_back` (the Judge's boolean for
 * that same `checkin` turn) — never a random pick across both, since a plain
 * acknowledgement and a reply that answers a returned question aren't
 * interchangeable (issue #16 acceptance criteria: a learner who didn't ask
 * back must never hear "thanks for asking"; a learner who did must always
 * hear an answer).
 */
const RESPONSE_LINES: { didNotAskBack: ScriptLine[]; askedBack: ScriptLine[] } = {
  didNotAskBack: [
    { en: "Glad to hear that!", zh: "很高兴听你这么说！" },
    { en: "That's great to hear.", zh: "太好了，真为你高兴。" },
    { en: "Nice, thanks for sharing!", zh: "真好，谢谢你告诉我！" },
  ],
  askedBack: [
    { en: "I'm doing well too, thanks for asking!", zh: "我也过得不错，谢谢你问起！" },
    { en: "I'm good too — thanks for asking!", zh: "我也挺好的——谢谢关心！" },
    { en: "Pretty good, thank you!", zh: "我也很好，谢谢！" },
  ],
};

/** Closing (4) — spoken entering the `closing` state, after an accepted `response` turn. */
const CLOSING_LINES: ScriptLine[] = [
  { en: "See you!", zh: "再见啦！" },
  { en: "Have a nice day!", zh: "祝你今天愉快！" },
  { en: "Bye for now!", zh: "先说再见啦！" },
  { en: "Take care!", zh: "保重！" },
];

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
   * Kept in sync with AI Configuration's Completion & Accepted Responses.
   */
  acceptedResponses: string[];
  /**
   * Issue #16 (docs/ai-configuration.md section 3): the fixed 3-line pool
   * Emily selects from, verbatim, when this state's turn is judged
   * `needs_retry`. Per-state (not global) so the line can point the learner
   * back at *this* step specifically, and — per the Global Constraints —
   * never names or implies this state's `acceptedResponses`.
   */
  needsRetryLines: ScriptLine[];
};

/**
 * The conversation's natural shape, beat by beat (spec.md "Practice 页交互模型"
 * + this ticket's explicit guidance): Emily opens with a greeting (the fixed
 * pool above) → learner greets back (`greeting`) → Emily asks how the
 * learner is doing → learner acknowledges and/or asks the check-in question
 * back (`checkin`) → Emily answers and reciprocates the question → learner
 * continues the conversation politely — a short reply or the fuller 3-part
 * combo both work (`response`) → Emily signals wrapping up → learner says
 * goodbye (`closing`) → Emily gives a brief closing
 * encouragement and invites the learner to view their summary.
 */
const PRACTICE_SCRIPT: Record<ActiveConversationState, PracticeStateScript> = {
  greeting: {
    state: "greeting",
    labelZh: CONVERSATION_STAGE_LABELS.greeting.labelZh,
    labelEn: CONVERSATION_STAGE_LABELS.greeting.labelEn,
    learningGoal:
      "You just greeted the learner as your opening line. The learner's job this turn is to greet you back in a natural, friendly way.",
    acceptedResponses: [
      "Hi.",
      "Hello.",
      "Good morning.",
      "Good afternoon.",
      "Good evening.",
      "Nice to meet you.",
    ],
    needsRetryLines: [
      {
        en: "I don't think I caught a greeting there — want to try saying hi?",
        zh: "我好像没听到你跟我打招呼呢——要不要试着说声嗨？",
      },
      {
        en: "Let's start simple — how would you greet someone you just ran into?",
        zh: "我们从简单的开始吧——如果刚好遇到一个人，你会怎么跟他打招呼？",
      },
      {
        en: "Almost! This is the moment to say hello first.",
        zh: "就差一点啦！现在正是先说一声你好的时候。",
      },
    ],
  },
  checkin: {
    state: "checkin",
    labelZh: CONVERSATION_STAGE_LABELS.checkin.labelZh,
    labelEn: CONVERSATION_STAGE_LABELS.checkin.labelEn,
    learningGoal:
      "You just asked the learner how they are doing. The learner's job this turn is to answer that — saying how they're doing. Asking a question back to you too is a nice bonus but isn't required to complete this turn.",
    // These are answers to "how are you?", not the question itself — fixed
    // 2026-08 after cross-referencing the team's "AI Configuration" doc's
    // Step 2 Accepted Responses. The prior whitelist here was
    // CHECKIN_EXPRESSIONS (Explore's "how do you ask how someone's doing"
    // category), which is what THIS state's Emily line already said, not
    // what the learner is being judged on this turn.
    acceptedResponses: [
      "I'm good.",
      "I'm fine.",
      "I'm okay.",
      "Pretty good.",
      "Not bad.",
      "I'm doing well.",
    ],
    needsRetryLines: [
      {
        en: "I asked how you're doing — how would you answer that?",
        zh: "我刚问你最近怎么样——你会怎么回答呢？",
      },
      {
        en: "Let's try again — how are you feeling today?",
        zh: "我们再试一次吧——你今天感觉怎么样？",
      },
      {
        en: "That's not quite an answer to my question yet — how's your day going?",
        zh: "这还不太算是回答我的问题哦——你今天过得怎么样？",
      },
    ],
  },
  response: {
    state: "response",
    labelZh: CONVERSATION_STAGE_LABELS.response.labelZh,
    labelEn: CONVERSATION_STAGE_LABELS.response.labelEn,
    learningGoal:
      "You just responded to the learner's check-in. The learner's job this turn is to continue the conversation politely with a short acknowledgment or a question back.",
    // Reversed 2026-08 (was: required all 3 parts — ack + question back +
    // detail — combined in a single turn). The team's "AI Configuration"
    // doc's Step 3 Accepted Responses are short standalone continuations
    // ("Thanks.", "How about you?"), which conflicted with that stricter
    // rule. See docs/adr/0004-practice-response-step-accepts-single-phrase-replies.md.
    // Fuller replies remain accepted as natural equivalents under the
    // Global Conversation Rules; they do not need separate whitelist rows.
    acceptedResponses: [
      "Thank you.",
      "Thanks.",
      "How about you?",
      "And you?",
    ],
    needsRetryLines: [
      {
        en: "Let's keep the conversation going — how would you respond to that?",
        zh: "我们继续聊下去吧——你会怎么回应呢？",
      },
      {
        en: "Almost there — try a short, friendly reply to what I said.",
        zh: "就快到了——试着简单友好地回应我一下吧。",
      },
      {
        en: "This is the spot to acknowledge me, or ask me something back.",
        zh: "这里正是回应我一下，或者反问我一句的好时机。",
      },
    ],
  },
  closing: {
    state: "closing",
    labelZh: CONVERSATION_STAGE_LABELS.closing.labelZh,
    labelEn: CONVERSATION_STAGE_LABELS.closing.labelEn,
    learningGoal:
      "You just signaled that the conversation is wrapping up. The learner's job this turn is to say goodbye in a natural, friendly way. If this turn is accepted, the conversation is complete and the learner can view the Learning Summary.",
    acceptedResponses: [
      ...CLOSING_EXPRESSIONS.map((expression) => expression.expression),
      "Bye.",
      "Goodbye.",
      "You too.",
    ],
    needsRetryLines: [
      {
        en: "We're wrapping up now — how would you say goodbye?",
        zh: "我们现在要结束啦——你会怎么说再见呢？",
      },
      {
        en: "Let's try again — what would you say to end the conversation?",
        zh: "我们再试一次吧——结束对话时你会说什么？",
      },
      {
        en: "Almost! This is the moment to say your goodbyes.",
        zh: "就差一点啦！现在正是说再见的时候。",
      },
    ],
  },
};

// --- Ask-in-Chinese help content (ticket 10; spec.md "Practice 页交互模型":
// "Ask in Chinese 不调用大模型...四段内容对每个 Conversation State 都是固定的,
// 写成预设文案即可") ---------------------------------------------------------

export type AskInChineseHelp = {
  /** What the current expression/step actually means. */
  meaning: string;
  /** When/why you'd say this in a real conversation. */
  whenToUse: string;
  /** One illustrative example — framed as "you could say something like...",
   * never the literal expected answer handed over as "the" answer. MUST NOT
   * equal or contain (verbatim) any entry in this same state's
   * `GREETING_SOMEBODY_LESSON.script[state].acceptedResponses` — that
   * whitelist is what the judge LLM treats as example correct answers, so a
   * literal quote here would let a learner clear the turn by copy-pasting
   * instead of producing their own English. Guarded by
   * e2e/practice-ask-in-chinese-content.spec.ts.
   */
  example: string;
  /** Encourages the learner to keep answering in English themselves. */
  encouragement: string;
};

/**
 * Fixed, per-state 4-part help content (spec.md user story 55: "中文帮助解释
 * 含义、说明什么时候用、给一个例子、再鼓励我用英语继续"; user story 56: "中文
 * 帮助不替我回答"). Grounded in this same file's `PRACTICE_SCRIPT` — each
 * entry explains the *current* Learning Goal, not generic filler — but never
 * quotes an Accepted Response as a literal fill-in-the-blank answer (see
 * `AskInChineseHelp.example`'s doc comment above — e2e/practice-ask-in-chinese-content.spec.ts
 * fails the build if this invariant is ever violated again).
 *
 * No model call: read directly by src/components/practice/ask-in-chinese-sheet.tsx,
 * keyed by the live `conversationState` — zero latency, zero cost, fully
 * predictable content.
 */
const ASK_IN_CHINESE_HELP: Record<ActiveConversationState, AskInChineseHelp> = {
  greeting: {
    meaning:
      "Emily 刚跟你打了招呼。英语里「打招呼」通常就是一句很短的问候，不需要说完整的长句子。",
    whenToUse:
      "任何你和认识的人（哪怕只是邻居）第一次开口说话时都可以用——路上遇到、进门看到对方，都是打招呼的时机。",
    example:
      "比如你可以说：\"Hey!\"，用一句简短随意的英语问候开场。",
    encouragement: "大概明白意思了吗？试着用英语跟 Emily 打个招呼吧，不用完美，说出来就好！",
  },
  checkin: {
    meaning:
      "Emily 在问你最近怎么样。这其实是一句寒暄，英语母语者问 How are you 时，多数情况并不是真的在打听你的近况。",
    whenToUse:
      "打完招呼后，几乎总会紧接着问一句「你还好吗」，这是英语日常对话里几乎固定的第二步。",
    example: "比如你可以说：\"I feel great today.\"，简单说说自己现在的感受。",
    encouragement: "试着用自己的话回应 Emily，再问她一句怎么样——放心大胆说英语！",
  },
  response: {
    meaning:
      "Emily 已经回应了你的问候。这一步只需要礼貌地把对话继续下去，可以简单道谢，也可以反问 Emily。",
    whenToUse:
      "对方回应你的近况后，用一句简短的话表示感谢或继续提问，就能自然地接住对话。",
    example:
      "比如你可以说：\"That's kind of you.\"，用一句简短的英语礼貌回应。",
    encouragement: "试着用英语礼貌地接一句吧——短短一句就可以！",
  },
  closing: {
    meaning:
      "Emily 刚刚在暗示对话该结束了（比如说她该走了）。这一步轮到你说再见。",
    whenToUse:
      "对话自然收尾、双方都要各自离开时，用一句轻松的告别语结束就好。",
    example: "比如你可以说：\"Catch you later!\" 这样的告别语，怎么说都行，重点是自然、轻松。",
    encouragement: "试着用英语跟 Emily 说再见吧，这就是这节课的最后一步了！",
  },
};

// --- Silence-timeout nudge (ticket 10; spec.md user story 62: "20 秒没说话
// 时 Emily 只轻轻推一下、不催也不给答案") --------------------------------------

/** @deprecated kept as an alias of `ScriptLine` for callers written before issue #16 turned this into a 3-line pool. */
export type SupportNudge = ScriptLine;

/**
 * Fixed bilingual 3-line pool Emily picks from when the learner has gone
 * quiet for a while — appended via practice-state.ts's
 * `appendSupportMessage`, which never touches `conversationState`. Issue #16
 * (docs/ai-configuration.md section 3) expanded this from a single fixed
 * line to a 3-line pool so a long pause doesn't produce the same sentence
 * over and over (user story 18) — selection (src/lib/emily-reply-selector.ts's
 * `selectSilenceNudge`) must never repeat the same line twice in a row.
 * `nudge-0`'s text is kept identical to before so the already-generated
 * `public/audio/nudge-0.mp3` file still matches.
 */
const SILENCE_NUDGE_LINES: ScriptLine[] = [
  { en: "Take your time!", zh: "别着急，慢慢想。" },
  { en: "No rush — whenever you're ready.", zh: "不着急，准备好了再说。" },
  { en: "Still there? Take a moment to think.", zh: "还在吗？慢慢想一想。" },
];

// --- The Lesson structure -------------------------------------------------

export type Lesson = {
  /** Editorial hero headline (UI draft, 2026-08-06 review). */
  headline: { en: string; zh: string };
  /** Fixed pool of opening-greeting variants (see `OPENING_LINES` above). */
  openingLines: OpeningLine[];
  /** Fixed post-Closing completion-message library (see `COMPLETION_MESSAGES` above). */
  completionMessages: readonly string[];
  /** Check-in Conversation Script pool (see `CHECKIN_LINES` above). */
  checkinLines: ScriptLine[];
  /** Response Conversation Script's two sub-pools (see `RESPONSE_LINES` above). */
  responseLines: { didNotAskBack: ScriptLine[]; askedBack: ScriptLine[] };
  /** Closing Conversation Script pool (see `CLOSING_LINES` above). */
  closingLines: ScriptLine[];
  /** Per-Conversation-State Learning Goal + Accepted Responses whitelist (see `PRACTICE_SCRIPT` above). */
  script: Record<ActiveConversationState, PracticeStateScript>;
  /** Per-Conversation-State 4-part Ask-in-Chinese help content (see `ASK_IN_CHINESE_HELP` above). */
  chineseHelp: Record<ActiveConversationState, AskInChineseHelp>;
  /** Fixed bilingual silence-timeout nudge pool (see `SILENCE_NUDGE_LINES` above). */
  silenceNudgeLines: ScriptLine[];
};

/**
 * The single Lesson this codebase currently teaches: "Greeting Somebody".
 * Deliberately the only `Lesson` value that exists — see this file's top
 * doc comment for why a multi-lesson abstraction isn't built yet.
 */
export const GREETING_SOMEBODY_LESSON: Lesson = {
  headline: {
    en: "Say hello to Emily.",
    zh: "和 Emily 真实练习打招呼。",
  },
  openingLines: OPENING_LINES,
  completionMessages: COMPLETION_MESSAGES,
  checkinLines: CHECKIN_LINES,
  responseLines: RESPONSE_LINES,
  closingLines: CLOSING_LINES,
  script: PRACTICE_SCRIPT,
  chineseHelp: ASK_IN_CHINESE_HELP,
  silenceNudgeLines: SILENCE_NUDGE_LINES,
};

/** Convenience re-export — the 4 states in fixed display order. */
export const PRACTICE_STEP_ORDER = ACTIVE_CONVERSATION_STATES;

/** Picks one of the Lesson's opening-line variants at random. */
export function pickRandomOpeningLine(): OpeningLine {
  const lines = GREETING_SOMEBODY_LESSON.openingLines;
  const index = Math.floor(Math.random() * lines.length);
  return lines[index];
}
