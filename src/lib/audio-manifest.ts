import {
  CHECKIN_EXPRESSIONS,
  CLOSING_EXPRESSIONS,
  GREETING_EXPRESSIONS,
  RESPONSE_COMBO,
  RESPONSE_STEPS,
} from "@/content/explore";

/**
 * Single source of truth for every piece of English text that gets
 * pre-generated as an audio file: Explore's pronounceable expressions (3
 * sections x 3 expressions each, plus the Response section's 3 steps and
 * their combined combo sentence). Emily's voice in a Call is not pre-generated
 * — it is streamed live over the Realtime connection.
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
  ...GREETING_EXPRESSIONS.map((expression) => ({ id: expression.id, text: expression.expression })),
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
