/**
 * Feedback selection module (ticket 11; spec.md "模块划分" > "Feedback 选择
 * 模块 — 纯函数，输入本次练习累积的表现标记，输出四段反馈"). Pure function,
 * same discipline as src/lib/conversation-state-machine.ts: no React, no
 * localStorage, no fetch — just `HighlightKey[]` in, `FeedbackLine[]` out.
 *
 * Randomness choice: rather than reaching for a hidden module-level RNG (or
 * a seed parameter that would leak a testing concern into the production
 * signature), `random` is an injectable `() => number` defaulting to
 * `Math.random`. That keeps the function pure and trivially swappable for a
 * deterministic fake if this repo ever grows a unit-test runner; today (per
 * spec.md "Testing Decisions", this repo has none) the E2E seam
 * (e2e/review.spec.ts) instead asserts on *shape* — fixed ordering, fixed
 * counts, and that the rendered highlight text always comes from the pool
 * belonging to a key actually present in `highlightKeys` — rather than
 * pinning exact random output.
 *
 * Fixed output contract (this ticket's own checklist):
 *   1 encouragement → 2-3 highlights → 1 suggestion → 1 closing, in that
 *   exact order, every time — even when `highlightKeys` is empty (e.g. a
 *   learner reaches /review?debug=1 without having played Practice), via
 *   src/content/review.ts's generic fallback pools.
 */

import type { HighlightKey } from "@/content/practice";
import {
  CLOSING_TEMPLATES,
  ENCOURAGEMENT_TEMPLATES,
  GENERIC_GROWTH_SUGGESTION_TEMPLATES,
  GENERIC_HIGHLIGHT_TEMPLATES,
  HIGHLIGHT_TEMPLATES,
  NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES,
  WENT_OFF_TOPIC_SUGGESTION_TEMPLATES,
} from "@/content/review";

export type FeedbackLineKind = "encouragement" | "highlight" | "suggestion" | "closing";

export type FeedbackLine = {
  id: string;
  kind: FeedbackLineKind;
  /** Chinese narration, with any English example phrase embedded verbatim inline. */
  textZh: string;
};

/** The subset of HighlightKey values that are genuinely positive/highlight-worthy and have a template pool above — see the doc comments on HIGHLIGHT_KEYS in src/content/practice.ts. The remaining 2 keys ("needs-more-practice", "went-off-topic") are diagnostic-only and feed suggestions instead — see `selectSuggestionPool` below. */
const POSITIVE_HIGHLIGHT_KEYS = Object.keys(HIGHLIGHT_TEMPLATES) as (keyof typeof HIGHLIGHT_TEMPLATES)[];

/** How many highlight lines to show — the ticket's own fixed range. */
const HIGHLIGHT_COUNT_OPTIONS = [2, 3] as const;

function pickOne<T>(pool: readonly T[], random: () => number): T {
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  return pool[index];
}

/** Fisher-Yates shuffle (using the injected `random`) then take the first `count` — used to pick several *distinct* items from a pool without replacement. */
function pickDistinct<T>(pool: readonly T[], count: number, random: () => number): T[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Builds the 2-3 highlight lines, reflecting the distinct positive markers
 * this conversation's `highlightKeys` actually contains (this ticket's core
 * requirement: "亮点依据 Practice 累积的表现标记选择，反映本次真实表现而非
 * 固定文案").
 */
function selectHighlightTexts(highlightKeys: HighlightKey[], count: number, random: () => number): string[] {
  const distinctPositiveKeys = POSITIVE_HIGHLIGHT_KEYS.filter((key) => highlightKeys.includes(key));

  if (distinctPositiveKeys.length === 0) {
    // No positive marker ever fired (including the "empty conversation"
    // case) — fall back to generic-but-still-positive copy rather than
    // rendering nothing.
    return pickDistinct(GENERIC_HIGHLIGHT_TEMPLATES, count, random);
  }

  if (distinctPositiveKeys.length === 1) {
    // Only ONE distinct positive signal fired across the whole conversation
    // (e.g. every accepted turn happened to tag "natural-paraphrase") — draw
    // several *differently worded* variants from that single key's pool so
    // the learner doesn't see one sentence repeated verbatim.
    return pickDistinct(HIGHLIGHT_TEMPLATES[distinctPositiveKeys[0]], count, random);
  }

  // Multiple distinct positive signals fired — pick up to `count` of the
  // keys that actually occurred, one phrasing variant per key, so the
  // highlights reflect the *range* of what went well.
  const chosenKeys = pickDistinct(distinctPositiveKeys, count, random);
  const texts = chosenKeys.map((key) => pickOne(HIGHLIGHT_TEMPLATES[key], random));

  // Fewer distinct keys were available than `count` (e.g. 2 keys fired but
  // the roll wanted 3 highlights) — top up with a second, different variant
  // from one of the already-chosen keys rather than falling short.
  while (texts.length < count) {
    const key = pickOne(chosenKeys, random);
    const unused = HIGHLIGHT_TEMPLATES[key].filter((text) => !texts.includes(text));
    if (unused.length === 0) break;
    texts.push(pickOne(unused, random));
  }

  return texts;
}

/**
 * Picks the single suggestion, grounded in whichever diagnostic signal
 * ("needs-more-practice" or "went-off-topic") occurred EARLIEST in the
 * conversation, if either occurred at all — always positively framed as
 * "下次试试" (this ticket: "建议以「下次试试」的正向措辞给出，不强调错误、不
 * 使用负面评价"). Falls back to a generic positive-growth suggestion when
 * neither diagnostic signal ever fired (a clean run).
 */
function selectSuggestionPool(highlightKeys: HighlightKey[]): string[] {
  const needsMoreIndex = highlightKeys.indexOf("needs-more-practice");
  const offTopicIndex = highlightKeys.indexOf("went-off-topic");

  if (needsMoreIndex === -1 && offTopicIndex === -1) {
    return GENERIC_GROWTH_SUGGESTION_TEMPLATES;
  }
  if (offTopicIndex === -1 || (needsMoreIndex !== -1 && needsMoreIndex <= offTopicIndex)) {
    return NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES;
  }
  return WENT_OFF_TOPIC_SUGGESTION_TEMPLATES;
}

/**
 * Selects this run's 4-part Chinese feedback, in fixed order: 1
 * encouragement → 2-3 highlights → 1 suggestion → 1 closing.
 *
 * @param highlightKeys The current practice run's accumulated `highlightKey`
 *   list (`usePractice().highlightKeys`), one per learner turn, in order.
 * @param random Injectable RNG, defaulting to `Math.random` — see this
 *   file's doc comment for why.
 */
export function selectFeedback(
  highlightKeys: HighlightKey[],
  random: () => number = Math.random,
): FeedbackLine[] {
  const lines: FeedbackLine[] = [
    { id: "encouragement", kind: "encouragement", textZh: pickOne(ENCOURAGEMENT_TEMPLATES, random) },
  ];

  const highlightCount = pickOne(HIGHLIGHT_COUNT_OPTIONS, random);
  const highlightTexts = selectHighlightTexts(highlightKeys, highlightCount, random);
  highlightTexts.forEach((textZh, index) => {
    lines.push({ id: `highlight-${index}`, kind: "highlight", textZh });
  });

  lines.push({
    id: "suggestion",
    kind: "suggestion",
    textZh: pickOne(selectSuggestionPool(highlightKeys), random),
  });

  lines.push({ id: "closing", kind: "closing", textZh: pickOne(CLOSING_TEMPLATES, random) });

  return lines;
}
