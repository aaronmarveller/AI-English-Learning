import { describe, expect, it } from "vitest";
import {
  ACTIVE_CONVERSATION_STATES,
  VERDICTS,
  nextConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";

/**
 * Issue #15: Verdict collapses to exactly two values — `accepted` and
 * `needs_retry`. `off_topic` no longer exists anywhere, including as a
 * distinct transition-table entry: it used to hold the learner on the
 * current state, and now `needs_retry` alone covers that behavior.
 */
describe("VERDICTS", () => {
  it("is exactly accepted and needs_retry", () => {
    expect(VERDICTS).toEqual(["accepted", "needs_retry"]);
  });
});

describe("nextConversationState", () => {
  it("advances to the next active state on accepted", () => {
    expect(nextConversationState("greeting", "accepted")).toBe("checkin");
    expect(nextConversationState("checkin", "accepted")).toBe("response");
    expect(nextConversationState("response", "accepted")).toBe("closing");
  });

  it("advances an accepted Closing turn to complete", () => {
    expect(nextConversationState("closing", "accepted")).toBe("complete");
  });

  it("holds on the current state for needs_retry", () => {
    for (const state of ACTIVE_CONVERSATION_STATES) {
      expect(nextConversationState(state, "needs_retry")).toBe(state);
    }
  });

  it("holds on the current state for every non-accepted Verdict", () => {
    const nonAccepted = VERDICTS.filter((v): v is Verdict => v !== "accepted");
    for (const verdict of nonAccepted) {
      expect(nextConversationState("greeting", verdict)).toBe("greeting");
    }
  });
});
