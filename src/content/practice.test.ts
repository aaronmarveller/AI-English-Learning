import { describe, expect, it } from "vitest";
import { buildGoalSetSystemPromptSection, GLOBAL_SYSTEM_RULES } from "@/content/practice";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";

/**
 * Issue #16: the model no longer writes Emily's reply — its output shrank to
 * two fields (src/lib/practice-judge.ts's `submit_turn_result` tool schema).
 * The system prompt was rewritten to match: no more "reply naturally as
 * Emily", no more Closing-only "Completion Message Rule" telling the model to
 * verbatim-pick a completion message (that selection is entirely client-side
 * now — see src/lib/emily-reply-selector.ts).
 *
 * Issue #47 (ADR-0012): the prompt is Goal-set-shaped. Part 1 asks for a
 * `goal_report` over the open Conversation Goals instead of a `verdict` on the
 * current one, and no longer tells the model "Never skip a Conversation Step"
 * — Steps were the linear pointer this ticket deleted, and a Goal may now be
 * achieved before Emily has prompted for it. Part 2
 * (`buildGoalSetSystemPromptSection`) lists all four Goals, marks the achieved
 * ones as not re-creditable, and asks only about the open ones.
 *
 * Issue #48: the prompt must credit a Goal the learner achieved whether or not
 * Emily prompted for it, and a Turn may achieve several at once — so the four
 * `learningGoal` texts describe their Goal rather than the line Emily just
 * said, and the Goal-set section says outright to judge every open Goal on its
 * own merits.
 *
 * Issue #49 (docs/ai-configuration.md section 4): the prompt defines
 * `achieved` / `failed` / `untouched` itself, including the boundary that
 * separates an attempt that missed from no attempt at all ("Hi! I like
 * pizza." is `greeting` achieved and everything else `untouched`, never
 * `failed`) and that grammar alone never makes an attempt `failed`.
 */
