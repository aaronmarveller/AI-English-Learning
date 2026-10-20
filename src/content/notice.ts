/**
 * Content for the Notice page (#78): three Notice Cards about what a
 * greeting means. Single data source so components stay presentational —
 * all copy, photos and icons are named here.
 *
 * Each card contrasts two readings (`left` green, `right` red). `items` are
 * card 2's scene tiles and card 3's cue rows; card 1 has none and uses the
 * side's big `icon` instead.
 *
 * Photo files are placeholders: the real ones drop in at these paths with no
 * code change (a missing file renders as an empty circle).
 */

export type NoticeIconName =
  | "wave"
  | "heart"
  | "coffee"
  | "fork-knife"
  | "shopping-bag"
  | "briefcase"
  | "house"
  | "users"
  | "chat-bubble"
  | "user"
  | "exit"
  | "x"
  | "clock";

export type NoticeSide = {
  titleEn: string;
  titleZh: string;
  description?: string;
  /** Big icon (card 1) and the collapsed photo's corner badge. */
  icon: NoticeIconName;
  photo: { src: string; alt: string };
  /** Card 2 scenes / card 3 cues. */
  items?: { icon: NoticeIconName; label: string }[];
};

export type NoticeCard = {
  id: "greeting-intention" | "conversation-length" | "conversation-cues";
  question: string;
  left: NoticeSide;
  right: NoticeSide;
  tip: string;
};

export const NOTICE_HEADLINE = {
  en: "Discover What Greetings Mean.",
  zh: "点击卡片，发现对话背后的含义。",
};

export const NOTICE_CARDS: NoticeCard[] = [
  {
    id: "greeting-intention",
    question: "“How are you?” 真的是在问近况吗？",
    left: {
      titleEn: "Friendly Greeting",
      titleZh: "礼貌寒暄",
      description: "表达友好，不一定期待详细回答。",
      icon: "wave",
      photo: { src: "/assets/notice/greeting-intention-friendly.webp", alt: "" },
    },
    right: {
      titleEn: "Genuine Check-in",
      titleZh: "真正关心",
      description: "想了解你的近况，可以多分享一些。",
      icon: "heart",
      photo: { src: "/assets/notice/greeting-intention-genuine.webp", alt: "" },
    },
    tip: "就像中文的“吃了吗？”，有时只是打个招呼，有时是真的关心你。",
  },
  {
    id: "conversation-length",
    question: "为什么有的对话短，有的会多聊？",
    left: {
      titleEn: "Quick Greeting",
      titleZh: "简短问候",
      description: "简单回应，然后继续当前的事。",
      icon: "coffee",
      photo: { src: "/assets/notice/conversation-length-quick.webp", alt: "" },
      items: [
        { icon: "coffee", label: "咖啡店" },
        { icon: "fork-knife", label: "餐厅" },
        { icon: "shopping-bag", label: "商店" },
      ],
    },
    right: {
      titleEn: "Small Talk",
      titleZh: "日常寒暄",
      description: "可以分享近况，再多聊几句。",
      icon: "users",
      photo: { src: "/assets/notice/conversation-length-small-talk.webp", alt: "" },
      items: [
        { icon: "briefcase", label: "同事" },
        { icon: "house", label: "邻居" },
        { icon: "users", label: "朋友" },
      ],
    },
    tip: "这只是常见例子。聊多久，还要看彼此的关系、当下的情况和对方的反应。",
  },
  {
    id: "conversation-cues",
    question: "怎么判断继续聊还是结束？",
    left: {
      titleEn: "Keep Talking",
      titleZh: "可能想继续聊",
      icon: "chat-bubble",
      photo: { src: "/assets/notice/conversation-cues-keep-talking.webp", alt: "" },
      items: [
        { icon: "chat-bubble", label: "对方继续提问" },
        { icon: "user", label: "主动分享近况" },
        { icon: "clock", label: "愿意停下来聊" },
      ],
    },
    right: {
      titleEn: "Move On",
      titleZh: "可能准备结束",
      icon: "wave",
      photo: { src: "/assets/notice/conversation-cues-move-on.webp", alt: "" },
      items: [
        { icon: "exit", label: "准备离开" },
        { icon: "x", label: "忙于其他事" },
        { icon: "wave", label: "表示要结束" },
      ],
    },
    tip: "看看对方的反应，不是每次都需要多聊。",
  },
];
