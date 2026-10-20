/**
 * Content for the Observe page: the headline, the "看看视频，想一想"
 * thinking prompts and the video/caption asset paths. Single data source
 * so the page/components stay presentational — see spec.md "模块划分" >
 * 课程内容模块 ("组件只消费，不硬编码文案").
 */

export type ThinkingPrompt = {
  /** Optional English lead-in (e.g. a quoted phrase) shown before the Chinese. */
  en?: string;
  zh: string;
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
  sceneName: "邻里偶遇打招呼",
  video: {
    src: "/video/greeting-somebody-observe.mp4",
    captionsSrc: "/video/greeting-somebody-observe.vtt",
  },
} satisfies {
  headlineLines: readonly string[];
  thinkingPrompts: { title: string; items: readonly ThinkingPrompt[] };
  sceneName: string;
  video: { src: string; captionsSrc: string };
};
