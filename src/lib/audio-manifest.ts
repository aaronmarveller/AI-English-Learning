/**
 * Single source of truth for every piece of English text that gets
 * pre-generated as an audio file: Explore's pronounceable expressions. Emily's voice in a Call is not pre-generated
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

// TODO(#85): rebuild from the new Explore content (src/content/explore.ts:
// one entry per spoken line, 25 in total) and regenerate public/audio. Until
// then this keeps the previously generated files playable; any Explore line
// without an entry falls back to browser speech.
export const AUDIO_MANIFEST: AudioManifestEntry[] = [
  { id: "greeting-hello", text: "Hello." },
  { id: "greeting-hi", text: "Hi!" },
  { id: "greeting-time-based", text: "Good morning. / Good afternoon. / Good evening." },
  { id: "greeting-good-morning", text: "Good morning." },
  { id: "greeting-good-afternoon", text: "Good afternoon." },
  { id: "greeting-good-evening", text: "Good evening." },
  { id: "checkin-how-are-you", text: "How are you?" },
  { id: "checkin-how-are-you-doing", text: "How are you doing?" },
  { id: "checkin-hows-it-going", text: "How's it going?" },
  { id: "closing-see-you", text: "See you!" },
  { id: "closing-have-a-nice-day", text: "Have a nice day!" },
  { id: "closing-take-care", text: "Take care!" },
  { id: "response-1", text: "I'm good." },
  { id: "response-2", text: "Thank you." },
  { id: "response-3", text: "How about you?" },
  { id: "response-combo", text: "I'm good. Thank you. How about you?" },
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
