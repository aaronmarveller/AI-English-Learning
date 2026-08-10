/**
 * Pure client-side CJK detection (issue #18; docs/ai-configuration.md
 * section 4's Verdict/Turn Outcome table; ADR-0007 "support_requested
 * decided client-side"). This is what lets a learner's Chinese input resolve
 * to the `support_requested` Turn Outcome without ever reaching the Judge —
 * see src/lib/submit-practice-turn.ts's caller
 * (src/components/practice/practice-page-content.tsx), which calls this
 * function first and skips the `/api/practice/turn` request entirely when it
 * returns true.
 *
 * Deliberately narrow, per the parent epic's Implementation Decisions
 * ("Turn Outcome, and where support_requested is decided"): detecting
 * Chinese is trivially and reliably done locally, so this only has to answer
 * one question — does at least one Chinese character (a CJK ideograph)
 * appear anywhere in the text? A learner typing "你好, how are you?" partway
 * through learning English is still asking for help, not producing a valid
 * English attempt, so this is deliberately "contains any Chinese", not
 * "is entirely Chinese".
 *
 * Punctuation never triggers this on its own — including CJK-specific
 * punctuation (full-width "，", "。", "？", "！", etc.) and plain ASCII
 * punctuation. A punctuation-only submission has no CJK ideographs in it, so
 * it's left for the Judge to evaluate as a bad English attempt rather than
 * silently short-circuited here.
 *
 * The pattern covers CJK Unified Ideographs (U+4E00–U+9FFF) and CJK Unified
 * Ideographs Extension A (U+3400–U+4DBF) — together, the block that covers
 * the overwhelming majority of everyday Simplified and Traditional Chinese
 * text. Rarer supplementary-plane extensions are intentionally out of scope;
 * they're not something a learner types by accident, and false negatives on
 * that vanishingly rare content just fall through to the Judge instead of
 * crashing anything.
 */
const CJK_CHARACTER_PATTERN = /[一-鿿㐀-䶿]/;

/** True if `text` contains at least one Chinese (CJK) character anywhere in it. */
export function containsChineseText(text: string): boolean {
  return CJK_CHARACTER_PATTERN.test(text);
}
