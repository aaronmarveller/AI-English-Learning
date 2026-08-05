import { OPENING_LINES, SILENCE_NUDGES } from "@/content/practice";
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
 * Emily's Check-in/Response/Closing/completion replies during Practice are
 * generated live by src/lib/practice-judge.ts on every turn (ticket 08's
 * "大模型契约") and have no fixed pool to pre-generate audio for — those
 * turns speak through src/lib/speech-synthesis.ts's browser-synthesis
 * fallback, same as any other unmatched text.
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
  ...OPENING_LINES.map((line) => ({ id: line.id, text: line.en })),

  // Silence-timeout nudge(s) — currently just one, but mapped generically
  // so a future addition to SILENCE_NUDGES picks up pre-generated audio
  // automatically without touching this file.
  ...SILENCE_NUDGES.map((nudge, index) => ({ id: `nudge-${index}`, text: nudge.en })),

  // Explore page's 13 pronounceable texts: 3 sections x 3 expressions each,
  // plus the Response section's 3 steps and their 1 combined combo sentence.
  ...GREETING_EXPRESSIONS.map((expression) => ({ id: expression.id, text: expression.expression })),
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
