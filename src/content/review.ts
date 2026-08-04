/**
 * Review page content — the Chinese-language feedback template pools ticket
 * 11's `selectFeedback` (src/lib/feedback-selector.ts) draws from (spec.md
 * "模块划分" > "Feedback 选择模块" and "语言口径" > "Review 全中文叙述 + 英文
 * 例句嵌入"; user stories 69-81).
 *
 * Single data source, same discipline as src/content/practice.ts: the
 * selector and the Review UI only consume these exports, never hardcode
 * copy inline. Why Chinese, verbatim from the ticket: "反馈用中文是刻意决定：
 * A1 学习者看不懂英文反馈，复盘环节的目标是让人真的接收到信息" — English
 * example sentences are kept as literal quotes embedded inside the Chinese
 * sentence (spec.md's own example: "下次试试看：I'm doing pretty good.")
 * rather than translated, so the learner has a concrete phrase to reuse.
 *
 * Every pool below has at least 2-3 differently-worded variants so a
 * conversation that only ever produced ONE distinct positive `highlightKey`
 * still reads as 2-3 distinct sentences on Review, not one line repeated
 * verbatim (this ticket's explicit robustness requirement).
 */

import type { HighlightKey } from "@/content/practice";

// --- Encouragement (always first, always exactly 1) -----------------------

export const ENCOURAGEMENT_TEMPLATES: string[] = [
  "这次聊得很棒！Emily 很喜欢和你打招呼。",
  "今天这段对话完成得很不错，能感觉到你是真的在用英语交流，而不是在背课文。",
  "干得漂亮！这一整段打招呼对话，你都自己走下来了。",
];

// --- Highlights, keyed by HighlightKey (positive markers only) ------------

/**
 * Only the 5 "accepted"-verdict keys need a pool here — `needs-more-practice`
 * and `went-off-topic` are diagnostic-only and feed the suggestion pools
 * below instead, never the highlight pools (see HIGHLIGHT_KEYS's doc
 * comments in src/content/practice.ts).
 */
export const HIGHLIGHT_TEMPLATES: Record<
  Extract<
    HighlightKey,
    | "used-whitelist-phrase"
    | "natural-paraphrase"
    | "confident-full-turn"
    | "recovered-after-retry"
    | "stayed-on-topic-after-detour"
  >,
  string[]
> = {
  "used-whitelist-phrase": [
    "你很自然地用上了课上学过的地道说法，比如 \"Hi there!\" 这样的表达，说出来完全不生硬。",
    "打招呼、问候这些环节，你用的都是英语母语者真的会说的句子，比如 \"How about you?\"，很到位。",
    "你选的词都是我们练习过的地道表达，一开口就很自然，完全不是从中文硬翻译过来的。",
  ],
  "natural-paraphrase": [
    "你没有照搬课上的原句，而是用自己的话把意思说清楚了，比如可能会说 \"Yeah, doing alright\"——这正是我们最想看到的：真正会表达，而不是背句子。",
    "有一轮你换了种说法，但意思完全对，这说明你不是在死记硬背，而是真的在用英语思考。",
    "你用了自己的表达方式，哪怕不是课本里的原句，Emily 也完全听懂了你想说什么。",
  ],
  "confident-full-turn": [
    "有一轮你不只是简单回答，还多补了一句自己的小细节，这种主动多说一点的劲儿很棒。",
    "你说的那句话信息量比要求的还多一点，听起来更像一次真实对话，而不是完成任务。",
    "你把该说的都说全了，甚至还加了点自己的话，能感觉到你已经开始享受这段对话了。",
  ],
  "recovered-after-retry": [
    "第一次没说对也没关系，你很快就调整过来再试了一次，这种愿意再来一次的韧劲很棒。",
    "遇到没通过的时候你没有放弃，稍微调整了一下说法就成功了，这正是学语言最需要的心态。",
    "卡住的那一下你没有慌，重新试了一次就说对了，这个过程比一次就答对更值得肯定。",
  ],
  "stayed-on-topic-after-detour": [
    "中间聊岔开过一下，但你很快就跟着 Emily 的引导绕回了正题，这种能被带回来的能力很重要。",
    "有一轮你先说了点别的，不过很快就重新对上了话题，说明你在跟着对话节奏走，而不是自说自话。",
    "跑题之后你没有卡住，而是顺着 Emily 的引导重新接上了话题，这个反应很自然。",
  ],
};

/**
 * Fallback highlight pool for when `highlightKeys` is empty — e.g. a learner
 * reaches `/review?debug=1` directly without having played through Practice
 * (this ticket's own edge case: "即使 highlightKeys 为空也必须返回，回退到
 * generic-but-still-positive content 而不是崩溃或不渲染"). Still positive,
 * still specific-sounding, just not tied to any one turn's performance.
 */
export const GENERIC_HIGHLIGHT_TEMPLATES: string[] = [
  "你愿意开口练习，这本身就是很棒的一步——很多人卡在这一步之前就打了退堂鼓。",
  "打招呼、问候、回应、告别，这一整套流程你都走了一遍，这就是最实在的进步。",
  "每完成一次对话练习，你的语感都会更熟悉一点，这次也不例外。",
];

// --- Suggestion (exactly 1, positively framed as "下次试试") ----------------

/** Used when `needs-more-practice` is the earliest-occurring diagnostic signal. */
export const NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES: string[] = [
  "下次试试把这句话说得更完整一点，比如把 \"I'm good\" 换成 \"I'm doing pretty good, thanks!\"，多补一点点就会更自然。",
  "下次可以试着放慢一点，把整句话说完整，比如完整说出 \"I'm good, thanks! How about you?\"，会更容易被听懂。",
  "下次遇到类似的问题，可以试着先在心里想一遍整句话再开口，比如像 \"I'm doing pretty good\" 这样把话说全。",
];

/** Used when `went-off-topic` is the earliest-occurring diagnostic signal (and `needs-more-practice` didn't occur first). */
export const WENT_OFF_TOPIC_SUGGESTION_TEMPLATES: string[] = [
  "下次如果不小心聊开了，可以试着更快地把话题带回来，比如说一句 \"Anyway...\" 再接着回答 Emily 的问题。",
  "下次可以试着多留意一下 Emily 刚刚问的是什么，跑题了也没关系，早一点绕回来就好。",
  "下次可以试着先确认一下自己在回答哪个问题，用一句像 \"Oh right, um...\" 过渡一下，再接着说。",
];

/** Used when neither diagnostic key occurred — the run was clean, so the suggestion is pure positive growth, not a fix. */
export const GENERIC_GROWTH_SUGGESTION_TEMPLATES: string[] = [
  "下次可以试试改用语音说出来，感受一下开口说英语的感觉，会和打字很不一样。",
  "下次可以试着换一种说法回答同样的问题，比如把 \"I'm good\" 换成 \"Not bad, thanks!\"，多积累几种说法。",
  "下次可以试着把某一句话说得再长一点点，加一个小细节，比如说说自己正准备去做什么。",
];

// --- Closing (always last, always exactly 1) -------------------------------

export const CLOSING_TEMPLATES: string[] = [
  "期待下次再聊！继续加油鸭！",
  "这次聊得很不错，下次再来找 Emily 练练吧！",
  "今天的练习就到这里啦，下次见！",
];
