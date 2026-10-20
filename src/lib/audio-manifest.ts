/**
 * Single source of truth for every piece of English text that gets
 * pre-generated as an audio file: Explore's 25 spoken lines, derived from
 * src/content/explore.ts. Emily's voice in a Call is not pre-generated
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
import { EXPLORE_SECTIONS, EXPLORE_SECTION_ORDER, type Expression } from "@/content/explore";

export type AudioManifestEntry = {
  id: string;
  /** Exact English text this audio file is the pronunciation of. Matched
   * verbatim (no normalization) against `speak()`'s input at runtime. */
  text: string;
};

/** Time-based greeting lines get one file each; the card's own id is not a file. */
const TIME_BASED_IDS: Record<string, string> = {
  "Good morning.": "greeting-good-morning",
  "Good afternoon.": "greeting-good-afternoon",
  "Good evening.": "greeting-good-evening",
};

function entriesFor(expression: Expression): AudioManifestEntry[] {
  if (expression.lines.length === 1) {
    return [{ id: expression.id, text: expression.lines[0] }];
  }
  return expression.lines.map((text) => {
    const id = TIME_BASED_IDS[text];
    if (!id) throw new Error(`audio-manifest.ts: no audio id for multi-line expression line "${text}"`);
    return { id, text };
  });
}

/** One entry per spoken Explore line (main + Explore More): 25 in total. */
export const AUDIO_MANIFEST: AudioManifestEntry[] = EXPLORE_SECTION_ORDER.flatMap((key) =>
  [...EXPLORE_SECTIONS[key].main, ...EXPLORE_SECTIONS[key].more].flatMap(entriesFor),
);

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