describe("Practice system prompt", () => {
  it("describes the two-field submit_turn_result contract, not reply generation or a verdict", () => {
    expect(GLOBAL_SYSTEM_RULES).toContain("learner_asked_back");
    expect(GLOBAL_SYSTEM_RULES).toContain("goal_report");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("reply_en");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("reply_zh");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("highlight_key");
  });

  it("no longer says 'Never skip a Conversation Step'", () => {
    expect(GLOBAL_SYSTEM_RULES).not.toContain("Never skip a Conversation Step");
  });

  it("never asks the model for a verdict of its own", () => {
    // The Verdict is derived on the client from the Goal Report
    // (src/lib/goal-progress.ts's `deriveVerdict`) — the prompt must not put a
    // second, contradictable field back on the wire.
    expect(GLOBAL_SYSTEM_RULES).not.toContain("needs_retry");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("verdict");
  });

  it("no longer instructs the model to pick a completion message", () => {
    const prompt = buildGoalSetSystemPromptSection([...ACTIVE_CONVERSATION_STATES]);
    expect(prompt).not.toContain("Completion Message Rule");
    for (const message of GREETING_SOMEBODY_LESSON.completionMessages) {
      expect(prompt).not.toContain(message);
    }
  });

  it("lists all four Goals with their Learning Goals, and nothing about a reply", () => {
    const prompt = buildGoalSetSystemPromptSection([]);
    for (const state of ACTIVE_CONVERSATION_STATES) {
      expect(prompt).toContain(GREETING_SOMEBODY_LESSON.script[state].learningGoal);
      expect(prompt).toContain(GREETING_SOMEBODY_LESSON.script[state].labelEn);
    }
    expect(prompt).not.toContain("reply_en");
  });

  it("states every open Goal's Accepted Responses", () => {
    const prompt = buildGoalSetSystemPromptSection([]);
    for (const state of ACTIVE_CONVERSATION_STATES) {
      expect(prompt).toContain("Accepted Responses");
      for (const phrase of GREETING_SOMEBODY_LESSON.script[state].acceptedResponses) {
        expect(prompt).toContain(`"${phrase}"`);
      }
    }
  });

  it("marks an achieved Goal as not re-creditable and asks only about the open ones", () => {
    const prompt = buildGoalSetSystemPromptSection(["greeting", "checkin"]);

    expect(prompt).toContain("greeting (Greeting) — ACHIEVED");
    expect(prompt).toContain("checkin (Check-in) — ACHIEVED");
    expect(prompt).toContain("never re-credit it");
    expect(prompt).toContain("response (Response) — OPEN");
    expect(prompt).toContain("closing (Closing) — OPEN");

    // An achieved Goal is still listed for context (its Learning Goal stays
    // visible), but its Accepted Responses are not repeated back — there is
    // nothing left to judge against it, and repeating them invites
    // re-crediting one.
    for (const phrase of GREETING_SOMEBODY_LESSON.script.greeting.acceptedResponses) {
      expect(prompt).not.toContain(`"${phrase}"`);
    }
    expect(prompt).toContain(`"${GREETING_SOMEBODY_LESSON.script.response.acceptedResponses[0]}"`);
  });

  it("asks about every Goal on a fresh conversation, and none once Practice is complete", () => {
    expect(buildGoalSetSystemPromptSection([])).not.toContain("ACHIEVED");
    const complete = buildGoalSetSystemPromptSection([...ACTIVE_CONVERSATION_STATES]);
    for (const state of ACTIVE_CONVERSATION_STATES) {
      expect(complete).toContain(
        `${state} (${GREETING_SOMEBODY_LESSON.script[state].labelEn}) — ACHIEVED`,
      );
      expect(complete).toContain(GREETING_SOMEBODY_LESSON.script[state].learningGoal);
    }
    expect(complete).not.toContain("— OPEN");
  });

  it("tells the model to judge every open Goal on its own merits, prompted or not", () => {
    // Issue #48's headline scenario: one message ("Hi Emily! I'm good, thanks.
    // How are you?") achieves three Goals even though Emily steered toward
    // only one of them, so the prompt has to say that crediting is not limited
    // to the Goal she last prompted for.
    const prompt = buildGoalSetSystemPromptSection([]);
    expect(prompt).toContain("Judge every open Goal below on its own merits");
    expect(prompt).toContain("one message may achieve several");
    expect(prompt).toContain("a Goal may be achieved before Emily has prompted for it");
  });

  it("describes each Goal rather than the line Emily just said", () => {
    // Issue #48: these texts used to open with "You just asked..."/"You just
    // greeted..." — true only of a one-Goal-per-Turn conversation in canonical
    // order, and wrong for the headline Turn (three Goals at once) or for a
    // Goal achieved before Emily prompted for it.
    for (const state of ACTIVE_CONVERSATION_STATES) {
      const { learningGoal } = GREETING_SOMEBODY_LESSON.script[state];
      expect(learningGoal, `${state}'s Learning Goal assumes Emily just prompted`).not.toMatch(
        /^You just /,
      );
      expect(learningGoal.toLowerCase()).toContain("the learner");
    }
  });

  it("teaches the achieved / failed / untouched boundary in the prompt itself (issue #49)", () => {
    // docs/ai-configuration.md section 4's Goal Report table: only a
    // *recognisable attempt* at a Goal's intent that does not communicate it
    // is "failed". Leave that boundary implicit and "Hi! I like pizza." reads
    // as a failed check-in instead of a message that achieved `greeting` and
    // left the rest untouched — so the prompt, not only the tool description
    // (src/lib/practice-judge.ts), has to state it.
    expect(GLOBAL_SYSTEM_RULES).toContain("Every open Goal gets exactly one of three reports");
    expect(GLOBAL_SYSTEM_RULES).toContain(
      '"failed": the message recognisably attempted this Goal\'s intent',
    );
    expect(GLOBAL_SYSTEM_RULES).toContain(
      'Unrelated chatter, off-topic remarks, filler, and a bare "Yes." are all "untouched", never "failed"',
    );
    expect(GLOBAL_SYSTEM_RULES).toContain('Grammar alone never makes an attempt "failed"');
    // A partial message that attempted nothing else is progress, not failure.
    expect(GLOBAL_SYSTEM_RULES).toContain('leaves "checkin" "untouched"');

    // The per-Goal section repeats the same two rules right where the model
    // reports each Goal.
    const prompt = buildGoalSetSystemPromptSection([]);
    expect(prompt).toContain('grammar alone never makes an attempt "failed"');
    expect(prompt).toContain('a bare "Yes." are "untouched", never "failed"');
  });
});
