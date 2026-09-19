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
 * (`checkinLines`, `responseLines`, `closingLines`, per-Goal recovery lines
 * since #56) and turned the old single silence-timeout line into a 3-line pool
 * (`silenceNudgeLines`) — every one of them copied verbatim from
 * docs/ai-configuration.md section 3, with Chinese translations authored
 * fresh here (the AI Configuration doc only specifies the English). The
 * opening-line pool is unchanged (spec.md's own table: "existing pool,
 * unchanged"); the closing and completion pools are not — issue #55
 * re-authored both from v2 ticket 5's Closing table, and their own doc
 * comments below say what changed and why. Selection itself lives in
 * src/lib/emily-reply-selector.ts, not here — this file only owns content.
 *
 * Issue #56 (v2 tickets 8, 10 and 9; ADR-0014) splits the per-Goal
 * `needsRetryLines` pool in two, because those tickets ask for *progressive*
 * support rather than one repeated nudge: each Goal now carries a `recovery`
 * (tier 1 = a nudge followed by that Goal's question, tier 2 = a direct
 * example) and the old pool survives, unchanged in content, as `steerLines` —
 * the line an `accepted` Turn uses to steer toward a Goal left open, which is
 * the only job it has left. The silence nudge pool is unchanged; what changed
 * is that it is now spoken as a sequence with that same Goal question (see
 * src/lib/emily-reply-selector.ts's `selectSilenceReminder`).
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
 * The fixed Completion pool — Emily's ONE short final line, spoken when an
 * accepted Closing turn advances the conversation to "complete"
 * (src/lib/emily-reply-selector.ts). Selection is client-side and verbatim
 * (issue #16); nothing here is model-generated.
 *
 * Issue #55 re-authored this pool from v2 ticket 5's Closing table, whose
 * Emily Final Response column is a farewell — "Thanks! See you!",
 * "See you!", "Thanks! Take care!" — so the pre-#55 claim that these lines
 * were "unchanged"/"the existing completion pool" is false now. The pool is
 * one list picked independently of which Closing line Emily herself spoke:
 * ADR-0013 decision 2 settled that a Turn's reply is a *sequence* of
 * existing pool lines rather than one composed line, and keying the final
 * line to the steer that preceded it would reintroduce exactly that
 * composition (see docs/adr/0013-response-goal-means-asking-emily-back.md's
 * decision 5, "one Completion pool, picked independently of the Closing line
 * Emily spoke"). Each line is written to fit every Closing-pool steer, so the
 * pairing always reads naturally: "Have a nice day!" → "Thanks! See you!".
 *
 * No line invites the learner to Review, deliberately (v2 ticket 11): the
 * Review action appearing IS the signal that Practice is complete, so a
 * "let's check your summary" line would be Emily announcing a step she does
 * not control. English-only, same as before issue #16 — the model used to
 * supply its own `reply_zh` translation for whichever entry it picked; now
 * that selection is client-side, there is no accompanying Chinese
 * translation authored for this pool, and the selector gives each line
 * `zh: ""` (see emily-reply-selector.ts's composition).
 */
const COMPLETION_MESSAGES = ["Thanks! See you!", "See you!", "Thanks! Take care!"] as const;

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

/**
 * Closing (3) — the steer line toward the `closing` Goal, spoken whenever
 * `closing` is the Focus Goal.
 *
 * Issue #55 re-authored this pool to ticket 5's table's "Emily Closing"
 * column, de-duplicated and in first-appearance order: the table lists exactly
 * "Have a nice day!", "Take care!" and "See you!", and "Bye for now!" — which
 * the old pool had — is not in it. Every line here is now verbatim-identical to
 * one of Explore's closing expressions, so the audio manifest contributes no
 * entries for this pool at all — those lines reuse Explore's recordings (see
 * src/lib/audio-manifest.ts). Every `zh` here is the translation already
 * authored for that same English line in the old pool, and only the order
 * changed; the one line that left ("Bye for now!") took its translation with
 * it.
 */
const CLOSING_LINES: ScriptLine[] = [
  { en: "Have a nice day!", zh: "祝你今天愉快！" },
  { en: "Take care!", zh: "保重！" },
  { en: "See you!", zh: "再见啦！" },
];

// --- Two-tier recovery (issue #56; docs/ai-configuration.md section 3) -----

/**
 * Emily's two-tier recovery for one Conversation Goal (issue #56; v2 tickets
 * 8, 10 and 9; docs/ai-configuration.md section 3). What a `needs_retry` Turn
 * speaks instead of the flat 3-line pool this used to be.
 *
 * Tier 1 is a *sequence* — a nudge, then the Goal's question — because the
 * learner has not answered yet and the question is what asks them to. Which
 * nudge opens it is the Goal Report's job to decide (section 3's "Recovery"):
 * a `failed` Goal means a recognisable attempt that did not come through, so
 * the learner hears `unclearNudge`; a Turn that attempted nothing at all
 * (every open Goal `untouched` — what off-topic input looks like) hears
 * `offTopicNudge` instead, or no nudge at all where that Goal's row in v2
 * ticket 10's table has none.
 *
 * Tier 2 is one line and says what tier 1 would not: a direct example, spoken
 * on the learner's second consecutive `needs_retry` Turn on the same Focus
 * Goal (the Retry Streak — src/lib/practice-state.ts). Both of v2 tickets 8
 * and 10 write the same sentence for this tier, so one line per Goal covers
 * both variants.
 *
 * The tier-1/tier-2 split is also a *reveal* rule (docs/ai-configuration.md
 * section 1's Global Constraints, ADR-0014 decision 1): tier 1 never names an
 * Accepted Response, tier 2 hands one over on purpose.
 */
export type RecoveryScript = {
  /**
   * Tier 1's nudge when at least one open Goal's report is `failed` — v2
   * ticket 8's "First Try" prefix. All four Goals carry the same one, because
   * that table repeats this sentence in every one of its rows: the
   * Goal-specific half of the line is the question that follows it, not this.
   * Spelled per Goal anyway, so a Goal's recovery stays a complete account of
   * what that Goal says and a Goal that ever needs its own wording has
   * somewhere to put it. A divergence would be loud rather than silent:
   * `audio-manifest.test.ts` covers every Goal's `unclearNudge`, and
   * src/lib/audio-manifest.ts throws at module load on duplicate text.
   */
  unclearNudge: ScriptLine;
  /**
   * Tier 1's nudge when the Turn attempted nothing (off-topic) — v2 ticket
   * 10's "First Redirect" prefix. `null` where that table's row has no prefix
   * of its own (`response`, `closing`), so those Goals open straight onto
   * their question; inventing one would be the combined line ADR-0014
   * decision 2 rejects, one level down.
   */
  offTopicNudge: ScriptLine | null;
  /**
   * The question tier 1 steers with — v2 tickets 8 and 10 ask the same one in
   * both of their rows for a Goal, so one line per Goal serves both variants.
   *
   * `null` for `checkin`, and only for `checkin`: that Goal's question already
   * exists as its steer pool (`CHECKIN_LINES` — "How are you today?"), and the
   * decision recorded in ADR-0014 keeps the steer pools the single source of
   * the question wording rather than authoring a second copy of it here.
   */
  question: ScriptLine | null;
  /** Tier 2 — v2 tickets 8 and 10's "If Still Unclear"/"If Still Off-topic" sentence, the same in both. */
  directExample: ScriptLine;
};

/**
 * Tier 1's `unclear` nudge (see `RecoveryScript.unclearNudge`). One shared
 * value, because v2 ticket 8's table repeats this exact sentence in all four
 * of its rows — the Goal-specific half of that line is the question that
 * follows it, not this — and exported so the audio manifest can name it once
 * rather than emitting the same text under four ids (src/lib/audio-manifest.ts).
 */
export const RECOVERY_UNCLEAR_NUDGE: ScriptLine = {
  en: "Sorry, I didn't quite get that.",
  zh: "抱歉，我好像没太听懂。",
};

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
   * Issue #16 (docs/ai-configuration.md section 3), as narrowed by issue #56:
   * the fixed pool of "here's what to say next" lines, carried by the two
   * Goals that have no steer pool of their own — `greeting` and `response`
   * (issue #50). Optional because those are the only two: `checkin` steers
   * from `CHECKIN_LINES` and `closing` from `CLOSING_LINES`, so a pool here
   * would be content nothing can speak. #56 deleted the two pools that were
   * in that position (`checkin`'s and `closing`'s) along with their audio,
   * exactly as it replaced every Goal's `needs_retry` lines with `recovery`.
   *
   * It used to be the pool a `needs_retry` Turn spoke from — hence its old
   * name, `needsRetryLines` — and it is now spoken on `accepted` Turns only,
   * as the borrowed steer `selectSteerLineForFocusGoal`
   * (src/lib/emily-reply-selector.ts) picks when the Focus Goal has no steer
   * pool. The rename follows the pool's job, as CONTEXT.md's glossary
   * discipline requires (ADR-0014 decision 5).
   */
  steerLines?: ScriptLine[];
  /** Emily's two-tier recovery for this Goal — what a `needs_retry` Turn speaks (issue #56; see `RecoveryScript` above). */
  recovery: RecoveryScript;
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
    steerLines: [
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
    recovery: {
      unclearNudge: RECOVERY_UNCLEAR_NUDGE,
      offTopicNudge: { en: "Let's start with a greeting.", zh: "我们先从打招呼开始吧。" },
      question: {
        en: "What would you say when you meet someone?",
        zh: "遇到一个人时，你会怎么打招呼呢？",
      },
      directExample: { en: 'You can say "Hi" or "Hello."', zh: "你可以说 “Hi” 或者 “Hello.”" },
    },
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
    recovery: {
      unclearNudge: RECOVERY_UNCLEAR_NUDGE,
      offTopicNudge: { en: "Let's keep going.", zh: "我们继续吧。" },
      // No question of its own: the Check-in steer pool asks it ("How are you
      // today?"), and ADR-0014 decision 2 keeps that pool the single source of
      // the wording rather than authoring a second copy here.
      question: null,
      directExample: {
        en: 'You can say "I\'m good" or "I\'m okay."',
        zh: "你可以说 “I'm good” 或者 “I'm okay.”",
      },
    },
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
    steerLines: [
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
    recovery: {
      unclearNudge: RECOVERY_UNCLEAR_NUDGE,
      // Ticket 10's row for this Goal has no redirect prefix of its own — the
      // question is the whole first redirect, so this stays `null` rather than
      // copying the Check-in nudge onto a Goal the table does not give one.
      offTopicNudge: null,
      question: { en: "What could you ask me back?", zh: "你可以反问我什么呢？" },
      directExample: { en: 'You can say "How about you?"', zh: "你可以说 “How about you?”" },
    },
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
    recovery: {
      unclearNudge: RECOVERY_UNCLEAR_NUDGE,
      // Ticket 10's row for this Goal has no redirect prefix of its own, same
      // as `response` above.
      offTopicNudge: null,
      // The one Goal whose recovery question is *not* its steer line: the
      // Closing steer pool says goodbye itself ("Have a nice day!"), which
      // cannot ask the learner to. So the question is authored here, and the
      // Closing steer stays what an `accepted` Turn picks from CLOSING_LINES.
      question: { en: "What could you say before we go?", zh: "我们分开前，你可以说什么呢？" },
      directExample: {
        en: 'You can say "See you" or "Take care."',
        zh: "你可以说 “See you” 或者 “Take care.”",
      },
    },
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
 * Fixed bilingual 3-line nudge pool — the *first half* of the silence
 * reminder Emily speaks when the learner has gone quiet for a while (issue
 * #56; docs/ai-configuration.md section 3's "Silence reminder"), appended via
 * practice-state.ts's `appendSupportMessages`, which never touches Goal
 * Progress. Issue #16 (that section) expanded this from a single fixed line to
 * a 3-line pool so a long pause doesn't produce the same sentence over and
 * over (user story 18) — selection (src/lib/emily-reply-selector.ts's
 * `selectSilenceReminder`) must never repeat the same line twice in a row.
 * `nudge-0`'s text is kept identical to before so the already-generated
 * `public/audio/nudge-0.mp3` file still matches.
 *
 * The second half is the Focus Goal's question, which is a Goal's content and
 * not this pool's (v2 ticket 9's own example is "Take your time. How are you
 * today?" — a nudge plus the Check-in question Emily already asked). The pool
 * is one for the whole Lesson rather than per Goal, deliberately: a nudge
 * breaks a silence, it does not say anything about what the learner has or
 * hasn't said.
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
  /** The Completion pool: Emily's one final farewell line, picked from three (see `COMPLETION_MESSAGES` above). */
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
