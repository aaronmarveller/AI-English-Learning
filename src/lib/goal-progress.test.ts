import { describe, expect, it } from "vitest";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import type { GoalReport } from "@/lib/practice-turn-protocol";
import {
  applyGoalReport,
  deriveConversationState,
  deriveVerdict,
  getFocusGoal,
  getOpenGoals,
  isGoalProgress,
  isGoalProgressComplete,
  unexpectedGoalReportKeys,
  type GoalProgress,
} from "@/lib/goal-progress";

/**
 * Issue #47 (ADR-0012; CONTEXT.md "Goal Progress" / "Focus Goal" / "Verdict"):
 * Goal Progress replaces the linear Conversation State pointer
 * (`nextConversationState`, deleted) with a set of achieved Conversation
 * Goals. These tests pin the four rules everything else in Practice reads off
 * this module:
 *
 *   - the Focus Goal is the first *open* Goal in canonical order (not "one
 *     past the last achieved one" — Goal Progress can be non-contiguous);
 *   - a Verdict is derived here, on the client: `accepted` iff at least one
 *     open Goal was `achieved` and none was `failed`;
 *   - an `accepted` Turn adds every `achieved` Goal at once, and a
 *     `needs_retry` Turn saves nothing from its report even the parts that
 *     were right (all-or-nothing);
 *   - a Goal Report's keys outside the open set are ignored, never an error.
 */

const ALL_FOUR: GoalProgress = [...ACTIVE_CONVERSATION_STATES];

/**
 * A Goal Report carrying a key the Judge was never asked about. `isGoalReport`
 * accepts it (only the *values* are validated — see that validator's own doc
 * comment), so this is reachable at runtime and must be ignored rather than
 * treated as model misbehaviour.
 */
const STRAY_KEY_REPORT = { greeting: "achieved", pizza: "failed" } as unknown as GoalReport;

describe("isGoalProgress", () => {
  it("accepts an array of Conversation Goals", () => {
    expect(isGoalProgress([])).toBe(true);
    expect(isGoalProgress(["greeting", "closing"])).toBe(true);
  });

  it("rejects anything that isn't an array of Conversation Goals", () => {
    expect(isGoalProgress("greeting")).toBe(false);
    expect(isGoalProgress(undefined)).toBe(false);
    expect(isGoalProgress(null)).toBe(false);
    expect(isGoalProgress(["greeting", "checkin", "goodbye"])).toBe(false);
    expect(isGoalProgress({ greeting: "achieved" })).toBe(false);
  });
});

describe("getOpenGoals", () => {
  it("returns all four Goals, in canonical order, for an empty Goal Progress", () => {
    expect(getOpenGoals([])).toEqual(["greeting", "checkin", "response", "closing"]);
  });

  it("excludes achieved Goals in canonical order, not insertion order", () => {
    expect(getOpenGoals(["closing", "greeting"])).toEqual(["checkin", "response"]);
  });

  it("is empty once every Goal is achieved", () => {
    expect(getOpenGoals(ALL_FOUR)).toEqual([]);
  });
});

describe("getFocusGoal", () => {
  it("is the first Goal in canonical order before anything is achieved", () => {
    expect(getFocusGoal([])).toBe("greeting");
  });

  it("moves to the first *open* Goal, so an early achievement leaves an earlier one focused", () => {
    // The learner said "Bye!" first: `closing` is achieved, but Emily's next
    // line still steers at `greeting` — Goal Progress is a set, not a pointer.
    expect(getFocusGoal(["closing"])).toBe("greeting");
    expect(getFocusGoal(["greeting"])).toBe("checkin");
    expect(getFocusGoal(["greeting", "checkin", "closing"])).toBe("response");
  });

  it("is null once every Goal is achieved", () => {
    expect(getFocusGoal(ALL_FOUR)).toBeNull();
  });
});

describe("isGoalProgressComplete", () => {
  it("is false while any Goal is open", () => {
    expect(isGoalProgressComplete([])).toBe(false);
    expect(isGoalProgressComplete(["greeting", "checkin", "response"])).toBe(false);
  });

  it("is true once all four Goals are achieved, whatever order they arrived in", () => {
    expect(isGoalProgressComplete(ALL_FOUR)).toBe(true);
    expect(isGoalProgressComplete(["closing", "response", "checkin", "greeting"])).toBe(true);
  });
});

describe("deriveConversationState", () => {
  it("is the Focus Goal while any Goal is open", () => {
    expect(deriveConversationState([])).toBe("greeting");
    expect(deriveConversationState(["greeting", "checkin"])).toBe("response");
  });

  it("is complete once all four Goals are achieved", () => {
    expect(deriveConversationState(ALL_FOUR)).toBe("complete");
  });
});

