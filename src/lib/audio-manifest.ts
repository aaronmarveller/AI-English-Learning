import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import {
  CHECKIN_EXPRESSIONS,
  CLOSING_EXPRESSIONS,
  GREETING_EXPRESSIONS,
  RESPONSE_COMBO,
  RESPONSE_STEPS,
} from "@/content/explore";

/**
 * Single source of truth for every piece of English text that gets
 * pre-generated as an audio file (ticket 13; spec.md user story 85: "Emily
 * 的固定台词能预生成成音频文件").
 *
 * Deliberately scoped to text that is genuinely FIXED — content authored
 * once in src/content/*.ts, not text the LLM generates fresh per turn.
 * Emily's Check-in/Response/Closing replies during Practice are generated
 * live by src/lib/practice-judge.ts and use browser-synthesis fallback.
 * Completion replies are the exception: AI Configuration defines a fixed
 * three-message pool, so those messages belong in this manifest too.
 *
 * Consumed by two places that must never drift apart:
 * - scripts/generate-audio.ts (build time): iterates this list and writes
 *   `public/audio/<id>.mp3` for each entry.
 * - src/lib/speech-synthesis.ts (runtime): looks up `speak(text)`'s input
 *   against this same list's `text` values to find a pre-generated file to
 *   play before falling back to browser synthesis.
 *
 * `id` becomes the audio filename and must stay stable — renaming an `id`
 * orphans the previously generated file (harmless: the runtime just won't
 * find a match and falls back to browser synthesis until the next
 * `npm run generate:audio`).
 */
export type AudioManifestEntry = {
  id: string;
  /** Exact English text this audio file is the pronunciation of. Matched
   * verbatim (no normalization) against `speak()`'s input at runtime. */
  text: string;
};

export const AUDIO_MANIFEST: AudioManifestEntry[] = [
  // Emily's opening line pool (5) — spoken before any learner turn exists.
  ...GREETING_SOMEBODY_LESSON.openingLines.map((line) => ({ id: line.id, text: line.en })),

  // The fixed post-Closing encouragement that unlocks Learning Summary.
  ...GREETING_SOMEBODY_LESSON.completionMessages.map((text, index) => ({
    id: `completion-${index + 1}`,
    text,
  })),

  // Silence-timeout nudge pool (issue #16 expanded this from one fixed line
  // to 3 — src/content/lesson.ts's GREETING_SOMEBODY_LESSON.silenceNudgeLines).
  // "nudge-0" is kept pointing at the original line so the file already
  // generated under public/audio/ still matches.
  ...GREETING_SOMEBODY_LESSON.silenceNudgeLines.map((line, index) => ({
    id: `nudge-${index}`,
    text: line.en,
  })),

  // Check-in Conversation Script pool (3, issue #16/#17). "How's it going?"
  // is verbatim-identical to Explore's checkin-hows-it-going expression, so
  // it's filtered out here and reuses that entry's recording instead of
  // getting a second one for the same text (same reasoning as openingLines'
  // filter above).
  ...GREETING_SOMEBODY_LESSON.checkinLines
    .filter(
      (line) => !CHECKIN_EXPRESSIONS.some((expression) => expression.expression === line.en),
    )
    .map((line, index) => ({ id: `checkin-script-${index + 1}`, text: line.en })),

  // Response Conversation Script's two sub-pools (3 + 3, issue #16/#17) —
  // selected by `learner_asked_back`, see src/content/lesson.ts's
  // RESPONSE_LINES doc comment.
  ...GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.map((line, index) => ({
    id: `response-script-no-askback-${index + 1}`,
    text: line.en,
  })),
  ...GREETING_SOMEBODY_LESSON.responseLines.askedBack.map((line, index) => ({
    id: `response-script-askback-${index + 1}`,
    text: line.en,
  })),

  // Closing Conversation Script pool (4, issue #16/#17). Three of the four
  // lines are verbatim-identical to Explore's closing expressions (after
  // standardising Explore's punctuation to match — see explore.ts's
  // CLOSING_EXPRESSIONS doc comment and issue #12's "Punctuation is
  // load-bearing in the audio manifest"), so they're filtered out here and
  // reuse those entries' recordings instead of getting a second one each.
  ...GREETING_SOMEBODY_LESSON.closingLines
    .filter(
      (line) => !CLOSING_EXPRESSIONS.some((expression) => expression.expression === line.en),
    )
    .map((line, index) => ({ id: `closing-script-${index + 1}`, text: line.en })),

  // Per-state `needs_retry` pools (4 states x 3, issue #16/#17) — spoken
  // when a learner's turn for that state is judged `needs_retry`.
  ...ACTIVE_CONVERSATION_STATES.flatMap((state) =>
    GREETING_SOMEBODY_LESSON.script[state].needsRetryLines.map((line, index) => ({
      id: `needs-retry-${state}-${index + 1}`,
      text: line.en,
    })),
  ),

  // Explore page's 13 pronounceable texts: 3 sections x 3 expressions each,
  // plus the Response section's 3 steps and their 1 combined combo sentence.
  // If Explore and Practice use the exact same phrase, reuse the Practice
  // opening audio entry instead of generating a second file for identical
  // text. Runtime lookup is text-based, so both surfaces receive that audio.
  ...GREETING_EXPRESSIONS.filter(
    (expression) =>
      !GREETING_SOMEBODY_LESSON.openingLines.some((line) => line.en === expression.expression),
  ).map((expression) => ({ id: expression.id, text: expression.expression })),
  { id: "greeting-good-morning", text: "Good morning." },
  { id: "greeting-good-afternoon", text: "Good afternoon." },
  { id: "greeting-good-evening", text: "Good evening." },
  ...CHECKIN_EXPRESSIONS.map((expression) => ({ id: expression.id, text: expression.expression })),
  ...CLOSING_EXPRESSIONS.map((expression) => ({ id: expression.id, text: expression.expression })),
  ...RESPONSE_STEPS.map((step) => ({ id: step.id, text: step.expression })),
  { id: RESPONSE_COMBO.id, text: RESPONSE_COMBO.expression },
];

// speech-synthesis.ts looks up a pre-generated file by exact `text`, so two
// entries sharing the same text would silently collide (whichever's audio
// file happens to get matched). Fail loudly at module load instead of
// letting that happen quietly at runtime.
{
  const seenTexts = new Set<string>();
  for (const entry of AUDIO_MANIFEST) {
    if (seenTexts.has(entry.text)) {
      throw new Error(`audio-manifest.ts: duplicate text for pre-generated audio: "${entry.text}"`);
    }
    seenTexts.add(entry.text);
  }
}
