import { describe, expect, it } from "vitest";
import { deserialize } from "@/lib/practice-state";

/**
 * Issue #20 (#12's Further Notes: "In-flight practice sessions will
 * reset"): the persisted practice store's `deserialize` must discard a
 * shape mismatch wholesale rather than crash or silently mix old and new
 * data. The concrete case this guards is real: pre-issue-#20 builds
 * persisted `highlightKeys` (a flat `HighlightKey[]`) instead of the new
 * `turnRecords: StateTurnRecord[]` this store now depends on — loading that
 * old snapshot must produce a clean "no saved state" restart, not a thrown
 * exception or a store with `turnRecords: undefined` that later crashes
 * feedback-selector.ts.
 */
describe("practice-state deserialize — discard-safely on shape mismatch", () => {
  const INITIAL_STATE_SHAPE = {
    conversationState: "greeting",
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

  it("discards a snapshot whose turnRecords entries are malformed", () => {
    const malformed = JSON.stringify({
      conversationState: "checkin",
      messages: [],
      turnRecords: [{ state: "greeting", passedFirstTry: "yes" }], // wrong type, missing fields
      attemptCounts: {},
    });

    expect(deserialize(malformed)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot where turnRecords is missing entirely", () => {
    const missing = JSON.stringify({ conversationState: "closing", messages: [] });
    expect(deserialize(missing)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("discards a snapshot where turnRecords isn't an array", () => {
    const wrongType = JSON.stringify({ conversationState: "closing", messages: [], turnRecords: "not-an-array" });
    expect(deserialize(wrongType)).toEqual(INITIAL_STATE_SHAPE);
  });

  it("falls back to the initial state on totally malformed JSON input shape (non-object)", () => {
    expect(deserialize(JSON.stringify("just a string"))).toEqual(INITIAL_STATE_SHAPE);
    expect(deserialize(JSON.stringify(null))).toEqual(INITIAL_STATE_SHAPE);
  });

  it("accepts a well-formed current-shape snapshot and preserves its turnRecords", () => {
    const current = JSON.stringify({
      conversationState: "response",
      messages: [],
      turnRecords: [
        { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: true, learnerAskedBack: false },
        { state: "checkin", passedFirstTry: false, matchedAcceptedResponse: false, learnerAskedBack: true },
      ],
      attemptCounts: { greeting: 1, checkin: 2 },
    });

    const result = deserialize(current);
    expect(result.conversationState).toBe("response");
    expect(result.turnRecords).toHaveLength(2);
    expect(result.turnRecords[1]).toEqual({
      state: "checkin",
      passedFirstTry: false,
      matchedAcceptedResponse: false,
      learnerAskedBack: true,
    });
    expect(result.attemptCounts).toEqual({ greeting: 1, checkin: 2 });
  });

  it("sanitizes a malformed attemptCounts without discarding the whole snapshot", () => {
    const current = JSON.stringify({
      conversationState: "greeting",
      messages: [],
      turnRecords: [],
      attemptCounts: { greeting: "two", checkin: 3, notARealState: 5 },
    });

    const result = deserialize(current);
    expect(result.turnRecords).toEqual([]);
    expect(result.attemptCounts).toEqual({ checkin: 3 });
  });
});
