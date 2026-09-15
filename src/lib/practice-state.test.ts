import { describe, expect, it } from "vitest";
import { deserialize } from "@/lib/practice-state";

/**
 * Issue #20 (#12's Further Notes: "In-flight practice sessions will reset")
 * and issue #47 (ADR-0012: "The practice store persists `goalProgress`
 * instead of `conversationState`; snapshots without it are discarded on
 * load"): the persisted practice store's `deserialize` must discard a shape
 * mismatch wholesale rather than crash or silently mix old and new data. Two
 * concrete cases are real: pre-issue-#20 builds persisted `highlightKeys` (a
 * flat `HighlightKey[]`) instead of the `turnRecords: StateTurnRecord[]` this
 * store now depends on, and pre-issue-#47 builds persisted a
 * `conversationState` pointer instead of `goalProgress`. Loading either must
 * produce a clean "no saved state" restart, not a thrown exception or a store
 * with `goalProgress: undefined` that later crashes goal-progress.ts.
 */
describe("practice-state deserialize — discard-safely on shape mismatch", () => {
  const INITIAL_STATE_SHAPE = {
    goalProgress: [],
    messages: [],
    turnRecords: [],
    attemptCounts: {},
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

  it("discards a snapshot whose goalProgress is malformed", () => {
    const malformed = JSON.stringify({
      goalProgress: ["greeting", "goodbye"],
      messages: [],
      turnRecords: [],
      attemptCounts: {},
    });

    expect(deserialize(malformed)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot whose turnRecords entries are malformed", () => {
    const malformed = JSON.stringify({
      goalProgress: ["greeting"],
      messages: [],
      turnRecords: [{ state: "greeting", passedFirstTry: "yes" }], // wrong type, missing fields
      attemptCounts: {},
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

  it("accepts a well-formed current-shape snapshot and preserves its Goal Progress and turnRecords", () => {
    const current = JSON.stringify({
      goalProgress: ["greeting", "checkin"],
      messages: [],
      turnRecords: [
        { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
        { state: "checkin", passedFirstTry: false, matchedAcceptedResponse: false, learnerAskedBack: true },
      ],
      attemptCounts: { greeting: 1, checkin: 2 },
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
    expect(result.attemptCounts).toEqual({ greeting: 1, checkin: 2 });
  });

  it("keeps a non-contiguous Goal Progress set intact, exactly as persisted (ADR-0012)", () => {
    const nonContiguous = JSON.stringify({
      goalProgress: ["closing"],
      messages: [],
      turnRecords: [
        { state: "closing", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      ],
      attemptCounts: { closing: 1 },
    });

    expect(deserialize(nonContiguous).goalProgress).toEqual(["closing"]);
  });

  it("sanitizes a malformed attemptCounts without discarding the whole snapshot", () => {
    const current = JSON.stringify({
      goalProgress: [],
      messages: [],
      turnRecords: [],
      attemptCounts: { greeting: "two", checkin: 3, notARealState: 5 },
    });

    const result = deserialize(current);
    expect(result.turnRecords).toEqual([]);
    expect(result.attemptCounts).toEqual({ checkin: 3 });
  });
});
