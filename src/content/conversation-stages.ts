/**
 * The canonical 4-stage conversation taxonomy's labels (ticket 09; sourced
 * from a /code-review Standards-axis finding on tickets 01-09): Observe,
 * Explore, and Practice each independently hardcoded 打招呼/问候/回应/结束
 * three separate times, under three different field names, with Explore's
 * "回应" section title hardcoded a fourth time as a component special-case.
 *
 * This is the ONE place the 4 stages' Chinese and English labels are
 * defined. The 4 keys and their fixed order are NOT redefined here — they
 * still come from src/lib/conversation-state-machine.ts's
 * `ACTIVE_CONVERSATION_STATES` (re-exported below for convenience), which
 * remains the sole source of truth for the key list itself.
 *
 * Short vs. long Chinese label: auditing the 3 pre-existing hardcoded
 * copies turned up one genuine, deliberate difference — for "closing" only.
 * Practice's 4-step progress-tracker chip (a compact, space-constrained UI)
 * used the short "结束", while Observe's "watch for" category name and
 * Explore's section heading (both descriptive headings, not compact chips)
 * used the longer "结束对话". That's two different UI shapes wanting two
 * different label lengths, not an accidental drift, so both are kept:
 * `labelZh` (short) for compact UI, `labelZhLong` (descriptive) for
 * headings/categories. For the other 3 stages the two happen to be
 * identical strings — no forced distinction, just the same value in both
 * fields.
 */

import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";

export type ConversationStageLabel = {
  key: ActiveConversationState;
  /** Short Chinese label — e.g. Practice's 4-step progress-tracker chip. */
  labelZh: string;
  /**
   * Long-form/descriptive Chinese label — e.g. Explore's section heading,
   * Observe's "watch for" category name. Identical to `labelZh` except for
   * "closing" (short "结束" vs. long "结束对话").
   */
  labelZhLong: string;
  /** English label — used everywhere (subtitle text, system-prompt reference, "watch for" gloss). */
  labelEn: string;
};

export const CONVERSATION_STAGE_LABELS: Record<ActiveConversationState, ConversationStageLabel> = {
  greeting: {
    key: "greeting",
    labelZh: "打招呼",
    labelZhLong: "打招呼",
    labelEn: "Greeting",
  },
  checkin: {
    key: "checkin",
    labelZh: "问候",
    labelZhLong: "问候",
    labelEn: "Check-in",
  },
  response: {
    key: "response",
    labelZh: "回应",
    labelZhLong: "回应",
    labelEn: "Response",
  },
  closing: {
    key: "closing",
    labelZh: "结束",
    labelZhLong: "结束对话",
    labelEn: "Closing",
  },
};

/** Convenience re-export — the 4 stages in fixed display order. */
export const CONVERSATION_STAGE_ORDER = ACTIVE_CONVERSATION_STATES;
