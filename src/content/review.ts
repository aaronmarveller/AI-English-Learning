/** Learner-facing copy for the Learning Summary shown by the internal Review stage. */
export const LEARNING_SUMMARY_HEADLINE = {
  en: "Learning Summary",
  zh: "你的学习总结",
  supportingZh: "看看你今天完成了什么，继续练习吧！",
};

// The summary always follows Praise → Highlights → Suggestion → Closing.
export const PRAISE_TEMPLATES = [
  "Great job today!",
  "Nice work!",
  "Well done!",
  "You did a great job!",
  "Thanks for practicing with me!",
  "Excellent effort!",
];

/**
 * Highlight text pools, one per Learning Summary group (issue #20; #12's
 * "Learning Summary inputs are derived, not reported"). These four groups —
 * not the old model-reported `highlight_key` taxonomy — are what
 * src/lib/feedback-selector.ts selects from: Greeting (the `greeting`
 * state), Check-in (the `checkin` state), Conversation (the `response` and
 * `closing` states combined), and Overall (the run as a whole).
 */
export const HIGHLIGHT_TEMPLATES: Record<"greeting" | "checkin" | "conversation" | "overall", string[]> = {
  greeting: [
    "You greeted naturally.",
    "You used a friendly greeting.",
    "You started the conversation with confidence.",
  ],
  checkin: [
    "You answered the check-in naturally.",
    "You shared how you were doing clearly.",
    "You handled the check-in with ease.",
  ],
  conversation: [
    "You kept the conversation going.",
    "You responded smoothly.",
    "You communicated your ideas clearly.",
  ],
  overall: [
    "You completed the whole conversation.",
    "You finished every step of the conversation.",
    "You made it through the entire chat with Emily.",
  ],
};

/** Fallback copy when there isn't yet a real accomplishment to draw a highlight from (e.g. a learner reaching /review?debug=1 without having played Practice) — still positive, just not tied to a specific group. */
export const GENERIC_HIGHLIGHT_TEMPLATES = [
  "You completed the conversation successfully.",
  "You spoke with confidence.",
  "You did a great job expressing yourself.",
];

export const NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES = [
  "Try speaking a little more confidently.",
  "Keep practicing every day.",
  "Try using more natural expressions.",
];

export const GENERIC_GROWTH_SUGGESTION_TEMPLATES = [
  "Try another greeting next time.",
  "Try responding a little faster.",
  "Try using more natural expressions.",
];

export const CLOSING_TEMPLATES = [
  "See you in the next lesson!",
  "Keep up the great work!",
  "I'm looking forward to practicing again!",
  "See you next time!",
  "You're making great progress!",
];
