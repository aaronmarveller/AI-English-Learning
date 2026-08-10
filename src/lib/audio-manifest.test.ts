import { describe, expect, it } from "vitest";
import { AUDIO_MANIFEST } from "@/lib/audio-manifest";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import { CLOSING_EXPRESSIONS } from "@/content/explore";

/**
 * Issue #17 (docs/ai-configuration.md section 3; spec.md "Audio"): every
 * line in every Conversation Script pool must have a pre-generated audio
 * manifest entry — a learner should never hear browser speech synthesis
 * partway through the lesson because a newly authored line shipped with no
 * recording. This is the content invariant called out in issue #12's
 * Testing Decisions ("Content invariants: every scripted line has an audio
 * manifest entry"): it fails the moment a scripted line is added to
 * src/content/lesson.ts without a matching src/lib/audio-manifest.ts entry.
 */
describe("Audio manifest — every scripted Lesson line has an entry", () => {
  const manifestTexts = new Set(AUDIO_MANIFEST.map((entry) => entry.text));

  function expectCovered(label: string, text: string): void {
    it(`${label}: "${text}" has a pre-generated-audio manifest entry`, () => {
      expect(manifestTexts.has(text)).toBe(true);
    });
  }

  for (const line of GREETING_SOMEBODY_LESSON.openingLines) {
    expectCovered("opening", line.en);
  }

  for (const message of GREETING_SOMEBODY_LESSON.completionMessages) {
    expectCovered("completion", message);
  }

  for (const line of GREETING_SOMEBODY_LESSON.checkinLines) {
    expectCovered("checkin", line.en);
  }

  for (const line of GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack) {
    expectCovered("response (did not ask back)", line.en);
  }

  for (const line of GREETING_SOMEBODY_LESSON.responseLines.askedBack) {
    expectCovered("response (asked back)", line.en);
  }

  for (const line of GREETING_SOMEBODY_LESSON.closingLines) {
    expectCovered("closing", line.en);
  }

  for (const state of ACTIVE_CONVERSATION_STATES) {
    for (const line of GREETING_SOMEBODY_LESSON.script[state].needsRetryLines) {
      expectCovered(`needsRetry(${state})`, line.en);
    }
  }

  for (const line of GREETING_SOMEBODY_LESSON.silenceNudgeLines) {
    expectCovered("silenceNudge", line.en);
  }

  /**
   * Punctuation collision (issue #12 Further Notes: "Punctuation is
   * load-bearing in the audio manifest"): the Closing pool and Explore's
   * equivalent expressions used to differ only in punctuation ("See you!"
   * vs "See you.") — same words, two separate recordings. The fix
   * standardises on the AI Configuration form (exclamation marks) so exact
   * text-match lookup resolves both surfaces to the same recording. This
   * locks the punctuation in so it can't silently drift back apart.
   */
  it("Explore's closing expressions use the Closing pool's exact punctuation (share one recording, not two)", () => {
    expect(CLOSING_EXPRESSIONS.map((expression) => expression.expression)).toEqual([
      "See you!",
      "Have a nice day!",
      "Take care!",
    ]);
  });
});
