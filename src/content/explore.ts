/**
 * Explore page content — four expression sections (Greeting, Check-in,
 * Response & Keep It Going, Closing), each with a short `main` list and an
 * optional `more` list (Explore More), plus the Conversation Formula shown
 * at the top of Response & Keep It Going.
 *
 * Single data source: components only consume this, never hardcode copy.
 * Every string is taken word for word from the Curriculum Content table in
 * issue #81.
 */

/** Editorial hero headline. */
export const EXPLORE_HEADLINE = {
  en: "Learn useful expressions.",
  zh: "学习常用表达，根据情境灵活组合。",
};

export type Expression = {
  /** Stable id, also used to derive data-testid hooks for E2E. */
  id: string;
  /** One or more spoken lines; each gets its own audio button. */
  lines: string[];
  zh: string;
};

export type TaggedExpression = Expression & { tag: string };

export type FormulaRole = "respond" | "add-more" | "ask-back";

export type RoleExpression = Expression & { role: FormulaRole };

export const CONVERSATION_FORMULA: {
  role: FormulaRole;
  order: 1 | 2 | 3;
  en: string;
  zh: string;
  hint: string;
}[] = [
  { role: "respond", order: 1, en: "Respond", zh: "回应", hint: "先回应" },
  { role: "add-more", order: 2, en: "Add More", zh: "补充近况", hint: "想多说时" },
  { role: "ask-back", order: 3, en: "Ask Back", zh: "回问", hint: "想继续聊时" },
];

export const EXPLORE_SECTIONS = {
  greeting: {
    main: [
      { id: "greeting-hi", lines: ["Hi!"], zh: "嗨！", tag: "最常用" },
      { id: "greeting-hello", lines: ["Hello."], zh: "你好。", tag: "稍正式" },
      {
        id: "greeting-time-based",
        lines: ["Good morning.", "Good afternoon.", "Good evening."],
        zh: "早上好 / 下午好 / 晚上好",
        tag: "根据时间",
      },
    ] satisfies TaggedExpression[],
    more: [
      { id: "greeting-hey", lines: ["Hey!"], zh: "嗨！", tag: "更随意" },
      { id: "greeting-good-to-see-you", lines: ["Good to see you!"], zh: "见到你真高兴！", tag: "再次见面" },
    ] satisfies TaggedExpression[],
    moreSubtitle: "想了解更多打招呼的表达",
  },
  checkin: {
    main: [
      { id: "checkin-how-are-you", lines: ["How are you?"], zh: "你怎么样？", tag: "常用问候" },
      { id: "checkin-hows-it-going", lines: ["How's it going?"], zh: "最近怎么样？", tag: "更随意" },
    ] satisfies TaggedExpression[],
    more: [
      { id: "checkin-how-are-you-doing", lines: ["How are you doing?"], zh: "你怎么样？", tag: "日常口语" },
      { id: "checkin-hows-your-day-going", lines: ["How's your day going?"], zh: "今天过得怎么样？", tag: "询问今天" },
      { id: "checkin-how-have-you-been", lines: ["How have you been?"], zh: "最近过得怎么样？", tag: "久别问候" },
    ] satisfies TaggedExpression[],
    moreSubtitle: "想了解更多问候近况的表达",
  },
  response: {
    main: [
      { id: "response-good-thanks", lines: ["Good, thanks!"], zh: "挺好的，谢谢！", role: "respond" },
      { id: "response-little-busy-today", lines: ["Just a little busy today."], zh: "就是今天有点忙。", role: "add-more" },
      { id: "response-how-about-you", lines: ["How about you?"], zh: "你呢？", role: "ask-back" },
    ] satisfies RoleExpression[],
    more: [
      { id: "response-pretty-good", lines: ["Pretty good!"], zh: "挺不错的！", role: "respond" },
      { id: "response-not-bad", lines: ["Not bad!"], zh: "还不错！", role: "respond" },
      { id: "response-enjoying-the-weather", lines: ["Just enjoying the weather."], zh: "正享受这好天气呢。", role: "add-more" },
      { id: "response-busy-week", lines: ["It's been a busy week."], zh: "这周一直挺忙的。", role: "add-more" },
      { id: "response-what-about-you", lines: ["What about you?"], zh: "你呢？", role: "ask-back" },
    ] satisfies RoleExpression[],
    moreSubtitle: "想了解更多回应与继续交流的表达",
  },
  closing: {
    main: [
      { id: "closing-see-you", lines: ["See you!"], zh: "回头见！", tag: "日常告别" },
      { id: "closing-have-a-nice-day", lines: ["Have a nice day!"], zh: "祝你今天愉快！", tag: "礼貌结束" },
    ] satisfies TaggedExpression[],
    more: [
      { id: "closing-take-care", lines: ["Take care!"], zh: "保重！", tag: "表达关心" },
      { id: "closing-have-a-good-one", lines: ["Have a good one!"], zh: "祝你今天愉快！", tag: "日常口语" },
      { id: "closing-catch-you-later", lines: ["Catch you later!"], zh: "回头见！", tag: "熟人之间" },
    ] satisfies TaggedExpression[],
    moreSubtitle: "想了解更多结束交流的表达",
  },
} as const;

export const EXPLORE_SECTION_ORDER = ["greeting", "checkin", "response", "closing"] as const;

export type ExploreSectionKey = (typeof EXPLORE_SECTION_ORDER)[number];
