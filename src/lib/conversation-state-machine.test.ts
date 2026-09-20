import { describe, expect, it } from "vitest";
import {
  ACTIVE_CONVERSATION_STATES,
  VERDICTS,
  isActiveConversationState,
  isConversationState,
} from "@/lib/conversation-state-machine";

/**
 * Issue #15: Verdict collapses to exactly two values — `accepted` and
 * `needs_retry`. `off_topic` no longer exists anywhere, including as a
 * distinct transition-table entry: it used to hold the learner on the
 * current state, and now `needs_retry` alone covers that behavior.
 *
 * Issue #47 (ADR-0012) deleted `nextConversationState` — the linear pointer
 * this module used to own — so the transition tests that used to live here
 * are gone with it. What is left is the vocabulary: the four Conversation
 * Goals, the Conversation State derived off Goal Progress, and the two
 * Verdict values. Goal Progress itself (the Focus Goal, Verdict derivation,
 * applying a Goal Report) is covered by src/lib/goal-progress.test.ts.
 */
describe("VERDICTS", () => {
  it("is exactly accepted and needs_retry", () => {
    expect(VERDICTS).toEqual(["accepted", "needs_retry"]);
  });
});

describe("isActiveConversationState", () => {
  it("accepts each of the four Conversation Goals", () => {
    for (const state of ACTIVE_CONVERSATION_STATES) {
      expect(isActiveConversationState(state)).toBe(true);
    }
  });

  it("rejects anything else, including the terminal complete state", () => {
    expect(isActiveConversationState("complete")).toBe(false);
    expect(isActiveConversationState("greetin")).toBe(false);
    expect(isActiveConversationState(undefined)).toBe(false);
  });
});

describe("isConversationState", () => {
  it("accepts the four Goals plus complete", () => {
    for (const state of [...ACTIVE_CONVERSATION_STATES, "complete"] as const) {
      expect(isConversationState(state)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isConversationState("done")).toBe(false);
    expect(isConversationState(null)).toBe(false);
  });
});
