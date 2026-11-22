/**
 * Content for the Observe page: the headline, the "看看视频，想一想"
 * thinking prompts and the ordered list of scene videos. Single data source
 * so the page/components stay presentational — see spec.md "模块划分" >
 * 课程内容模块 ("组件只消费，不硬编码文案").
 */

export type ThinkingPrompt = {
  /** Optional English lead-in (e.g. a quoted phrase) shown before the Chinese. */
  en?: string;
  zh: string;
};

export type ObserveScene = {
  /** Stable key; also the suffix of this scene's test ids. */
  id: string;
  nameEn: string;
  /** Used for the poster overlay's accessible label. */
  nameZh: string;
  emoji: string;
  tag: { en: string; zh: string; tone: "green" | "blue" };
  video: { src: string; captionsEnSrc: string; captionsZhSrc: string; poster: string };
};

export const OBSERVE_CONTENT = {
  headlineLines: ["Same greeting.", "Different conversations."],
  thinkingPrompts: {
    title: "看看视频，想一想",
    items: [
      { en: "How are you?", zh: "真的在问近况吗？" },
      { zh: "为什么有的聊得短，有的聊得久？" },
      { zh: "什么时候该继续聊，什么时候该结束？" },
    ],
  },
  scenes: [
    {
      id: "coffee-shop",
      nameEn: "At a Coffee Shop",
      nameZh: "咖啡店里打招呼",
      emoji: "☕",
      tag: { en: "Quick Greeting", zh: "简短问候", tone: "green" },
      // The mp4 is a placeholder still. To swap in the real clip, replace it
      // and update only the cue timings in the coffee-shop VTTs — see
      // public/video/README.md.
      video: {
        src: "/video/greeting-coffee-shop.mp4",
        captionsEnSrc: "/video/greeting-coffee-shop.en.vtt",
        captionsZhSrc: "/video/greeting-coffee-shop.zh.vtt",
        poster: "/assets/observe/coffee-shop-poster.png",
      },
    },
    {
      id: "neighbor",
      nameEn: "Meeting a Neighbor",
      nameZh: "邻里偶遇打招呼",
      emoji: "🏠",
      tag: { en: "Casual Small Talk", zh: "日常寒暄", tone: "blue" },
      video: {
        src: "/video/greeting-somebody-observe.mp4",
        captionsEnSrc: "/video/greeting-somebody-observe.en.vtt",
        captionsZhSrc: "/video/greeting-somebody-observe.zh.vtt",
        poster: "/assets/observe/neighbor-poster.jpg",
      },
    },
  ],
} satisfies {
  headlineLines: readonly string[];
  thinkingPrompts: { title: string; items: readonly ThinkingPrompt[] };
  scenes: readonly ObserveScene[];
};
