import { describe, expect, it } from "vitest";
import { buildStateSystemPromptSection, GLOBAL_SYSTEM_RULES } from "@/content/practice";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";

/**
 * Issue #16: the model no longer writes Emily's reply — its output shrank to
 * `verdict` + `learner_asked_back` (src/lib/practice-judge.ts's
 * `submit_turn_result` tool schema). The system prompt was rewritten to
 * match: no more "reply naturally as Emily", no more Closing-only
 * "Completion Message Rule" telling the model to verbatim-pick a completion
 * message (that selection is entirely client-side now — see
 * src/lib/emily-reply-selector.ts). These tests replace the old
 * "Completion Message Rule" assertions with coverage of the new contract.
 */
describe("Practice system prompt", () => {
  it("describes the two-field submit_turn_result contract, not reply generation", () => {
    expect(GLOBAL_SYSTEM_RULES).toContain("learner_asked_back");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("reply_en");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("reply_zh");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("highlight_key");
  });

  it("no longer instructs the model to pick a completion message", () => {
    const prompt = buildStateSystemPromptSection("closing");
    expect(prompt).not.toContain("Completion Message Rule");
    for (const message of GREETING_SOMEBODY_LESSON.completionMessages) {
      expect(prompt).not.toContain(message);
    }
  });

  it("every state's prompt section states its Learning Goal and Accepted Responses, nothing about a reply", () => {
    for (const state of ACTIVE_CONVERSATION_STATES) {
      const prompt = buildStateSystemPromptSection(state);
      expect(prompt).toContain(GREETING_SOMEBODY_LESSON.script[state].learningGoal);
      expect(prompt).toContain("Accepted Responses");
      expect(prompt).not.toContain("reply_en");
    }
  });
});
