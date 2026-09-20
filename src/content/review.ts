/**
 * Learner-facing copy for the Learning Summary shown by the internal Review
 * stage. Each line is one Chinese-majority mixed string: Highlights embed a
 * representative Lesson expression, Praise/Closing begin with a general
 * English interjection, and Suggestions are Chinese only (issue #22).
 */
export const LEARNING_SUMMARY_HEADLINE = {
  en: "Learning Summary",
  zh: "你的学习总结",
  supportingZh: "看看你今天完成了什么，继续练习吧！",
};

// The summary always follows Praise → Highlights → Suggestion → Closing.
export const PRAISE_TEMPLATES = [
  "Great job! 今天你完整练完了这段对话。",
  "Nice work! 你今天的练习完成得很好。",
  "Well done! 你把这段对话顺利说完了。",
  "Wonderful! 你认真完成了今天的英语练习。",
  "Excellent! 你一步一步完成了整段对话。",
  "Good effort! 谢谢你今天和我一起练习。",
];

/**
 * Highlight text pools, one per Learning Summary group (issue #20; #12's
 * "Learning Summary inputs are derived, not reported"). These four groups —
 * not the old model-reported `highlight_key` taxonomy — are what
 * src/lib/feedback-selector.ts selects from: Greeting (the `greeting`
 * state), Check-in (the `checkin` state), Conversation (the `response` and
 * `closing` states combined), and Overall (the run as a whole).
 *
 * The Conversation group's quoted expression is an ask-back one: per
 * docs/adr/0013-response-goal-means-asking-emily-back.md a thank-you no
 * longer achieves the `response` Goal, so a "Thank you." template would
 * quote an expression that isn't representative of what the group credits.
 */
export const HIGHLIGHT_TEMPLATES: Record<"greeting" | "checkin" | "conversation" | "overall", string[]> = {
  greeting: [
    '你用 "Hello." 自然地开始了对话。',
    '你用 "Hi." 友好地和 Emily 打了招呼。',
    '你说出 "Good morning." 时很有信心。',
  ],
  checkin: [
    'Emily 问候你时，你用 "I\'m good." 自然地回应了。',
    '你用 "I\'m fine." 清楚地表达了自己的状态。',
    '你顺利掌握了 "I\'m doing well." 这样的日常回答。',
  ],
  conversation: [
    '你用 "How about you?" 主动把问题问回给了 Emily。',
    '你会用 "And you?" 自然地把话题接给对方。',
    '你用 "See you!" 给对话画上了友好的句号。',
  ],
  overall: [
    '你从 "Hello." 到 "See you!" 完整走完了整段对话。',
    '你能用 "Hi." 开场，也能用 "Goodbye." 收尾。',
    '你完成了从 "Good morning." 到 "Have a nice day!" 的每一步。',
  ],
};

/** Fallback copy when there isn't yet a real accomplishment to draw a highlight from (e.g. a learner reaching /review?debug=1 without having played Practice) — still positive, just not tied to a specific group. */
export const GENERIC_HIGHLIGHT_TEMPLATES = [
  '你已经学会用 "Hello." 开始一段简单对话。',
  '你能用 "I\'m good." 回应日常问候。',
  '你已经能用 "See you." 自然结束对话。',
];

export const NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES = [
  "再多练几次，你会越来越有信心。",
  "把需要重试的步骤再慢慢说一遍，会更熟练。",
  "每天练一点，短句也会说得越来越自然。",
];

export const GENERIC_GROWTH_SUGGESTION_TEMPLATES = [
  "下次可以试试另一种打招呼的说法。",
  "下次可以让回应更流畅一些。",
  "继续练习，让这些日常表达更自然。",
];

export const CLOSING_TEMPLATES = [
  "Keep going! 保持这样的练习节奏。",
  "You've got this! 下次练习也继续加油。",
  "Great progress! 你正在一点一点进步。",
  "Keep it up! 期待下次再和你一起练习。",
  "Nice going! 今天的进步值得为自己开心。",
];
