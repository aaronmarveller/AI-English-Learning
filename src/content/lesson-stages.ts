/**
 * The Lesson's four stages — greeting, check-in, response, closing — and
 * their labels. Observe's "watch for" categories and Explore's section
 * headings both name these same four stages, so their Chinese and English
 * labels live in this one place.
 *
 * Two Chinese label lengths: `labelZhLong` is the descriptive form used for
 * headings and categories. Explore's four section headers read these labels.
 */

export const LESSON_STAGES = ["greeting", "checkin", "response", "closing"] as const;

export type LessonStage = (typeof LESSON_STAGES)[number];

export type LessonStageLabel = {
  key: LessonStage;
  /** Descriptive Chinese label — Explore's section heading, Observe's "watch for" category name. */
  labelZhLong: string;
  /** English label — used everywhere (subtitle text, "watch for" gloss). */
  labelEn: string;
};

export const LESSON_STAGE_LABELS: Record<LessonStage, LessonStageLabel> = {
  greeting: { key: "greeting", labelZhLong: "打招呼", labelEn: "Greeting" },
  checkin: { key: "checkin", labelZhLong: "问候近况", labelEn: "Check-in" },
  response: { key: "response", labelZhLong: "回应与继续交流", labelEn: "Response & Keep It Going" },
  closing: { key: "closing", labelZhLong: "结束交流", labelEn: "Closing" },
};
