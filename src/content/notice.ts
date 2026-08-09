/**
 * Content for the Notice page (ticket 07): 3 Cultural Insight Cards
 * contrasting US and China greeting norms. Single data source so
 * components stay presentational — see spec.md "模块划分" > "课程内容模块"
 * ("组件只消费，不硬编码文案").
 *
 * The three cards map directly onto spec.md's user stories 35-41 for this
 * page: who this kind of casual greeting is normally used with (35/36),
 * whether the chat continues past the greeting itself (37), and what people
 * actually talk about once it does (38) — including why "How are you?"
 * isn't a real question about your wellbeing (36). Each card's `why` field
 * exists because user story 39 asks for the *reasoning* behind the
 * difference, not just the difference itself — the goal is understanding
 * real communication, not memorizing phrases (see the ticket's own "目标是
 * 理解真实交流方式，不是记忆语言形式").
 *
 * Restructured from free-text paragraphs to short phrase checklists (UI
 * draft, 2026-08-07 review): the reference mockup pairs each side with a
 * headline phrase plus a handful of checked bullet points rather than a
 * paragraph, and shows both sides side-by-side rather than stacked (see
 * docs/adr/0001-side-by-side-comparison-on-mobile.md). `preview` is a short
 * emoji summary shown on the card header while it's collapsed — new surface
 * area the old paragraph-only layout didn't need.
 */

/** Editorial hero headline (UI draft, 2026-08-06 review). */
export const NOTICE_HEADLINE = {
  en: "Discover how greetings differ across cultures.",
  zh: "看看不同文化中，人们是怎么打招呼的。",
};

/**
 * Decorative street-scene illustration with "Hi!" / "你好！" speech bubbles
 * baked into the image itself (UI draft, 2026-08-07 review — the bubbles
 * aren't a separate overlay component). File isn't in the repo yet; drop it
 * at this path once available.
 */
export const NOTICE_HERO_IMAGE = {
  src: "/assets/notice/hero-street-greeting.jpg",
  alt: "",
};

export type CulturalInsightCard = {
  /** Stable id, also used to derive data-testid hooks for E2E. */
  id: string;
  /** Chinese card title — the question this card answers. */
  title: string;
  /** English gloss, shown as a secondary label. */
  subtitle: string;
  /**
   * Composite "who greets this way" avatar row images, US and China side by
   * side. Only card 1 has these — cards 2/3 illustrate a phrase/behavior,
   * not a cast of people. Files aren't in the repo yet; drop them at these
   * paths once available.
   */
  peopleImage?: {
    us: { src: string; alt: string };
    china: { src: string; alt: string };
  };
  us: {
    /** Representative phrase shown as this column's headline. */
    phrase: string;
    /** Short checked bullet points, not full sentences. */
    items: string[];
  };
  china: {
    phrase: string;
    items: string[];
  };
  /** The "why" explanation behind the difference — never just stated as fact. */
  why: string;
  /** Compact emoji summary shown on the card header while collapsed. */
  preview: {
    us: string;
    china: string;
  };
};

export const CULTURAL_INSIGHT_CARDS: CulturalInsightCard[] = [
  {
    id: "who-greets",
    title: "会和谁这样打招呼？",
    subtitle: "Who You Greet This Way",
    peopleImage: {
      us: {
        src: "/assets/notice/who-greets-us.jpg",
        alt: "美国常见打招呼对象：警察、店员、邻居、路人",
      },
      china: {
        src: "/assets/notice/who-greets-china.jpg",
        alt: "中国常见打招呼对象：家人、朋友、熟络的邻居",
      },
    },
    us: {
      phrase: "How are you?",
      items: ["陌生人", "熟人", "都可以说"],
    },
    china: {
      phrase: "吃了吗？\n去哪儿？\n最近怎么样？",
      items: ["更多用于熟人之间"],
    },
    why: '"How are you?" 通常只是一个友好的问候，不是真的想了解你的近况，所以简单回应即可。',
    preview: {
      us: "👋🌍",
      china: "👋👨‍👩‍👧",
    },
  },
  {
    id: "keep-chatting",
    title: "打完招呼以后，会继续聊吗？",
    // Deliberately not "...Continue?" — e2e/navigation-spine.spec.ts and
    // e2e/notice.spec.ts both scope their Continue-button query by the
    // accessible-name substring "Continue" and assume it's unique on the
    // page; this card's own header button would otherwise match too.
    subtitle: "Does the Chat Go On?",
    us: {
      phrase: "通常会继续聊天",
      items: ["回应对方", "回问一句", "再聊几句"],
    },
    china: {
      phrase: "打完招呼后",
      items: ["有时直接结束", "不一定继续聊天"],
    },
    why: "英语里的问候通常只是对话的开始，简单回应后，再继续聊几句会更自然。",
    preview: {
      us: "😃↔😃",
      china: "😃✓",
    },
  },
  {
    id: "small-talk-topics",
    title: "通常会聊什么？",
    subtitle: "What They Talk About",
    us: {
      phrase: "常见话题",
      items: ["天气", "今天怎么样", "周末安排"],
    },
    china: {
      phrase: "常见话题",
      items: ["吃饭", "工作/学习", "家人"],
    },
    why: "不同文化有不同的聊天习惯。了解这些常见话题，可以帮助你更自然地延续对话。",
    preview: {
      us: "☀️📅🎉",
      china: "🍚💼👨‍👩‍👧",
    },
  },
];
