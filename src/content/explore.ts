/**
 * Explore page content — the lesson's 12 Key Expressions grouped into 4
 * Conversation Chunk Sections (打招呼/问候/回应/结束对话), plus the 回应
 * section's 3-step combo sentence.
 *
 * Single data source (spec.md "模块划分" > "课程内容模块"): components only
 * consume this, never hardcode copy. Content follows the 2026-08 UI mockup
 * (Expression/Tag/Hint per stage) rather than being tied to a specific
 * conversation scenario.
 */

import { CONVERSATION_STAGE_LABELS } from "@/content/conversation-stages";

/** Editorial hero headline (UI draft, 2026-08-06 review). */
export const EXPLORE_HEADLINE = {
  en: "Learn useful expressions.",
  zh: "学习真实交流中常用的表达。",
};

export type ExpressionCard = {
  /** Stable id, also used to derive data-testid hooks for E2E. */
  id: string;
  expression: string;
  /** Names a trait of the expression (e.g. 最常用/根据时间) — not a translation. */
  tag: string;
  /** Usage-context hint — explicitly NOT a Chinese translation of the expression. */
  hint: string;
  /** Scene photo illustrating the expression's context. Path under /public. */
  image: string;
  /** Optional separate phrases rendered with their own pronunciation buttons. */
  pronunciationTexts?: string[];
};

export const GREETING_EXPRESSIONS: ExpressionCard[] = [
  {
    id: "greeting-hello",
    expression: "Hello.",
    tag: "正式一点",
    hint: "适合稍正式的场合。",
    image: "/assets/explore/greeting-hi.webp",
  },
  {
    id: "greeting-hi",
    expression: "Hi!",
    tag: "最常用",
    hint: "最常见的打招呼方式。",
    image: "/assets/explore/greeting-good-morning.webp",
  },
  {
    id: "greeting-time-based",
    expression: "Good morning. / Good afternoon. / Good evening.",
    tag: "根据时间",
    hint: "根据见面时间实用。",
    image: "/assets/explore/greeting-hey-there.webp",
    pronunciationTexts: ["Good morning.", "Good afternoon.", "Good evening."],
  },
];

export const CHECKIN_EXPRESSIONS: ExpressionCard[] = [
  {
    id: "checkin-how-are-you",
    expression: "How are you?",
    tag: "最经典",
    hint: "最常见的寒暄方式。",
    image: "/assets/explore/checkin-how-are-you.webp",
  },
  {
    id: "checkin-how-are-you-doing",
    expression: "How are you doing?",
    tag: "更自然",
    hint: "比 How are you? 更口语、更亲切。",
    image: "/assets/explore/checkin-hows-your-morning-going.webp",
  },
  {
    id: "checkin-hows-it-going",
    expression: "How's it going?",
    tag: "很日常",
    hint: "熟人之间非常常见的表达。",
    image: "/assets/explore/checkin-hows-it-going.webp",
  },
];

// Punctuation deliberately matches GREETING_SOMEBODY_LESSON.closingLines
// (src/content/lesson.ts) verbatim, exclamation marks and all — issue #17
// (issue #12's Further Notes: "Punctuation is load-bearing in the audio
// manifest"). Audio lookup (src/lib/audio-manifest.ts) is exact text
// matching with a duplicate-text guard that throws at module load; before
// this, these three expressions used a trailing "." where the Closing pool
// used "!" — same words, two separate recordings. Standardising here on the
// AI Configuration form's punctuation lets Explore reuse the Closing pool's
// single recording instead of needing its own.
export const CLOSING_EXPRESSIONS: ExpressionCard[] = [
  {
    id: "closing-see-you",
    expression: "See you!",
    tag: "最常用",
    hint: "最简单、最常见的结束语。",
    image: "/assets/explore/closing-see-you-around.webp",
  },
  {
    id: "closing-have-a-nice-day",
    expression: "Have a nice day!",
    tag: "很礼貌",
    hint: "适合结束对话时使用。",
    image: "/assets/explore/closing-have-a-good-one.webp",
  },
  {
    id: "closing-take-care",
    expression: "Take care!",
    tag: "更温暖",
    hint: "表达关心，让结束语更自然。",
    image: "/assets/explore/closing-take-care.webp",
  },
];

export type ResponseStep = {
  id: string;
  /** Fixed 1-3 order — these are read in sequence, never presented as alternatives. */
  order: 1 | 2 | 3;
  expression: string;
  /** Names a trait of the step (e.g. 回应别人/表达礼貌) — not a translation. */
  tag: string;
  hint: string;
};

export const RESPONSE_STEPS: ResponseStep[] = [
  {
    id: "response-1",
    order: 1,
    expression: "I'm good.",
    tag: "回应别人",
    hint: "回答对方的问候。",
  },
  {
    id: "response-2",
    order: 2,
    expression: "Thank you.",
    tag: "表达礼貌",
    hint: "回应后，加一句谢谢更自然。",
  },
  {
    id: "response-3",
    order: 3,
    expression: "How about you?",
    tag: "回问对方",
    hint: "回问对方，让对话继续进行。",
  },
];

export const RESPONSE_COMBO = {
  id: "response-combo",
  expression: "I'm good. Thank you. How about you?",
};

/**
 * The 4 Conversation Chunk Sections, in fixed display order. `title`/
 * `subtitle` are read from the shared src/content/conversation-stages.ts
 * labels (the descriptive long-form Chinese label + the English label) —
 * not hardcoded here. `response` intentionally has no `expressions` array:
 * its content shape is a 3-step ladder + combo sentence (see
 * `RESPONSE_STEPS`/`RESPONSE_COMBO` below), not an expression-card array,
 * so src/components/explore/explore-page-content.tsx still branches on
 * `key === "response"` to pick `<ResponseLadder>` over
 * `<ExpressionCarousel>` — but no longer needs a hardcoded title/subtitle
 * for it.
 */
export const EXPLORE_SECTIONS = {
  greeting: {
    key: "greeting",
    icon: "👋",
    title: CONVERSATION_STAGE_LABELS.greeting.labelZhLong,
    subtitle: CONVERSATION_STAGE_LABELS.greeting.labelEn,
    expressions: GREETING_EXPRESSIONS,
  },
  checkin: {
    key: "checkin",
    icon: "😊",
    title: CONVERSATION_STAGE_LABELS.checkin.labelZhLong,
    subtitle: CONVERSATION_STAGE_LABELS.checkin.labelEn,
    expressions: CHECKIN_EXPRESSIONS,
  },
  response: {
    key: "response",
    icon: "🗣️",
    title: CONVERSATION_STAGE_LABELS.response.labelZhLong,
    subtitle: CONVERSATION_STAGE_LABELS.response.labelEn,
  },
  closing: {
    key: "closing",
    icon: "🙌",
    title: CONVERSATION_STAGE_LABELS.closing.labelZhLong,
    subtitle: CONVERSATION_STAGE_LABELS.closing.labelEn,
    expressions: CLOSING_EXPRESSIONS,
  },
} as const;

export const EXPLORE_SECTION_ORDER = ["greeting", "checkin", "response", "closing"] as const;

export type ExploreSectionKey = (typeof EXPLORE_SECTION_ORDER)[number];
