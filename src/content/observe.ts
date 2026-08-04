/**
 * Content for the Observe page (ticket 05): the scene name, the four
 * "Watch for" beats, and the video/caption asset paths. Single data source
 * so the page/components stay presentational — see spec.md "模块划分" >
 * 课程内容模块 ("组件只消费，不硬编码文案").
 *
 * The four `category` strings below are the same 4-category taxonomy
 * ticket 06 (Explore) groups its Key Expressions under (打招呼/问候/回应/
 * 结束对话) — keep them byte-for-byte identical if either page's copy ever
 * changes, since consistency between Observe's "watch for this" priming
 * and Explore's grouping is the point.
 */

export type WatchForItem = {
  /** Canonical Chinese category name — shared with ticket 06's Explore taxonomy. */
  category: "打招呼" | "问候" | "回应" | "结束对话";
  /** English gloss, shown as a secondary label only. */
  categoryLabelEn: string;
  /** What to notice during this beat of the scene, in Chinese. */
  description: string;
};

export const OBSERVE_CONTENT = {
  sceneName: "邻里偶遇打招呼",
  sceneNameEn: "Neighbors Greeting Each Other",
  video: {
    // No video file exists anywhere in this repo yet (spec.md "Further
    // Notes" lists an 18s clip as an already-provided asset, but a repo
    // search turned up nothing — verified before writing this). The player
    // is built for real against this placeholder path; the real ~18s clip
    // drops in at this path later with no code changes needed.
    src: "/video/greeting-somebody-observe.mp4",
    captionsSrc: "/video/greeting-somebody-observe.vtt",
    durationSeconds: 18,
  },
  watchFor: [
    {
      category: "打招呼",
      categoryLabelEn: "Greeting",
      description: "注意 Emily 主动开口的第一句。",
    },
    {
      category: "问候",
      categoryLabelEn: "Check-in",
      description: "注意她怎么问候对方。",
    },
    {
      category: "回应",
      categoryLabelEn: "Response",
      description: "注意邻居怎么接住问候、又怎么把话题递回来。",
    },
    {
      category: "结束对话",
      categoryLabelEn: "Closing",
      description: "注意两人怎么很自然地收尾。",
    },
  ],
} satisfies {
  sceneName: string;
  sceneNameEn: string;
  video: { src: string; captionsSrc: string; durationSeconds: number };
  watchFor: readonly WatchForItem[];
};
