import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deserialize,
  getCurrentTurnEmilyMessages,
  recordTurnResult,
  resetPractice,
  type PracticeMessage,
} from "@/lib/practice-state";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import type { StateTurnRecord } from "@/lib/turn-record";

/**
 * Issue #20 (#12's Further Notes: "In-flight practice sessions will reset"),
 * issue #47 (ADR-0012: "The practice store persists `goalProgress` instead of
 * `conversationState`; snapshots without it are discarded on load"), and issue
 * #52's follow-up on #51 (the store's per-Goal bookkeeping is `retryCounts`
 * now, not `attemptCounts` — see the rename's coverage at the end of this
 * describe): the persisted practice store's `deserialize` must discard a shape
 * mismatch wholesale rather than crash or silently mix old and new data. Three
 * concrete cases are real: pre-issue-#20 builds persisted `highlightKeys` (a
 * flat `HighlightKey[]`) instead of the `turnRecords: StateTurnRecord[]` this
 * store now depends on, pre-issue-#47 builds persisted a `conversationState`
 * pointer instead of `goalProgress`, and pre-issue-#52 builds persisted
 * `attemptCounts` — a count of every submission, where `retryCounts` counts
 * only `needs_retry` Turns. Loading any of them must produce a clean "no saved
 * state" restart, not a thrown exception, not a store with `goalProgress:
 * undefined` that later crashes goal-progress.ts, and — the case the rename
 * exists for — not a set of submission counts silently re-read as retries.
 */