describe("deriveVerdict", () => {
  it("is needs_retry for an empty Goal Report (nothing touched)", () => {
    expect(deriveVerdict([], {})).toBe("needs_retry");
    expect(deriveVerdict(["greeting"], { checkin: "untouched" })).toBe("needs_retry");
  });

  it("is accepted when at least one open Goal was achieved", () => {
    expect(deriveVerdict([], { greeting: "achieved" })).toBe("accepted");
    expect(deriveVerdict(["greeting"], { checkin: "achieved", closing: "untouched" })).toBe("accepted");
  });

  it("is needs_retry when any open Goal was failed, even alongside an achieved one", () => {
    // All-or-nothing (ADR-0012): a Turn that got one Goal right and another
    // wrong is needs_retry, and none of it counts.
    expect(deriveVerdict([], { greeting: "failed" })).toBe("needs_retry");
    expect(deriveVerdict([], { greeting: "achieved", checkin: "failed" })).toBe("needs_retry");
  });

  it("ignores a report key outside the open set", () => {
    // The Judge is only asked about open Goals, so a key it was never asked
    // about can never make a Turn count.
    expect(deriveVerdict(["greeting"], { greeting: "achieved" })).toBe("needs_retry");
    expect(deriveVerdict(["greeting"], { greeting: "failed" })).toBe("needs_retry");
    expect(deriveVerdict([], { checkin: "achieved" })).toBe("accepted");
  });

  it("ignores a stray key in an otherwise-achieving report", () => {
    expect(deriveVerdict([], STRAY_KEY_REPORT)).toBe("accepted");
    expect(deriveVerdict([], { ...STRAY_KEY_REPORT, greeting: "untouched" })).toBe("needs_retry");
  });

  it("is accepted for a Goal achieved before the Focus Goal was", () => {
    // A learner who says "Bye!" on their first Turn achieved `closing` —
    // there is no earlier Goal's achievement to wait for.
    expect(deriveVerdict([], { closing: "achieved" })).toBe("accepted");
  });
});

describe("applyGoalReport", () => {
  it("adds every achieved Goal at once on an accepted Turn", () => {
    expect(applyGoalReport([], { greeting: "achieved", closing: "achieved" }, "accepted")).toEqual([
      "greeting",
      "closing",
    ]);
  });

  it("returns Goal Progress in canonical order regardless of report key order", () => {
    expect(applyGoalReport([], { closing: "achieved", greeting: "achieved" }, "accepted")).toEqual([
      "greeting",
      "closing",
    ]);
  });

  it("saves nothing from a needs_retry Turn, even a Goal it marked achieved", () => {
    expect(applyGoalReport([], { greeting: "achieved", checkin: "failed" }, "needs_retry")).toEqual([]);
  });

  it("never removes an achieved Goal, and never re-adds one", () => {
    const achieved = applyGoalReport([], { greeting: "achieved" }, "accepted");
    expect(applyGoalReport(achieved, { greeting: "achieved" }, "accepted")).toEqual(achieved);
    expect(applyGoalReport(achieved, { checkin: "achieved" }, "accepted")).toEqual(["greeting", "checkin"]);
  });

  it("leaves Goal Progress untouched for untouched and failed Goals", () => {
    expect(applyGoalReport([], { greeting: "untouched" }, "needs_retry")).toEqual([]);
    expect(applyGoalReport(["greeting"], { checkin: "failed" }, "needs_retry")).toEqual(["greeting"]);
  });

  it("ignores a report key outside the open set", () => {
    expect(applyGoalReport(["greeting"], { greeting: "achieved" }, "needs_retry")).toEqual(["greeting"]);
  });

  it("does not mutate the Goal Progress it is given", () => {
    const progress: GoalProgress = ["greeting"];
    applyGoalReport(progress, { checkin: "achieved" }, "accepted");
    expect(progress).toEqual(["greeting"]);
  });

  it("changes Goal Progress exactly when deriveVerdict is accepted", () => {
    const reports: GoalReport[] = [
      {},
      { greeting: "untouched" },
      { greeting: "failed" },
      { greeting: "achieved" },
      { greeting: "achieved", checkin: "failed" },
      { checkin: "achieved" },
    ];
    for (const report of reports) {
      const progress: GoalProgress = ["greeting"];
      const verdict = deriveVerdict(progress, report);
      const after = applyGoalReport(progress, report, verdict);
      expect(after.length > progress.length).toBe(verdict === "accepted");
    }
  });

  it("reaches complete after achieving all four Goals one Turn at a time", () => {
    let progress: GoalProgress = [];
    for (const goal of ACTIVE_CONVERSATION_STATES) {
      const report: GoalReport = { [goal]: "achieved" };
      progress = applyGoalReport(progress, report, deriveVerdict(progress, report));
      expect(progress).toContain(goal);
    }
    expect(progress).toEqual(ALL_FOUR);
    expect(isGoalProgressComplete(progress)).toBe(true);
    expect(getFocusGoal(progress)).toBeNull();
    expect(deriveConversationState(progress)).toBe("complete");
  });
});

describe("unexpectedGoalReportKeys", () => {
  it("names only the keys that aren't open Goals", () => {
    expect(unexpectedGoalReportKeys([], { greeting: "achieved" })).toEqual([]);
    expect(unexpectedGoalReportKeys(["greeting"], { greeting: "achieved", checkin: "achieved" })).toEqual([
      "greeting",
    ]);
    expect(unexpectedGoalReportKeys([], STRAY_KEY_REPORT)).toEqual(["pizza"]);
  });
});
