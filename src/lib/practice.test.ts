import { describe, expect, it } from "vitest";
import type { CallLine } from "@/lib/call-engine";
import {
  MAX_CALLS,
  callNumber,
  canViewLearningSummary,
  endCall,
  isLearnerLine,
  isPracticeComplete,
  learnerLinesOf,
  loadPractice,
  replaceCallLines,
  startCall,
  startOver,
  type PracticeState,
} from "@/lib/practice";

const emily = (id: string, text: string): CallLine => ({ id, role: "emily", text });
const learner = (id: string, text: string): CallLine => ({ id, role: "learner", text });
const call = (id: string, lines: CallLine[], ended = true) => ({ id, lines, ended });
const empty: PracticeState = { calls: [] };

describe("startCall", () => {
  it("records a connected Call, un-ended and empty, while under the cap", () => {
    const next = startCall(empty, "c1");
    expect(next).toEqual({ calls: [{ id: "c1", lines: [], ended: false }] });
    const two = { calls: [call("c1", []), call("c2", [])] };
    expect(startCall(two, "c3")?.calls).toHaveLength(3);
  });

  it("is refused at the cap, leaving the state untouched", () => {
    const full = { calls: [call("c1", []), call("c2", []), call("c3", [])] };
    expect(MAX_CALLS).toBe(3);
    expect(startCall(full, "c4")).toBeNull();
    expect(full.calls).toHaveLength(3);
  });
});

describe("replaceCallLines", () => {
  it("replaces the lines of the named Call only", () => {
    const state = { calls: [call("c1", [emily("e1", "Hi")], false), call("c2", [], false)] };
    const next = replaceCallLines(state, "c1", [emily("e1", "Hi!"), learner("u1", "Hello")]);
    expect(next.calls[0].lines).toEqual([emily("e1", "Hi!"), learner("u1", "Hello")]);
    expect(next.calls[0].ended).toBe(false);
    expect(next.calls[1]).toEqual(state.calls[1]);
  });

  it("ignores an unknown Call", () => {
    const state = { calls: [call("c1", [])] };
    expect(replaceCallLines(state, "nope", [emily("e", "x")])).toEqual(state);
  });
});

describe("endCall", () => {
  it("marks the Call ended, keeping only lines with text", () => {
    const state = { calls: [call("c1", [], false)] };
    const next = endCall(state, "c1", [emily("e1", "Hi"), learner("u1", ""), learner("u2", "Hello")]);
    expect(next.calls[0]).toEqual({ id: "c1", ended: true, lines: [emily("e1", "Hi"), learner("u2", "Hello")] });
  });
});

describe("startOver", () => {
  it("leaves no Calls", () => {
    expect(startOver()).toEqual({ calls: [] });
  });
});

