import { describe, expect, it } from "vitest";
import type { CallLine } from "@/lib/call-engine";
import {
  MAX_CALLS,
  canStartCall,
  deserialize,
  isPracticeComplete,
  latestCall,
  learnerLinesOf,
  type PracticeState,
} from "@/lib/practice-state";

const emily = (id: string, text: string): CallLine => ({ id, role: "emily", text });
const learner = (id: string, text: string): CallLine => ({ id, role: "learner", text });
const call = (id: string, lines: CallLine[], ended = true) => ({ id, lines, ended });

describe("deserialize", () => {
  it("restores the Call count and every Call's transcript", () => {
    const state: PracticeState = {
      calls: [call("c1", [emily("e1", "Hi!"), learner("u1", "Hello")]), call("c2", [emily("e2", "Hey")])],
    };
    expect(deserialize(JSON.stringify(state))).toEqual(state);
  });

  it("discards a snapshot in the old scripted-Practice shape without throwing", () => {
    const old = {
      goalProgress: ["greeting"],
      messages: [{ id: "m", role: "emily", textEn: "Hi", textZh: "你好", state: "greeting" }],
      turnRecords: [],
      retryCounts: {},
      retryStreak: null,
    };
    expect(deserialize(JSON.stringify(old)).calls).toEqual([]);
  });

  it("discards a malformed Call list", () => {
    expect(deserialize(JSON.stringify({ calls: [{ id: 1 }] })).calls).toEqual([]);
    expect(deserialize(JSON.stringify({ calls: "nope" })).calls).toEqual([]);
    expect(deserialize("null").calls).toEqual([]);
  });

  it("never restores more than three Calls", () => {
    const calls = [1, 2, 3, 4].map((n) => call(`c${n}`, []));
    expect(deserialize(JSON.stringify({ calls })).calls).toHaveLength(MAX_CALLS);
  });
});

describe("Call limit", () => {
  it("allows a new Call until three have been used", () => {
    const two = { calls: [call("c1", []), call("c2", [])] };
    const three = { calls: [call("c1", []), call("c2", []), call("c3", [])] };
    expect(canStartCall({ calls: [] })).toBe(true);
    expect(canStartCall(two)).toBe(true);
    expect(canStartCall(three)).toBe(false);
  });

  it("shows the latest Call", () => {
    const state = { calls: [call("c1", []), call("c2", [emily("e", "Hi")])] };
    expect(latestCall(state)?.id).toBe("c2");
    expect(latestCall({ calls: [] })).toBeNull();
  });
});

describe("isPracticeComplete", () => {
  it("needs an ended Call with a learner line in English or Chinese", () => {
    expect(isPracticeComplete({ calls: [call("c1", [emily("e", "Hi"), learner("u", "Hello")])] })).toBe(true);
    expect(isPracticeComplete({ calls: [call("c1", [emily("e", "Hi"), learner("u", "你好")])] })).toBe(true);
  });

  it("is not complete after a silent Call or one in another language", () => {
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
  it("collects supported learner lines from every Call, in order", () => {
    const state = {
      calls: [
        call("c1", [emily("e1", "Hi"), learner("u1", "Hello"), learner("u2", "こんにちは")]),
        call("c2", [learner("u3", "我想问怎么说"), emily("e2", "Sure")]),
      ],
    };
    expect(learnerLinesOf(state)).toEqual(["Hello", "我想问怎么说"]);
  });
});
