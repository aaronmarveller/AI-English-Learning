import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIO_MANIFEST } from "@/lib/audio-manifest";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import { CLOSING_EXPRESSIONS } from "@/content/explore";

const CONTAINS_CHINESE = /[\u3400-\u9fff]/u;

/**
 * One of the two Goals' borrowed steer pools — the `steerLines` only
 * `greeting` and `response` carry (`PracticeStateScript.steerLines` is
 * optional): `checkin` steers from `checkinLines` and `closing` from
 * `closingLines`, so #56's follow-up deleted their pools and their six
 * recordings rather than leaving lines that only looked speakable. Asserted
 * rather than defaulted to `[]`, and restricted to those two Goals by its
 * parameter type, so this file states the shape it is covering instead of
 * looping over a field most Goals no longer have.
 */
function borrowedSteerLines(goal: "greeting" | "response") {
  const pool = GREETING_SOMEBODY_LESSON.script[goal].steerLines;
  if (pool === undefined) throw new Error(`${goal} carries no borrowed steer pool`);
  return pool;
}

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

  /**
   * The borrowed steer pools, on the two Goals that carry one — six lines, six
   * recordings (#56's follow-up deleted the other two Goals' pools along with
   * theirs; see `borrowedSteerLines` above). The manifest emits them through
   * the same optional field, so this is also where "every emit-able pool has
   * an entry" is stated per line.
   */
  for (const goal of ["greeting", "response"] as const) {
    for (const line of borrowedSteerLines(goal)) {
      expectCovered(`steer(${goal})`, line.en);
    }
  }

  /**
   * Issue #56's two-tier Recovery — every line a `needs_retry` Turn can speak.
   * One `it()` per line, like the pools above, so a Recovery line losing its
   * entry names itself rather than hiding in a loop. The `null`s are skipped
   * rather than asserted here — which Goals author an off-topic nudge or a
   * question of their own is the Recovery table's shape, and
   * emily-reply-selector.test.ts's pool-size describe pins it against the
   * selector's `null` branches. `checkin`'s question is the one that is
   * `null`: it is the Check-in pool's, already covered above.
   */
  for (const state of ACTIVE_CONVERSATION_STATES) {
    const recovery = GREETING_SOMEBODY_LESSON.script[state].recovery;
    expectCovered(`recovery(${state}) unclear nudge`, recovery.unclearNudge.en);
    if (recovery.offTopicNudge !== null) {
      expectCovered(`recovery(${state}) off-topic nudge`, recovery.offTopicNudge.en);
    }
    if (recovery.question !== null) {
      expectCovered(`recovery(${state}) question`, recovery.question.en);
    }
    expectCovered(`recovery(${state}) direct example`, recovery.directExample.en);
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

  it("keeps every Chinese line out of the pre-generated audio manifest", () => {
    // Emily's Chinese translations (the per-message subtitle toggle) are never
    // pre-generated: the manifest is English-only, matched by exact text
    // against whatever `speak()` is handed. The Ask-in-Chinese help content is
    // the bulk of that, and since issue #56 every Conversation Script line's
    // own `zh` belongs in the same list — the two live side by side in
    // src/content/lesson.ts, which is exactly how a translation could drift
    // into the manifest unnoticed.
    const chineseHelpLines = Object.values(GREETING_SOMEBODY_LESSON.chineseHelp).flatMap((help) => [
      help.meaning,
      help.whenToUse,
      help.example,
      help.encouragement,
    ]);
    const scriptLineTranslations = [
      ...GREETING_SOMEBODY_LESSON.openingLines.map((line) => line.zh),
      ...GREETING_SOMEBODY_LESSON.checkinLines.map((line) => line.zh),
      ...GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.map((line) => line.zh),
      ...GREETING_SOMEBODY_LESSON.responseLines.askedBack.map((line) => line.zh),
      ...GREETING_SOMEBODY_LESSON.closingLines.map((line) => line.zh),
      ...GREETING_SOMEBODY_LESSON.silenceNudgeLines.map((line) => line.zh),
      // The borrowed steer pools, on the two Goals that carry one (see
      // `borrowedSteerLines`) — read through the helper so the list stays
      // "every translation this Lesson actually has".
      ...borrowedSteerLines("greeting").map((line) => line.zh),
      ...borrowedSteerLines("response").map((line) => line.zh),
      ...Object.values(GREETING_SOMEBODY_LESSON.script).flatMap((script) => [
        script.recovery.unclearNudge.zh,
        ...(script.recovery.offTopicNudge === null ? [] : [script.recovery.offTopicNudge.zh]),
        ...(script.recovery.question === null ? [] : [script.recovery.question.zh]),
        script.recovery.directExample.zh,
      ]),
    ];

    for (const line of [...chineseHelpLines, ...scriptLineTranslations]) {
      expect(line.length, "an empty translation would make this check vacuous").toBeGreaterThan(0);
      expect(manifestTexts.has(line), `Chinese text in the manifest: ${line}`).toBe(false);
    }

    // The same rule read from the manifest's side, which catches an entry that
    // no Lesson line produced: nothing pre-generated is Chinese at all.
    for (const entry of AUDIO_MANIFEST) {
      expect(entry.text, `a manifest entry is not English: ${entry.text}`).not.toMatch(
        CONTAINS_CHINESE,
      );
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
