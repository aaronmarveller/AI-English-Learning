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
    /** Flag emoji alone — kept separate from `label` so the collapsed
     * preview strip can prefix it onto `preview.us` without slicing an
     * emoji grapheme out of a longer string. */
    flag: string;
    label: string;
    /** Representative phrase shown as this column's headline. */
    phrase: string;
    /** Short checked bullet points, not full sentences. */
    items: string[];
  };
  china: {
    flag: string;
    label: string;
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
    title: "会和谁这样打招呼",
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
      flag: "🇺🇸",
      label: "🇺🇸 In the US",
      phrase: "Hi! / Hey there!",
      items: ["陌生人", "熟人", "都可以说"],
    },
    china: {
      flag: "🇨🇳",
      label: "🇨🇳 在中国",
      phrase: "你好",
      items: ["更多用于熟人之间"],
    },
    why: "在美国这类文化里，简短的问候被当作维持公共空间友好氛围的礼仪动作，不代表要建立关系，不回应反而显得冷淡。而在中文语境里，主动问候通常意味着「我们认识」，所以对陌生人开口的门槛更高——这不是谁更热情或更冷漠，只是问候承载的意思不一样。",
    preview: {
      us: "👋🌍",
      china: "👋👨‍👩‍👧",
    },
  },
  {
    id: "keep-chatting",
    title: "打完招呼会继续聊吗",
    // Deliberately not "...Continue?" — e2e/navigation-spine.spec.ts and
    // e2e/notice.spec.ts both scope their Continue-button query by the
    // accessible-name substring "Continue" and assume it's unique on the
    // page; this card's own header button would otherwise match too.
    subtitle: "Does the Chat Go On?",
    us: {
      flag: "🇺🇸",
      label: "🇺🇸 In the US",
      phrase: "So, how's it going?",
      items: ["再聊几句", "自然过渡", "才算结束"],
    },
    china: {
      flag: "🇨🇳",
      label: "🇨🇳 在中国",
      phrase: "你好，再见",
      items: ["打完即可", "点头示意", "各走各路"],
    },
    why: "英语打招呼后接着聊几句，是为了避免「话说一半突然安静」的尴尬——很多英语使用者把突然沉默当成不自然的信号，于是用几句小话题填一下再道别。中文语境里，礼貌到位就可以结束，继续追问反而可能显得没话找话。",
    preview: {
      us: "😃↔😃",
      china: "😃✓",
    },
  },
  {
    id: "small-talk-topics",
    title: "通常会聊什么",
    subtitle: "What They Talk About",
    us: {
      flag: "🇺🇸",
      label: "🇺🇸 In the US",
      phrase: "How are you?",
      items: ["天气", "今天过得怎么样", "周末计划"],
    },
    china: {
      flag: "🇨🇳",
      label: "🇨🇳 在中国",
      phrase: "吃了吗？去哪儿？最近怎么样？",
      items: ["工作忙不忙", "孩子/家人", "身体好不好"],
    },
    why: "这类寒暄话题的作用都是打开一个安全、无压力的开场，让对话能往下走而不冒犯任何人——两边文化选的都是「安全话题」这个功能，只是具体聊什么不一样。知道这一点，就不用再纠结要不要认真回答 \"How are you?\"，接一句 \"Good, thanks! And you?\" 就够了。",
    preview: {
      us: "☀️☕🐶",
      china: "🍚💼👨‍👩‍👧",
    },
  },
];
