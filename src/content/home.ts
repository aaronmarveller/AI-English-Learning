/**
 * Home page copy — single source of truth so page.tsx and src/components/home/*
 * consume content instead of hardcoding strings inline (spec.md user story 84:
 * "所有课程文案集中在一处，换课程内容不用翻遍组件").
 *
 * Course name is fixed to `Greeting Someone` per spec.md's "命名与内容修正"
 * (the earlier "Somebody" ruling was reversed; Someone is canonical). The
 * Chinese title `邻里问候` ("neighborhood greeting") matches the lesson's
 * actual scene: two neighbors greeting each other in passing.
 */

export type ComingNextItem = {
  id: string;
  nameEn: string;
  nameZh: string;
  /** Emoji stand-in — spec.md's Further Notes explicitly allow emoji for
   * icons that aren't part of the 12 pending image assets, and treat any
   * missing asset as a same-size-placeholder, don't-block-on-it problem. */
  icon: string;
  /** Per-row pastel tint (UI draft, 2026-08-07 review: each locked row gets
   * its own light color instead of a uniform white/opacity-faded card) —
   * `row` for the row background, `badge` for the icon's circle behind it. */
  tint: { row: string; badge: string };
};

export const HOME_CONTENT = {
  course: {
    nameEn: "Greeting Someone",
    nameZh: "邻里问候",
    duration: "10 min",
    /** Intro line above the Learning Objectives (see CONTEXT.md). */
    objectivesIntro: "学完这节课，你将能够：",
    /** Ordered Learning Objectives; "（可选）" is part of the displayed text. */
    objectives: [
      { text: "回应日常问候", optional: false },
      { text: "简单分享自己的近况（可选）", optional: true },
      { text: "自然地继续或结束交流", optional: false },
    ],
  },
  tagline: {
    /** Big bilingual hero headline (UI draft, 2026-08-06 review). */
    headlineEn: "Learn Real English.",
    /** Product proposition, shown above the fold per spec.md user story 12. */
    zh: "学习真实生活中的英语交流。",
    /** The "10 minutes a day" promise (spec.md user story 12). */
    promiseZh: "每天 10 分钟，轻松开口说英语。",
  },
  comingNext: [
    {
      id: "order-food",
      nameEn: "Order Food",
      nameZh: "点餐",
      icon: "🍜",
      tint: { row: "bg-amber-50", badge: "bg-amber-100" },
    },
    {
      id: "ask-directions",
      nameEn: "Ask Directions",
      nameZh: "问路",
      icon: "🗺️",
      tint: { row: "bg-emerald-50", badge: "bg-emerald-100" },
    },
    {
      id: "shopping",
      nameEn: "Shopping",
      nameZh: "购物",
      icon: "🛍️",
      tint: { row: "bg-rose-50", badge: "bg-rose-100" },
    },
    {
      id: "hotel-checkin",
      nameEn: "Hotel Check-in",
      nameZh: "酒店入住",
      icon: "🏨",
      tint: { row: "bg-slate-100", badge: "bg-slate-200" },
    },
  ] satisfies ComingNextItem[],
  comingNextFooter: "More coming soon",
} as const;
