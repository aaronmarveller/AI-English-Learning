import { describe, expect, it } from "vitest";
import { buildGoalSetSystemPromptSection, GLOBAL_SYSTEM_RULES } from "@/content/practice";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import type { GoalProgress } from "@/lib/goal-progress";

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
 *
 * Issue #52 ran ticket 12's judgment-quality eval (scripts/eval-judgment.ts)
 * against the real API with the **full Goal Report** asserted per case
 * (prior Goal Progress in; one entry per open Goal out, plus
 * `learner_asked_back`) and fixed the wording the first runs exposed: each
 * Goal now names its *own* attempt, so a question back cannot be read as a
 * failed answer; "meaning has to come through" is stated outright, so a
 * garbled attempt is `failed` rather than generously `achieved`; and the
 * off-topic constraint is per Goal and per part of the message instead of
 * blanketing the whole message, so "Hi! I like pizza." still achieves
 * `greeting`.
 *
 * Issue #54 (ADR-0013): `response` means asking Emily a question back, so the
 * prompt's per-Goal attempt list drops the thank-you it inherited from #52 (a
 * bare thank-you leaves the Goal `untouched`, never `failed` — it is
 * politeness, not a garbled ask-back), and `learner_asked_back` is stated as
 * the signal that `response` was achieved and what makes Emily answer the
 * question whenever it comes, rather than a boolean that only matters right
 * after a check-in.
 *
 * Issue #55 (v2 tickets 5 and 11) re-authors the Closing and Completion pools
 * into farewells that overlap each other, which is why the completion-pool
 * absence check below is no longer text-shaped: the pool's lines now
 * legitimately appear in the prompt as `closing`'s Accepted Responses (see
 * that test's own comment). Nothing in the prompt itself changed — it still
 * asks for a Goal Report and `learner_asked_back` and nothing else.
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
    // Issue #55 re-authored the Completion pool into bare farewells
    // ("Thanks! See you!", "See you!", "Thanks! Take care!"), which are also
    // `closing`-shaped expressions — "See you!" is one of `closing`'s own
    // Accepted Responses. So the pool's *text* can no longer be asserted
    // absent: on a prompt whose Goal Progress still has `closing` open, those
    // very words appear legitimately, as the learner-facing examples they are.
    // What this test pins instead is the real intent — the prompt never asks
    // the model for a completion line at all. Both ends of the Goal-Progress
    // range are checked, because the old text-shaped assertion only ever bit
    // at the one where `closing` is open.
    //
    // The replacement's own limit is worth stating: it pins the *word*
    // "completion", not the concept — a regression worded as "pick the final
    // line" would slip past it. That is the price of the pool's lines now
    // legitimately appearing in the prompt as Accepted Responses, and the
    // text-shaped assertion it replaces was not obviously better: it only
    // avoided vacuously passing because the all-achieved prompt above happens
    // not to print any Accepted Responses at all.
    const goalProgresses: GoalProgress[] = [[], [...ACTIVE_CONVERSATION_STATES]];
    for (const goalProgress of goalProgresses) {
      const prompt = buildGoalSetSystemPromptSection(goalProgress);
      expect(prompt).not.toMatch(/completion/i);
    }
    expect(GLOBAL_SYSTEM_RULES).not.toContain("Completion Message Rule");
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
    // Issue #52: the mirror-image slip — a bare "Yes." credited as an
    // acknowledgment of `response` — needed the boundary stated on the
    // `achieved` side too, not only "never failed".
    expect(GLOBAL_SYSTEM_RULES).toContain('and never "achieved" either');

    // The per-Goal section repeats the same two rules right where the model
    // reports each Goal.
    const prompt = buildGoalSetSystemPromptSection([]);
    expect(prompt).toContain('grammar alone never makes an attempt "failed"');
    expect(prompt).toContain('a bare "Yes." are "untouched", never "failed"');
  });

  it("names each Goal's own attempt, so one Goal's attempt is not another's failure (issue #52; #54 for `response`)", () => {
    // #52's first live run: with the attempts listed as one shared pool
    // ("a greeting, an answer about how they are, a thank-you or a question
    // back, a goodbye") the model reported "How are you?" as a *failed*
    // `checkin`, because a question back read as an attempt at the Goal it was
    // reporting on. Each attempt now belongs to its own Goal, which is what
    // puts a reciprocal question on `response`. Issue #54 (ADR-0013) shrank
    // `response`'s entry to the question back alone: the thank-you was never an
    // attempt at that Goal (see the decision-1 test below).
    expect(GLOBAL_SYSTEM_RULES).toContain('a greeting attempt for "greeting"');
    expect(GLOBAL_SYSTEM_RULES).toContain('a question back for "response"');
    expect(GLOBAL_SYSTEM_RULES).toContain('a goodbye attempt for "closing"');
    expect(GLOBAL_SYSTEM_RULES).not.toContain("a thank-you or a question back");
    expect(GLOBAL_SYSTEM_RULES).toContain(
      'An attempt at a *different* Goal never makes this one "failed"',
    );
    expect(GLOBAL_SYSTEM_RULES).toContain('which asks how *they* are');
  });

  it("says a bare thank-you leaves `response` untouched (issue #54, decision 1)", () => {
    // ADR-0013: `response` means asking Emily back, so a thank-you neither
    // achieves the Goal nor counts as a failed attempt at it — it leaves the
    // Goal exactly as a message that attempted no Goal does. The Goal's own
    // `learningGoal` carries that where the model reports on it, and the Global
    // Conversation Rules must not contradict it (they used to: `response`'s
    // attempt was "a thank-you or a question back" — the test above).
    const prompt = buildGoalSetSystemPromptSection([]);
    const { learningGoal } = GREETING_SOMEBODY_LESSON.script.response;
    expect(prompt).toContain(learningGoal);
    expect(learningGoal).toContain("A bare thank-you is politeness, not this Goal");
    expect(learningGoal).toContain("leaves this Goal untouched");

    expect(GLOBAL_SYSTEM_RULES).toContain("Thanking Emily is not an attempt at \"response\" at all");
    expect(GLOBAL_SYSTEM_RULES).toContain('leaves "response" "untouched"');
    expect(GLOBAL_SYSTEM_RULES).toContain("politeness is never \"failed\"");
  });

  it("makes `learner_asked_back` the signal that `response` was achieved (issue #54, decision 1)", () => {
    // ADR-0013's other half: a question back is what achieves `response`, and
    // `learner_asked_back` is what makes Emily answer it whenever it happens —
    // not a boolean that only matters right after a check-in (the framing #16
    // and #48 gave it).
    expect(GLOBAL_SYSTEM_RULES).toContain("A question back is what achieves the \"response\" Goal");
    expect(GLOBAL_SYSTEM_RULES).toContain("she answers whenever the learner asks");
    expect(GLOBAL_SYSTEM_RULES).not.toContain("only changes Emily's next line when the learner asked back right after a check-in");
  });

  it("says a garbled attempt is failed, not generously achieved (issue #52)", () => {
    // #49's all-or-nothing rule is only as good as the model's willingness to
    // report a recognisable attempt `failed`. #52's live run showed the
    // prompt's generosity ("judge by communicative intent") swallowing that
    // whole category — a goodbye attempt the learner garbled came back
    // `achieved` — so "meaning has to come through" is now stated in so many
    // words, while keeping grammar mistakes firmly on the `achieved` side.
    expect(GLOBAL_SYSTEM_RULES).toContain("Meaning does have to come through");
    expect(GLOBAL_SYSTEM_RULES).toContain("a message a listener would have to guess at");
    expect(GLOBAL_SYSTEM_RULES).toContain('trails off into words that mean nothing here');
  });

  it("credits a Goal that a partly off-topic message did communicate (issue #52)", () => {
    // #52's live run: the blanket "a learner who wanders off-topic leaves every
    // Goal untouched" made the model withhold `greeting` from "Hi! I like
    // pizza." — the case issue #52 pins as `greeting` achieved with everything
    // else untouched. The rule is per Goal and per part of the message now.
    expect(GLOBAL_SYSTEM_RULES).toContain("never applied to the message as a whole");
    expect(GLOBAL_SYSTEM_RULES).toContain("a greeting is achieved by its own words");
    expect(buildGoalSetSystemPromptSection([])).toContain(
      "the off-topic part leaves its own Goals",
    );
  });
});