describe("loadPractice", () => {
  it("restores the Call count and every Call's transcript", () => {
    const state: PracticeState = {
      calls: [call("c1", [emily("e1", "Hi!"), learner("u1", "Hello")]), call("c2", [emily("e2", "Hey")])],
    };
    expect(loadPractice(JSON.stringify(state))).toEqual(state);
  });

  it("discards a snapshot in the retired scripted-Practice shape", () => {
    const old = {
      goalProgress: ["greeting"],
      messages: [{ id: "m", role: "emily", textEn: "Hi", textZh: "你好", state: "greeting" }],
      turnRecords: [],
      retryCounts: {},
      retryStreak: null,
    };
    expect(loadPractice(JSON.stringify(old))).toEqual(empty);
  });

  it("yields empty state for malformed input", () => {
    expect(loadPractice(JSON.stringify({ calls: [{ id: 1 }] }))).toEqual(empty);
    expect(loadPractice(JSON.stringify({ calls: "nope" }))).toEqual(empty);
    expect(loadPractice("null")).toEqual(empty);
    expect(loadPractice("{not json")).toEqual(empty);
  });

  it("drops Calls beyond the cap", () => {
    const calls = [1, 2, 3, 4].map((n) => call(`c${n}`, []));
    const loaded = loadPractice(JSON.stringify({ calls }));
    expect(loaded.calls.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("ends a Call found un-ended, keeping what was already said", () => {
    const raw = JSON.stringify({
      calls: [call("c1", [emily("e1", "Hi"), learner("u1", "")], false), call("c2", [learner("u2", "Hey")])],
    });
    expect(loadPractice(raw).calls).toEqual([
      { id: "c1", ended: true, lines: [emily("e1", "Hi")] },
      call("c2", [learner("u2", "Hey")]),
    ]);
  });
});

describe("isLearnerLine", () => {
  it("accepts the learner's own line in English or Chinese only", () => {
    expect(isLearnerLine(learner("u", "Hello"))).toBe(true);
    expect(isLearnerLine(learner("u", "你好"))).toBe(true);
    expect(isLearnerLine(learner("u", "こんにちは"))).toBe(false);
    expect(isLearnerLine(emily("e", "Hello"))).toBe(false);
  });
});

describe("isPracticeComplete", () => {
  it("needs an ended Call with a learner line in English or Chinese", () => {
    expect(isPracticeComplete({ calls: [call("c1", [emily("e", "Hi"), learner("u", "Hello")])] })).toBe(true);
    expect(isPracticeComplete({ calls: [call("c1", [emily("e", "Hi"), learner("u", "你好")])] })).toBe(true);
  });

  it("is not complete after a silent Call or one in another language", () => {
    expect(isPracticeComplete(empty)).toBe(false);
    expect(isPracticeComplete({ calls: [call("c1", [emily("e", "Hi")])] })).toBe(false);
    expect(isPracticeComplete({ calls: [call("c1", [emily("e", "Hi"), learner("u", "こんにちは")])] })).toBe(false);
  });

  it("is not complete while the speaking Call is still live", () => {
    expect(isPracticeComplete({ calls: [call("c1", [learner("u", "Hello")], false)] })).toBe(false);
  });

  it("stays complete when a later Call is silent", () => {
    const state = { calls: [call("c1", [learner("u", "Hello")]), call("c2", [emily("e", "Hi")])] };
    expect(isPracticeComplete(state)).toBe(true);
  });
});

describe("learnerLinesOf", () => {
  it("collects supported learner lines from every Call, trimmed, in order", () => {
    const calls = [
      call("c1", [emily("e1", "Hi"), learner("u1", "  Hello  "), learner("u2", "こんにちは")]),
      call("c2", [learner("u3", "我想问怎么说"), emily("e2", "Sure")]),
    ];
    expect(learnerLinesOf(calls)).toEqual(["Hello", "我想问怎么说"]);
  });
});

describe("callNumber", () => {
  it("is the next Call's number while idle", () => {
    expect(callNumber(empty, false)).toBe(1);
    expect(callNumber({ calls: [call("c1", [])] }, false)).toBe(2);
  });

  it("never exceeds the cap once all Calls are used", () => {
    const full = { calls: [call("c1", []), call("c2", []), call("c3", [])] };
    expect(callNumber(full, false)).toBe(3);
  });

  it("is the live Call's number while a Call is live, never below one", () => {
    expect(callNumber({ calls: [call("c1", [], false)] }, true)).toBe(1);
    expect(callNumber({ calls: [call("c1", []), call("c2", [], false)] }, true)).toBe(2);
    expect(callNumber(empty, true)).toBe(1);
  });
});

describe("canViewLearningSummary", () => {
  it("needs Practice complete", () => {
    expect(canViewLearningSummary(empty)).toBe(false);
    expect(canViewLearningSummary({ calls: [call("c1", [emily("e", "Hi")])] })).toBe(false);
    expect(canViewLearningSummary({ calls: [call("c1", [learner("u", "Hello")])] })).toBe(true);
  });

  it("is false while any recorded Call is still un-ended", () => {
    const state = { calls: [call("c1", [learner("u", "Hello")]), call("c2", [], false)] };
    expect(canViewLearningSummary(state)).toBe(false);
  });
});
