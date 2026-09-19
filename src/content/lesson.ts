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
 * Fixed pool of opening lines, one picked at random client-side on page mount
 * (see practice-state.ts's `ensureOpeningMessage`). There is no learner input
 * yet on page load to send to the model, so this line is never LLM-generated —
 * every other Emily line (the reply after each learner turn) legitimately comes
 * from the LLM call instead.
 *
 * Deliberately a SINGLE self-introduction line (v2 ticket 2; see
 * docs/adr/0013-response-goal-means-asking-emily-back.md, "The opening line
 * collapses to the ticket's single line"). spec.md's "语音合成" section and
 * ticket 13's audio-pregeneration work once described a fixed pool of 5
 * greeting variants — that pool existed to vary a bare "Hi!"/"Hello!", and a
 * self-introduction has nothing to vary without inventing four more of them
 * (#46 declared the choice out of scope for its PR; ADR-0013 takes the single
 * line). The array shape is kept on purpose, and `pickRandomOpeningLine`
 * below still picks from it, so a future Lesson can widen the pool again.
 */
const OPENING_LINES: OpeningLine[] = [
  {
    id: "opening-1",
    en: "Hi! I'm Emily. It's nice to meet you.",
    zh: "嗨！我是 Emily，很高兴认识你。",
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
// authored fresh here. Emily picks lines at random from the pool the settled
// Turn calls for — the reaction to `checkin` being achieved, then the steer
// toward the new Focus Goal (issue #48; see
// src/lib/emily-reply-selector.ts); she never paraphrases or composes. ------

/** Check-in (3) — the steer line toward the `checkin` Goal, spoken whenever `checkin` is the Focus Goal. */
const CHECKIN_LINES: ScriptLine[] = [
  { en: "How are you today?", zh: "你今天过得怎么样？" },
  { en: "Hi! How are you today?", zh: "嗨！你今天过得怎么样？" },
  { en: "How's it going?", zh: "最近怎么样？" },
];

/**
 * Response (10 total, split into two sub-pools) — the one reaction-type pool
 * (docs/ai-configuration.md section 3's "Line composition"), spoken on every
 * Turn where a reaction is due: the learner asked a question back, or `checkin`
 * was achieved in that same Turn. Which sub-pool Emily draws from is decided by
 * `learner_asked_back` (the Judge's boolean for that same Turn) — never a
 * random pick across both, since a plain acknowledgement and an answer to a
 * question put to her aren't interchangeable. It doubles as the steer toward
 * `response`, so it is never spoken twice in one Turn.
 *
 * Per docs/adr/0013-response-goal-means-asking-emily-back.md decision 2, the
 * two sub-pools are:
 * - `didNotAskBack` — the brief acknowledgement for a check-in with no
 *   ask-back (v2 ticket 3's "Check-in Pre-generated Responses" table,
 *   de-duplicated).
 * - `askedBack` — Emily's ANSWER to a question the learner asked her, chosen
 *   whenever `learner_asked_back` is true. That is NOT only when the check-in
 *   landed in the same Turn (ADR-0013 decision 4: the learner may answer on
 *   one Turn and ask "How about you?" on the next, and Emily must still
 *   answer), so these lines answer a question rather than acknowledge one.
 *   The four entries are the distinct first halves of v2 ticket 4's Ask-back
 *   table, in that table's order.
 *
 * Ticket 4/6's Emily lines fold her answer and the closing steer into a single
 * utterance ("I'm good too, thanks! Have a nice day!"). ADR-0012 already
 * rejected composed lines for multi-Goal Turns and every composed line would
 * need its own recording, so the combined sentences are deliberately NOT
 * authored as single lines: the first half is the pool line here, and Emily
 * follows it with a line from the Closing pool — the same reaction-then-steer
 * sequence she already speaks. The old pool's "thanks for asking"
 * acknowledgements are gone with it (there is no check-in to acknowledge when
 * the learner asked back in an earlier Turn).
 */
const RESPONSE_LINES: { didNotAskBack: ScriptLine[]; askedBack: ScriptLine[] } = {
  didNotAskBack: [
    { en: "That's good!", zh: "那真好！" },
    { en: "Glad to hear that!", zh: "很高兴听你这么说！" },
    { en: "Good to hear!", zh: "真为你高兴！" },
    { en: "That's great!", zh: "太好了！" },
    { en: "Nice!", zh: "不错呀！" },
    { en: "Glad you're doing okay.", zh: "你还好就好。" },
  ],
  askedBack: [
    { en: "I'm good too, thanks!", zh: "我也挺好的，谢谢！" },
    { en: "I'm good, thank you!", zh: "我很好，谢谢你！" },
    { en: "I'm good, thanks!", zh: "我很好，谢谢！" },
    { en: "I'm doing well, thanks!", zh: "我过得很好，谢谢！" },
  ],
};

/** Closing (4) — the steer line toward the `closing` Goal, spoken whenever `closing` is the Focus Goal. */
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
   * Short instruction fed into the system prompt (and into the Chinese
   * explanation prompt, src/lib/chinese-explanation.ts): what this
   * Conversation Goal asks the learner to communicate. Written for the Goal
   * itself, never as "you just said X, judge the learner's reply to X" — an
   * achieved Goal is credited whenever the learner communicated it, prompted
   * or not (docs/ai-configuration.md section 1's Global Conversation Rules),
   * and a single Turn may achieve several Goals at once, so a text that
   * assumed Emily had just prompted for *this* one would mis-describe both.
   */
  learningGoal: string;
  /**
   * Example correct answers for this Conversation Goal. Per spec.md's single
   * most load-bearing acceptance point ("判定以沟通意图为准，不以字面匹配为准"),
   * natural equivalents outside this list must still be judged "accepted" —
   * this whitelist is guidance for the model, not an exhaustive match list.
   * Kept in sync with AI Configuration's Completion & Accepted Responses.
   */
  acceptedResponses: string[];
  /**
   * Issue #16 (docs/ai-configuration.md section 3): the fixed 3-line pool
   * Emily selects from, verbatim, when a Turn judged against this Goal is
   * `needs_retry`. Per-Goal (not global) so the line can point the learner at
   * what *this* Goal is asking for, and — per the Global Constraints — never
   * names or implies the Goal's `acceptedResponses`. These lines double as the
   * steer toward `greeting` and `response`, which have no steer pool of their
   * own (src/lib/emily-reply-selector.ts).
   */
  needsRetryLines: ScriptLine[];
};

/**
 * The conversation's natural shape, beat by beat (spec.md "Practice 页交互模型"
 * + this ticket's explicit guidance): Emily opens with her self-introduction
 * (the fixed pool above) → learner greets back (`greeting`) → Emily asks how
 * the learner is doing → learner answers (`checkin`) → Emily acknowledges and
 * waits; the learner asks her how she is (`response`) → Emily answers and
 * signals the conversation is wrapping up → learner says goodbye (`closing`) →
 * Emily gives a brief closing encouragement and invites the learner to view
 * their summary.
 *
 * Note the beat that has no steer line: after the check-in Emily waits rather
 * than prompting for `response`, because a question back is the learner's move
 * to make (v2 ticket 3's "Emily waits for the learner after the
 * acknowledgement"; ADR-0013 decision 4). Every other beat is an ordinary
 * steer toward the Goal named in brackets.
 *
 * That is the shape, not a gate: since #48 a single learner Turn may achieve
 * several of these Goals and a later one may land before an earlier one, so
 * the pools below are keyed to what a Goal *needs* — a steer toward it, or a
 * reaction to `checkin` being achieved or to a question the learner asked —
 * rather than to a position in this sequence (see
 * src/lib/emily-reply-selector.ts's `selectEmilyLinesForTurn`).
 */
const PRACTICE_SCRIPT: Record<ActiveConversationState, PracticeStateScript> = {
  greeting: {
    state: "greeting",
    labelZh: CONVERSATION_STAGE_LABELS.greeting.labelZh,
    labelEn: CONVERSATION_STAGE_LABELS.greeting.labelEn,
    learningGoal:
      "The learner greets Emily with a short, natural hello. Emily's opening line is usually what invites it, but the learner may greet first or greet again later in the conversation — the Goal is credited whenever the learner communicates a greeting, prompted or not.",
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
      "The learner says how they are doing. Emily usually asks how the learner is before they answer, but a learner who volunteers it (\"I'm good, thanks\") before being asked has achieved this Goal too — it is credited whenever the learner communicated how they are, prompted or not. Asking Emily how she is as well is a nice bonus, not a requirement.",
    // These are answers to "how are you?", not the question itself — re-authored
    // 2026-09 from the v2 tickets, de-duplicated: ticket 3's learner-response
    // column, and ticket 6's multi-goal table (which adds no new phrasings).
    // Kept as examples, not an exhaustive match list — a natural equivalent
    // outside this list is still "accepted" (spec.md's 判定以沟通意图为准).
    // The prior whitelist here was CHECKIN_EXPRESSIONS (Explore's "how do you
    // ask how someone's doing" category), which is what THIS state's Emily line
    // already says, not what the learner is being judged on this turn.
    acceptedResponses: [
      "I'm good.",
      "Good.",
      "I'm good, thanks.",
      "I'm good, thank you.",
      "Good, thanks.",
      "Good, thank you.",
      "I'm fine.",
      "Fine.",
      "I'm fine, thanks.",
      "I'm doing well.",
      "I'm well.",
      "Pretty good.",
      "Not bad.",
      "I'm okay.",
      "Okay.",
      "I'm great.",
      "Great!",
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
      "The learner asks Emily how she is — a question back to her (\"How about you?\", \"How about yourself?\"). A bare thank-you is politeness, not this Goal: thanking Emily asks her nothing, so a message whose only move is a thank-you leaves this Goal untouched.",
    // Per docs/adr/0013-response-goal-means-asking-emily-back.md, `response`
    // means asking Emily back. The whitelist is the ask-back expressions from
    // v2 tickets 4 and 6. A bare thank-you deliberately does NOT achieve this
    // Goal — it leaves the Goal `untouched` rather than `failed`, exactly as
    // any other message that attempted no Goal does — which is why
    // "Thank you."/"Thanks." are gone and why `matchedAcceptedResponse`
    // (src/lib/turn-record.ts) and Review's Conversation highlight follow.
    // This refines ADR-0004's "one short phrase is enough" rule: one question
    // back is enough, with no acknowledgement or added detail required.
    // Natural equivalents outside this list are still accepted under the
    // Global Conversation Rules; they do not need separate whitelist rows.
    acceptedResponses: [
      "How about you?",
      "And you?",
      "You?",
      "What about you?",
      "How are you?",
      "How are you doing?",
      "How about yourself?",
    ],
    needsRetryLines: [
      {
        en: "Let's keep the conversation going — what could you ask me?",
        zh: "我们继续聊下去吧——你可以问我点什么呢？",
      },
      {
        en: "Almost there — try a short, friendly question back to me.",
        zh: "就快到了——试着简单友好地反问我一句。",
      },
      {
        en: "This is the spot to ask how I'm doing.",
        zh: "这里正是问问我过得怎么样的好时机。",
      },
    ],
  },
  closing: {
    state: "closing",
    labelZh: CONVERSATION_STAGE_LABELS.closing.labelZh,
    labelEn: CONVERSATION_STAGE_LABELS.closing.labelEn,
    learningGoal:
      "The learner says goodbye in a natural, friendly way. Emily usually signals that the conversation is wrapping up first, but a learner who says goodbye early has achieved this Goal too — it is credited whenever the learner communicates a goodbye, prompted or not. Once all four Goals are in Goal Progress, Practice is complete and the learner can view the Learning Summary.",
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
 * Fixed, per-Goal 4-part help content (spec.md user story 55: "中文帮助解释
 * 含义、说明什么时候用、给一个例子、再鼓励我用英语继续"; user story 56: "中文
 * 帮助不替我回答"). Grounded in this same file's `PRACTICE_SCRIPT` — each
 * entry explains the *Focus Goal* (CONTEXT.md), not generic filler — but never
 * quotes an Accepted Response as a literal fill-in-the-blank answer (see
 * `AskInChineseHelp.example`'s doc comment above — e2e/practice-ask-in-chinese-content.spec.ts
 * fails the build if this invariant is ever violated again).
 *
 * No model call: read directly by src/components/practice/ask-in-chinese-sheet.tsx,
 * keyed by the live Focus Goal — zero latency, zero cost, fully
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
      "Emily 已经回应了你的问候。这一步要做的是把问题问回给她，主动关心一下她过得怎么样。",
    whenToUse:
      "聊天时对方回应了你的近况之后，用一句简短的问句问问对方「你呢？」，对话才不会在你这边停下来——英语里的寒暄正是靠这样互相反问延续下去的，只道谢的话话题就断了。",
    example:
      "比如你可以说：\"How's your day going?\"，把问题问回给 Emily。",
    encouragement: "试着用英语反问 Emily 一句吧——问问她最近怎么样，短短一句就够了！",
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
 * `appendSupportMessage`, which never touches Goal Progress. Issue #16
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
  /** Fixed pool of opening lines (see `OPENING_LINES` above — one line since ADR-0013). */
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
