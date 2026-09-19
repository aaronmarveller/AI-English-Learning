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
 * once in src/content/*.ts, not text the LLM generates fresh per turn. That is
 * every line Emily says: since issue #16 the model only *judges* the learner's
 * message (src/lib/practice-judge.ts) and the client picks her reply from the
 * Lesson's fixed pools, so the Check-in, Response, Closing, Completion and
 * `needs_retry` pools below are all pre-generated here — only text with no
 * fixed pool (a dynamic Chinese help follow-up) reaches live TTS or
 * browser-synthesis fallback at runtime.
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
  // Emily's opening line pool (deliberately 1 line — a self-introduction, see
  // src/content/lesson.ts's OPENING_LINES and ADR-0013) — spoken before any
  // learner turn exists.
  ...GREETING_SOMEBODY_LESSON.openingLines.map((line) => ({ id: line.id, text: line.en })),

  // The Completion pool: the ONE short final line Emily speaks once Practice
  // is complete (issue #55 re-authored these from v2 ticket 5's Closing
  // table — they used to be "Great job! Let's check your learning summary."-
  // style congratulations). They are farewells now, so they overlap the
  // Closing pool and Explore's closing expressions: "See you!" is
  // verbatim-identical to Explore's closing-see-you expression, and the
  // manifest throws at module load on duplicate text, so the survivors are
  // filtered against CLOSING_EXPRESSIONS exactly as the Closing pool below is
  // and renumbered by position among survivors. Their recordings are
  // therefore SHARED with Explore's rather than duplicated, which is the same
  // trade the check-in and closing pools already make. Because the ids are
  // positional and the texts changed, `completion-1..3.mp3` had to be deleted
  // before `npm run generate:audio` ran (see the check-in comment below for
  // why leaving them would have been silently wrong).
  ...GREETING_SOMEBODY_LESSON.completionMessages
    .filter(
      (text) => !CLOSING_EXPRESSIONS.some((expression) => expression.expression === text),
    )
    .map((text, index) => ({ id: `completion-${index + 1}`, text })),

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
  // getting a second one for the same text. The two surviving entries are
  // renumbered by position.
  //
  // A line whose TEXT is re-authored under an id that already has a file
  // (ADR-0013 did that to five pools at once) must have that file deleted
  // first: src/lib/speech-synthesis.ts resolves a recording by exact text
  // match, while scripts/generate-audio.ts skips any file that already exists
  // — so without the delete the old recording survives under the same id and
  // nothing fails. audio-manifest.test.ts only checks that the ids line up,
  // never that a file's audio matches its text.
  ...GREETING_SOMEBODY_LESSON.checkinLines
    .filter(
      (line) => !CHECKIN_EXPRESSIONS.some((expression) => expression.expression === line.en),
    )
    .map((line, index) => ({ id: `checkin-script-${index + 1}`, text: line.en })),

  // Response Conversation Script's two sub-pools (6 + 4, issue #16/#17;
  // re-authored by ADR-0013) — selected by `learner_asked_back`, see
  // src/content/lesson.ts's RESPONSE_LINES doc comment.
  ...GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.map((line, index) => ({
    id: `response-script-no-askback-${index + 1}`,
    text: line.en,
  })),
  ...GREETING_SOMEBODY_LESSON.responseLines.askedBack.map((line, index) => ({
    id: `response-script-askback-${index + 1}`,
    text: line.en,
  })),

  // Closing Conversation Script pool (3, issue #16/#17; re-authored by issue
  // #55 from v2 ticket 5's Closing table). Every line in the pool is
  // verbatim-identical to an Explore closing expression (after standardising
  // Explore's punctuation to match — see explore.ts's CLOSING_EXPRESSIONS doc
  // comment and issue #12's "Punctuation is load-bearing in the audio
  // manifest"), so the filter below leaves this pool contributing ZERO
  // entries: Emily's Closing steers are all spoken from Explore's own
  // recordings. That is intended, not an oversight — the runtime resolves a
  // recording by exact text, so filtering the pool out here is exactly how
  // the sharing is expressed. The filter stays even though nothing currently
  // survives it, so a future line added to the pool gets its own entry
  // instead of silently falling back to browser synthesis.
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