describe("practice-state deserialize — discard-safely on shape mismatch", () => {
  const INITIAL_STATE_SHAPE = {
    goalProgress: [],
    messages: [],
    turnRecords: [],
    retryCounts: {},
  };

  it("discards a pre-issue-#20 snapshot (highlightKeys, no turnRecords) instead of crashing", () => {
    const oldShape = JSON.stringify({
      conversationState: "checkin",
      messages: [
        { id: "seed-1", role: "emily", textEn: "Hi there!", textZh: "嗨！", state: "greeting" },
        { id: "seed-2", role: "learner", textEn: "Hi!", textZh: "", state: "greeting" },
      ],
      highlightKeys: ["used-whitelist-phrase"],
    });

    expect(() => deserialize(oldShape)).not.toThrow();
    expect(deserialize(oldShape)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a pre-issue-#47 snapshot (a conversationState pointer, no goalProgress)", () => {
    const preGoalProgressShape = JSON.stringify({
      conversationState: "checkin",
      messages: [
        { id: "seed-1", role: "emily", textEn: "Hi there!", textZh: "嗨！", state: "greeting" },
        { id: "seed-2", role: "learner", textEn: "Hi!", textZh: "", state: "greeting" },
      ],
      turnRecords: [
        { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
      ],
      attemptCounts: { greeting: 1 },
    });

    expect(() => deserialize(preGoalProgressShape)).not.toThrow();
    expect(deserialize(preGoalProgressShape)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot with the old attemptCounts shape (no retryCounts), never re-reading submissions as retries", () => {
    // Post-#51, pre-#52: every field is present and well-shaped and the
    // snapshot is otherwise exactly current — only `attemptCounts` counts
    // submissions rather than `needs_retry` Turns. Every value in it would be a
    // legal `retryCounts` value too (both are per-Goal numbers), so nothing
    // distinguishes the two readings once the field has been renamed: the
    // absence of `retryCounts` is the whole signal, and it discards the
    // snapshot. Reinterpreting `{ greeting: 3 }` as "greeting was retried
    // three times" would re-rank the Learning Summary of a learner who never
    // retried anything (docs/ai-configuration.md section 5).
    const oldCountingShape = JSON.stringify({
      goalProgress: ["greeting"],
      messages: [
        { id: "seed-1", role: "emily", textEn: "How are you today?", textZh: "你今天怎么样？", state: "checkin" },
      ],
      turnRecords: [
        { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
      ],
      attemptCounts: { greeting: 3 },
    });

    expect(deserialize(oldCountingShape)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot whose goalProgress is malformed", () => {
    const malformed = JSON.stringify({
      goalProgress: ["greeting", "goodbye"],
      messages: [],
      turnRecords: [],
      retryCounts: {},
    });

    expect(deserialize(malformed)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot whose turnRecords entries are malformed", () => {
    const malformed = JSON.stringify({
      goalProgress: ["greeting"],
      messages: [],
      turnRecords: [{ state: "greeting", passedFirstTry: "yes" }], // wrong type, missing fields
      retryCounts: {},
    });

    expect(deserialize(malformed)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot where turnRecords is missing entirely", () => {
    const missing = JSON.stringify({ goalProgress: ["greeting"], messages: [] });
    expect(deserialize(missing)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot where turnRecords isn't an array", () => {
    const wrongType = JSON.stringify({
      goalProgress: ["greeting"],
      messages: [],
      turnRecords: "not-an-array",
    });
    expect(deserialize(wrongType)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("falls back to the initial state on totally malformed JSON input shape (non-object)", () => {
    expect(deserialize(JSON.stringify("just a string"))).toEqual(INITIAL_STATE_SHAPE);
    expect(deserialize(JSON.stringify(null))).toEqual(INITIAL_STATE_SHAPE);
  });

  it("accepts a well-formed current-shape snapshot and preserves its Goal Progress, turnRecords and retryCounts", () => {
    const current = JSON.stringify({
      goalProgress: ["greeting", "checkin"],
      messages: [],
      turnRecords: [
        { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
        { state: "checkin", passedFirstTry: false, matchedAcceptedResponse: false, learnerAskedBack: true },
      ],
      retryCounts: { checkin: 1 },
    });

    const result = deserialize(current);
    expect(result.goalProgress).toEqual(["greeting", "checkin"]);
    expect(result.turnRecords).toHaveLength(2);
    expect(result.turnRecords[1]).toEqual({
      state: "checkin",
      passedFirstTry: false,
      matchedAcceptedResponse: false,
      learnerAskedBack: true,
    });
    expect(result.retryCounts).toEqual({ checkin: 1 });
  });

  it("keeps a non-contiguous Goal Progress set intact, exactly as persisted (ADR-0012)", () => {
    const nonContiguous = JSON.stringify({
      goalProgress: ["closing"],
      messages: [],
      turnRecords: [
        { state: "closing", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      ],
      retryCounts: {},
    });

    expect(deserialize(nonContiguous).goalProgress).toEqual(["closing"]);
  });

  it("sanitizes a malformed entry inside retryCounts without discarding the whole snapshot", () => {
    // The field being *present* is the shape signal; a corrupt value inside it
    // is not evidence of a pre-change snapshot, so it degrades per-entry.
    const current = JSON.stringify({
      goalProgress: [],
      messages: [],
      turnRecords: [],
      retryCounts: { greeting: "two", checkin: 3, notARealState: 5 },
    });

    const result = deserialize(current);
    expect(result.turnRecords).toEqual([]);
    expect(result.retryCounts).toEqual({ checkin: 3 });
  });

  it("discards a snapshot whose retryCounts isn't an object at all", () => {
    const malformed = JSON.stringify({
      goalProgress: ["greeting"],
      messages: [],
      turnRecords: [],
      retryCounts: "not-an-object",
    });

    expect(deserialize(malformed)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("keeps a message persisted before #48, which has no sequenceId (issue #48)", () => {
    // The marker issue #48 added is optional precisely so a snapshot a live
    // learner is mid-conversation with keeps loading — practice-conversation
    // .spec.ts's reload test seeds this exact shape and expects the last line
    // back.
    const preSequenceShape = JSON.stringify({
      goalProgress: ["greeting"],
      messages: [
        { id: "seed-1", role: "emily", textEn: "Hi there!", textZh: "嗨！", state: "greeting" },
        { id: "seed-2", role: "learner", textEn: "Hi!", textZh: "", state: "greeting" },
        {
          id: "seed-3",
          role: "emily",
          textEn: "How are you today?",
          textZh: "你今天怎么样？",
          state: "checkin",
        },
      ],
      turnRecords: [
        { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
      ],
      retryCounts: {},
    });

    const result = deserialize(preSequenceShape);
    expect(result.messages).toHaveLength(3);
    expect(result.messages.every((message) => message.sequenceId === undefined)).toBe(true);
    expect(getCurrentTurnEmilyMessages(result.messages).map((message) => message.textEn)).toEqual([
      "How are you today?",
    ]);
  });

  it("keeps a message's sequenceId when one is present", () => {
    const current = JSON.stringify({
      goalProgress: [],
      messages: [
        {
          id: "seed-1",
          role: "emily",
          textEn: "Hi there!",
          textZh: "嗨！",
          state: "greeting",
          sequenceId: "practice-sequence-1",
        },
        // A wrong type is invalid, exactly like any other malformed field.
        { id: "seed-2", role: "learner", textEn: "Hi!", textZh: "", state: "greeting", sequenceId: 7 },
      ],
      turnRecords: [],
      retryCounts: {},
    });

    expect(deserialize(current).messages.map((message) => message.sequenceId)).toEqual([
      "practice-sequence-1",
    ]);
  });
});

/**
 * Issue #48: one learner Turn can achieve several Conversation Goals at once
 * (ADR-0012) and is answered by a *sequence* of Conversation Script lines
 * (docs/ai-configuration.md section 3). `recordTurnResult` is where that
 * reaches the transcript, so these tests pin the two things the rest of the
 * app reads off it: every `achieved` Goal joins Goal Progress in that one
 * Turn, and each line becomes its own `PracticeMessage`, in order, in a
 * single write.
 *
 * The store has no exported snapshot reader (src/lib/practice-state.ts is
 * `"use client"` — practice-page-content.tsx reads it through the
 * `usePractice` hook, which can't be called outside React), so these tests
 * drive it the way the browser does: a minimal `window.localStorage` is
 * stubbed in, and what got persisted is read back with the module's own
 * `deserialize`. Counting `setItem` calls is what proves the single-write
 * requirement.
 */
describe("recordTurnResult — one Turn, several Goals, one sequence of lines", () => {
  const STORAGE_KEY = "greeting-somebody:practice";
  const written: string[] = [];

  beforeEach(() => {
    written.length = 0;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: (key: string, value: string) => {
          if (key === STORAGE_KEY) written.push(value);
        },
      },
    });
    resetPractice();
    written.length = 0;
  });

  function persistedMessages(): PracticeMessage[] {
    return deserialize(written[written.length - 1]).messages;
  }

  it("adds every Goal the report achieved in that one Turn, and never asks for them again", () => {
    const progress = recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { greeting: "achieved", checkin: "achieved", response: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.closingLines.slice(0, 1),
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: true,
    });

    expect(progress).toEqual(["greeting", "checkin", "response"]);

    // A later Turn's report cannot re-credit them, and the open Goals the
    // Judge would be asked about are the ones never achieved.
    const afterClosing = recordTurnResult({
      focusGoal: "closing",
      verdict: "accepted",
      goalReport: { greeting: "achieved", checkin: "achieved", closing: "achieved" },
      replyLines: [],
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: false,
    });
    expect(afterClosing).toEqual(["greeting", "checkin", "response", "closing"]);
  });

  it("persists one message per Script line, in order, in a single write", () => {
    const [reaction, steer] = [
      GREETING_SOMEBODY_LESSON.responseLines.askedBack[0],
      GREETING_SOMEBODY_LESSON.closingLines[0],
    ];

    recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { greeting: "achieved", checkin: "achieved", response: "achieved" },
      replyLines: [reaction, steer],
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: true,
    });

    expect(written).toHaveLength(1);
    const messages = persistedMessages();
    expect(messages).toEqual([
      {
        id: expect.any(String),
        role: "emily",
        textEn: reaction.en,
        textZh: reaction.zh,
        state: "greeting",
        sequenceId: expect.any(String),
      },
      {
        id: expect.any(String),
        role: "emily",
        textEn: steer.en,
        textZh: steer.zh,
        state: "greeting",
        sequenceId: expect.any(String),
      },
    ]);
    // Same write, same sequence: this is what tells the current-turn bubble
    // these two lines are one Turn (see `getCurrentTurnEmilyMessages`).
    expect(messages[0].sequenceId).toBe(messages[1].sequenceId);
  });

  it("saves nothing from a needs_retry Turn, even a Goal it marked achieved", () => {
    const progress = recordTurnResult({
      focusGoal: "greeting",
      verdict: "needs_retry",
      goalReport: { greeting: "achieved", checkin: "failed" },
      replyLines: GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines.slice(0, 1),
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: false,
    });

    expect(progress).toEqual([]);
    expect(persistedMessages()).toHaveLength(1);
  });
});

/**
 * Issue #51 (ADR-0012's Consequences: "`StateTurnRecord` bookkeeping keeps its
 * meaning but changes its grain: an attempt counts against the Focus Goal only,
 * so a Goal achieved early is always `passedFirstTry`; `matchedAcceptedResponse`
 * stays whole-sentence exact match, so a multi-Goal sentence matches none of
 * them"). One record is appended per Goal *achieved* in the Turn, in canonical
 * order — not one record per accepted Turn, attributed to the Focus Goal.
 *
 * Issue #52's follow-up on #51: "an attempt counts against the Focus Goal only"
 * was implemented as a *submission* counter, which is wrong the moment Goals
 * arrive out of order — a `needs_retry` Turn is what makes a Goal not-first-try,
 * so only those are counted now (`retryCounts`). The four-Goal out-of-order
 * accumulation below is the boundary: `closing` achieved while Check-in was the
 * Focus Goal is first-try, Check-in's own record is not, and an all-`accepted`
 * run with no retry anywhere is first-try throughout.
 *
 * These are the records the Learning Summary's Highlights and its Suggestion
 * pool are derived from, so the ticket example has to come out exactly as
 * docs/ai-configuration.md section 5 describes: "Hi Emily! I'm good, thanks.
 * How are you?" produces Greeting, Check-in and Response records, all
 * first-try, none a verbatim Accepted Response match, "asked back" on the
 * Response record only.
 *
 * Same seam as the sibling describe: the store exports no snapshot reader
 * (src/lib/practice-state.ts is `"use client"`), so `window.localStorage` is
 * stubbed in and what was persisted is read back with the module's own
 * `deserialize`. Every call below passes at least one reply line, because the
 * store only persists through `appendMessages` — a Turn that produced no line
 * (which the Conversation Script never does) would leave its attempt count in
 * memory only.
 */
describe("recordTurnResult — one record per Goal achieved, in canonical order", () => {
  const STORAGE_KEY = "greeting-somebody:practice";
  const written: string[] = [];

  beforeEach(() => {
    written.length = 0;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: (key: string, value: string) => {
          if (key === STORAGE_KEY) written.push(value);
        },
      },
    });
    resetPractice();
    written.length = 0;
  });

  function persistedTurnRecords(): StateTurnRecord[] {
    return deserialize(written[written.length - 1]).turnRecords;
  }

  it("records the ticket example's three-Goal Turn, all first-try, none a verbatim match, asked-back on response only", () => {
    const progress = recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { greeting: "achieved", checkin: "achieved", response: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.closingLines.slice(0, 1),
      // The learner composed one sentence rather than quoting an Accepted
      // Response, so the page hands over the empty set even though three Goals
      // were achieved: whole-sentence exact match matches none of them.
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: true,
    });

    expect(progress).toEqual(["greeting", "checkin", "response"]);
    expect(persistedTurnRecords()).toEqual([
      { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      { state: "checkin", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      { state: "response", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: true },
    ]);
  });

  it("keeps a single-Goal Turn's Accepted Response match, on that Goal's record alone", () => {
    recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { greeting: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.checkinLines.slice(0, 1),
      matchedAcceptedResponseGoals: ["greeting"],
      learnerAskedBack: false,
    });

    expect(persistedTurnRecords()).toEqual([
      { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
    ]);
  });

  it("has the Focus Goal's own record reflect its prior needs_retry Turns on it", () => {
    recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { greeting: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.checkinLines.slice(0, 1),
      matchedAcceptedResponseGoals: ["greeting"],
      learnerAskedBack: false,
    });
    recordTurnResult({
      focusGoal: "checkin",
      verdict: "needs_retry",
      goalReport: {},
      replyLines: GREETING_SOMEBODY_LESSON.script.checkin.needsRetryLines.slice(0, 1),
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: false,
    });
    recordTurnResult({
      focusGoal: "checkin",
      verdict: "accepted",
      goalReport: { checkin: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.slice(0, 1),
      matchedAcceptedResponseGoals: ["checkin"],
      learnerAskedBack: false,
    });

    expect(persistedTurnRecords()).toEqual([
      { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
      { state: "checkin", passedFirstTry: false, matchedAcceptedResponse: true, learnerAskedBack: false },
    ]);
  });

  it("credits a Goal achieved while it was not the Focus Goal as first-try, accumulating out of order", () => {
    // Check-in is the Focus Goal from the second Turn on, and the third Turn is
    // a retry Turn for it — a Turn that happens to achieve `closing` instead.
    // Attempts are counted against the Focus Goal, so `closing` is first-try
    // even though that Turn was Check-in's second attempt, while Check-in's own
    // record is not.
    recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { greeting: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.checkinLines.slice(0, 1),
      matchedAcceptedResponseGoals: ["greeting"],
      learnerAskedBack: false,
    });
    recordTurnResult({
      focusGoal: "checkin",
      verdict: "needs_retry",
      goalReport: {},
      replyLines: GREETING_SOMEBODY_LESSON.script.checkin.needsRetryLines.slice(0, 1),
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: false,
    });
    recordTurnResult({
      focusGoal: "checkin",
      verdict: "accepted",
      goalReport: { closing: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.closingLines.slice(0, 1),
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: false,
    });
    recordTurnResult({
      focusGoal: "checkin",
      verdict: "accepted",
      goalReport: { checkin: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.responseLines.didNotAskBack.slice(0, 1),
      matchedAcceptedResponseGoals: ["checkin"],
      learnerAskedBack: true,
    });

    // `closing` is recorded before `checkin` — a non-contiguous accumulation
    // order (issue #51's acceptance criterion), one record per Goal.
    expect(persistedTurnRecords()).toEqual([
      { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
      { state: "closing", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      { state: "checkin", passedFirstTry: false, matchedAcceptedResponse: true, learnerAskedBack: false },
    ]);
  });

  it("credits an out-of-order run with no retry anywhere as every record first-try", () => {
    // Issue #50's own scenario — "I'm fine, thanks!" → "Thanks" → "Hi!" — with
    // every Turn `accepted`: each one achieves a *later* Goal while `greeting`
    // stays open, so the Focus Goal is Greeting for all three Turns and the
    // records accumulate in the order checkin, response, greeting.
    //
    // No learner ever retried anything, so every record must be first-try.
    // Counting *submissions* against the Focus Goal instead of retries would
    // book two attempts against Greeting before its own Turn (one per earlier
    // accepted Turn) and report its achievement as retried, which re-ranks the
    // Learning Summary and switches docs/ai-configuration.md section 5's
    // suggestion to the needed-retry pool — for a learner who never retried
    // (issue #52's follow-up on #51's acceptance criterion).
    recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { checkin: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines.slice(0, 1),
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: false,
    });
    recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { response: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.script.greeting.needsRetryLines.slice(1, 2),
      matchedAcceptedResponseGoals: [],
      learnerAskedBack: false,
    });
    recordTurnResult({
      focusGoal: "greeting",
      verdict: "accepted",
      goalReport: { greeting: "achieved" },
      replyLines: GREETING_SOMEBODY_LESSON.checkinLines.slice(0, 1),
      matchedAcceptedResponseGoals: ["greeting"],
      learnerAskedBack: false,
    });

    expect(persistedTurnRecords()).toEqual([
      { state: "checkin", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      { state: "response", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
    ]);
    // Nothing was booked as a retry at any point: the only thing that makes a
    // Goal not-first-try is a `needs_retry` Turn on it.
    expect(
      deserialize(written[written.length - 1]).retryCounts,
    ).toEqual({});
  });
});

/**
 * The current Turn's Emily lines, as the Practice page's bubble and autoplay
 * read them. "The current Turn" means the messages one `appendMessages` call
 * wrote together (`sequenceId`), *not* whatever Emily messages happen to sit
 * next to each other at the tail: a silence nudge arrives with no learner
 * message in front of it, and the opening line has none either, so an
 * adjacency walk renders "Hi! No rush — whenever you're ready." as if Emily
 * had said both in one breath (practice-support.spec.ts's "learner silence
 * produces exactly one gentle nudge" caught exactly that).
 */
describe("getCurrentTurnEmilyMessages", () => {
  const emily = (id: string, sequenceId?: string): PracticeMessage => ({
    id,
    role: "emily",
    textEn: id,
    textZh: `${id}-zh`,
    state: "greeting",
    ...(sequenceId === undefined ? {} : { sequenceId }),
  });
  const learner = (id: string, sequenceId?: string): PracticeMessage => ({
    id,
    role: "learner",
    textEn: id,
    textZh: "",
    state: "greeting",
    ...(sequenceId === undefined ? {} : { sequenceId }),
  });

  it("is empty before anything has been said", () => {
    expect(getCurrentTurnEmilyMessages([])).toEqual([]);
  });

  it("is empty when the only message is the learner's own echo", () => {
    expect(getCurrentTurnEmilyMessages([learner("l1", "s1")])).toEqual([]);
  });

  it("is the opening line before the learner has replied", () => {
    expect(getCurrentTurnEmilyMessages([emily("e0", "s0")]).map((m) => m.id)).toEqual(["e0"]);
  });

  it("keeps Emily's line while her greeting's answer is being graded", () => {
    // The learner's echo is the last message; the pair on screen is Emily's
    // line above it.
    expect(getCurrentTurnEmilyMessages([emily("e0", "s0"), learner("l1", "s1")]).map((m) => m.id)).toEqual([
      "e0",
    ]);
  });

  it("returns a one-line Turn as a single message", () => {
    expect(
      getCurrentTurnEmilyMessages([
        emily("e0", "s0"),
        learner("l1", "s1"),
        emily("e1", "s1"),
      ]).map((m) => m.id),
    ).toEqual(["e1"]);
  });

  it("returns a multi-line Turn in the order Emily spoke it", () => {
    expect(
      getCurrentTurnEmilyMessages([
        emily("e0", "s0"),
        learner("l1", "s1"),
        emily("e1a", "s1"),
        emily("e1b", "s1"),
      ]).map((m) => m.id),
    ).toEqual(["e1a", "e1b"]);
  });

  it("keeps a multi-line Turn whole while the learner's next answer is being graded", () => {
    expect(
      getCurrentTurnEmilyMessages([
        emily("e0", "s0"),
        learner("l1", "s1"),
        emily("e1a", "s1"),
        emily("e1b", "s1"),
        learner("l2", "s2"),
      ]).map((m) => m.id),
    ).toEqual(["e1a", "e1b"]);
  });

  it("returns a silence nudge alone, not joined to the line before it", () => {
    // Regression: the nudge is its own Turn, even though the only message
    // between it and the opening line is nothing at all.
    expect(
      getCurrentTurnEmilyMessages([emily("e0", "s0"), emily("nudge", "s1")]).map((m) => m.id),
    ).toEqual(["nudge"]);
  });

  it("returns a nudge that landed after a multi-line Turn alone too", () => {
    expect(
      getCurrentTurnEmilyMessages([
        emily("e0", "s0"),
        learner("l1", "s1"),
        emily("e1a", "s1"),
        emily("e1b", "s1"),
        emily("nudge", "s2"),
      ]).map((m) => m.id),
    ).toEqual(["nudge"]);
  });

  it("returns the newest of two adjacent Emily messages that arrived separately", () => {
    expect(
      getCurrentTurnEmilyMessages([emily("e0", "s0"), emily("n1", "s1"), emily("n2", "s2")]).map((m) => m.id),
    ).toEqual(["n2"]);
  });

  it("treats a message persisted before #48 (no sequenceId) as its own Turn", () => {
    // The shape practice-conversation.spec.ts's reload test seeds: one line
    // per Turn, no marker — so the last line is the whole Turn, exactly as the
    // pre-#48 bubble showed it.
    expect(
      getCurrentTurnEmilyMessages([emily("e0"), learner("l1"), emily("e1")]).map((m) => m.id),
    ).toEqual(["e1"]);
  });

  it("stops at a legacy message when a new Turn follows it", () => {
    expect(
      getCurrentTurnEmilyMessages([
        emily("e0"),
        learner("l1"),
        emily("e1a", "s1"),
        emily("e1b", "s1"),
      ]).map((m) => m.id),
    ).toEqual(["e1a", "e1b"]);
  });
});
