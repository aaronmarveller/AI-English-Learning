/**
 * Home page copy — single source of truth so page.tsx and src/components/home/*
 * consume content instead of hardcoding strings inline (spec.md user story 84:
 * "所有课程文案集中在一处，换课程内容不用翻遍组件").
 *
 * Course name is fixed to `Greeting Somebody` per spec.md's "命名与内容修正"
 * (the UI draft's "Greeting Someone" on pages 1/2 was ruled a typo). The
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
};

export const HOME_CONTENT = {
  course: {
    nameEn: "Greeting Somebody",
    nameZh: "邻里问候",
    duration: "5–10 分钟",
    category: "日常社交",
  },
  tagline: {
    /** Product proposition, shown above the fold per spec.md user story 12. */
    zh: "真实场景开口练英语，学一次就能在生活里用上",
    /** The "every day just 5 minutes" promise (spec.md: "每天只要 5 分钟"). */
    promiseZh: "每天只要 5 分钟",
  },
  comingNext: [
    { id: "order-food", nameEn: "Order Food", nameZh: "点餐", icon: "🍜" },
    { id: "ask-directions", nameEn: "Ask Directions", nameZh: "问路", icon: "🗺️" },
    { id: "shopping", nameEn: "Shopping", nameZh: "购物", icon: "🛍️" },
    { id: "hotel-checkin", nameEn: "Hotel Check-in", nameZh: "酒店入住", icon: "🏨" },
  ] satisfies ComingNextItem[],
  comingNextFooter: "More coming soon",
} as const;
