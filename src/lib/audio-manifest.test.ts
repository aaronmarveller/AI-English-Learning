import { readdirSync } from "node:fs";
import { resolve } from "node:path";
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
   * text-match lookup resolves both surfaces to the same recording. This is
   * Explore's own content pin, and it locks the punctuation in so it can't
   * silently drift back apart — from whichever side a future edit starts.
   * (Since issue #55 the *dependency* runs Closing→Explore rather than the
   * other way: the pool was re-authored to these three lines, and the test
   * below pins that direction.)
   */
  it("Explore's closing expressions are exactly the three Closing-pool lines (one shared recording each)", () => {
    expect(CLOSING_EXPRESSIONS.map((expression) => expression.expression)).toEqual([
      "See you!",
      "Have a nice day!",
      "Take care!",
    ]);
  });

  /**
   * Issue #55 re-authored the Closing pool to exactly Explore's three closing
   * expressions, so the pool contributes no manifest entries of its own — all
   * three steers are spoken from Explore's recordings (see
   * src/lib/audio-manifest.ts's Closing comment). Without this pin, adding a
   * line to the pool would quietly add a *second* recording of a phrase
   * Explore already has, which is the duplication the manifest's duplicate-text
   * guard exists to catch but which the filter would silently prevent it from
   * seeing.
   */
  it("every Closing-pool line is one of Explore's closing expressions (the pool shares their recordings)", () => {
    const exploreClosingExpressions = CLOSING_EXPRESSIONS.map(
      (expression) => expression.expression,
    );
    for (const line of GREETING_SOMEBODY_LESSON.closingLines) {
      expect(exploreClosingExpressions).toContain(line.en);
    }
  });

  it("keeps every Chinese help line out of the pre-generated audio manifest", () => {
    const chineseHelpLines = Object.values(GREETING_SOMEBODY_LESSON.chineseHelp).flatMap((help) => [
      help.meaning,
      help.whenToUse,
      help.example,
      help.encouragement,
    ]);

    for (const line of chineseHelpLines) {
      expect(manifestTexts.has(line)).toBe(false);
    }
  });
});

describe("Audio manifest — generated file integrity", () => {
  const manifestFileNames = AUDIO_MANIFEST.map((entry) => `${entry.id}.mp3`).sort();
  const generatedFileNames = readdirSync(resolve(process.cwd(), "public/audio"))
    .filter((fileName) => fileName.endsWith(".mp3"))
    .sort();
  const manifestFileNameSet = new Set(manifestFileNames);
  const generatedFileNameSet = new Set(generatedFileNames);

  it("has a generated MP3 for every manifest entry", () => {
    expect(manifestFileNames.filter((fileName) => !generatedFileNameSet.has(fileName))).toEqual([]);
  });

  it("has no orphan MP3 outside the manifest", () => {
    expect(generatedFileNames.filter((fileName) => !manifestFileNameSet.has(fileName))).toEqual([]);
  });
});
