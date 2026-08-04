/**
 * Explore page content — the lesson's 12 Key Expressions grouped into 4
 * Conversation Chunk Sections (打招呼/问候/回应/结束对话), plus the 回应
 * section's 3-step combo sentence.
 *
 * Single data source (spec.md "模块划分" > "课程内容模块"): components only
 * consume this, never hardcode copy. Content is authored to be internally
 * consistent with the Observe page's ticket (same 4-category taxonomy, same
 * neighbor-encounter scenario) even though that ticket's content isn't
 * visible from this worktree.
 */

export type ExpressionCard = {
  /** Stable id, also used to derive data-testid hooks for E2E. */
  id: string;
  expression: string;
  /** Names a trait of the expression (e.g. 最常用/根据时间) — not a translation. */
  tag: string;
  /** Usage-context hint — explicitly NOT a Chinese translation of the expression. */
  hint: string;
};

export const GREETING_EXPRESSIONS: ExpressionCard[] = [
  {
    id: "greeting-hi",
    expression: "Hi!",
    tag: "最常用 (Most common)",
    hint: "路上偶遇邻居时最简单直接的招呼",
  },
  {
    id: "greeting-good-morning",
    expression: "Good morning!",
    tag: "根据时间 (Time-based)",
    hint: "早上遇到邻居时用，比 Hi 更正式一点",
  },
  {
    id: "greeting-hey-there",
    expression: "Hey there!",
    tag: "随意亲切 (Casual & friendly)",
    hint: "关系比较熟的邻居之间，比较随意",
  },
];

export const CHECKIN_EXPRESSIONS: ExpressionCard[] = [
  {
    id: "checkin-how-are-you",
    expression: "How are you?",
    tag: "最常用 (Most common)",
    hint: "打完招呼后自然接上的寒暄，不是真的在问近况",
  },
  {
    id: "checkin-hows-it-going",
    expression: "How's it going?",
    tag: "随意 (Casual)",
    hint: "更口语化的问法，朋友邻居之间常用",
  },
  {
    id: "checkin-hows-your-morning-going",
    expression: "How's your morning going?",
    tag: "根据时间 (Time-based)",
    hint: "早上遇见时可以问，显得更具体、更走心",
  },
];

export const CLOSING_EXPRESSIONS: ExpressionCard[] = [
  {
    id: "closing-have-a-good-one",
    expression: "Have a good one!",
    tag: "最常用 (Most common)",
    hint: "结束偶遇时最轻松自然的告别语",
  },
  {
    id: "closing-see-you-around",
    expression: "See you around!",
    tag: "邻里之间 (Neighborly)",
    hint: "暗示以后还会再遇到，适合邻居关系",
  },
  {
    id: "closing-take-care",
    expression: "Take care!",
    tag: "友好关心 (Warm)",
    hint: "带点关心的语气，比 Bye 更有温度",
  },
];

export type ResponseStep = {
  id: string;
  /** Fixed 1-3 order — these are read in sequence, never presented as alternatives. */
  order: 1 | 2 | 3;
  expression: string;
  hint: string;
};

export const RESPONSE_STEPS: ResponseStep[] = [
  {
    id: "response-1",
    order: 1,
    expression: "Good, thanks!",
    hint: "先简短回应对方的问候",
  },
  {
    id: "response-2",
    order: 2,
    expression: "And you?",
    hint: "再把问题抛回给对方，对话才不会冷场",
  },
  {
    id: "response-3",
    order: 3,
    expression: "I'm doing pretty good, just heading to work.",
    hint: "补一句近况，给对话找个自然的延续点",
  },
];

export const RESPONSE_COMBO = {
  id: "response-combo",
  expression: "Good, thanks! And you? I'm doing pretty good, just heading to work.",
};

/** The 4 Conversation Chunk Sections, in fixed display order. */
export const EXPLORE_SECTIONS = {
  greeting: {
    key: "greeting",
    title: "打招呼",
    subtitle: "Greeting",
    expressions: GREETING_EXPRESSIONS,
  },
  checkin: {
    key: "checkin",
    title: "问候",
    subtitle: "Check-in",
    expressions: CHECKIN_EXPRESSIONS,
  },
  closing: {
    key: "closing",
    title: "结束对话",
    subtitle: "Closing",
    expressions: CLOSING_EXPRESSIONS,
  },
} as const;

export const EXPLORE_SECTION_ORDER = ["greeting", "checkin", "response", "closing"] as const;

export type ExploreSectionKey = (typeof EXPLORE_SECTION_ORDER)[number];
