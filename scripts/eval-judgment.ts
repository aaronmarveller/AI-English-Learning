/**
 * Judgment quality eval (ticket 12; spec.md "接缝二（辅）：判定质量 eval").
 *
 * Runs a fixed "learner utterance × expected verdict" table against the
 * REAL Anthropic API, through the exact same judging code the app uses in
 * production (src/lib/practice-judge.ts) — not a reimplementation, so it
 * can't silently drift from what the system prompt actually produces.
 *
 * Why this exists: the E2E suite (e2e/practice-conversation.spec.ts and
 * friends) stubs the model response entirely, so it can never answer this
 * MVP's biggest technical risk — whether the model reliably accepts natural
 * phrasing OUTSIDE each state's Accepted Responses whitelist (e.g. "Yeah,
 * doing alright" during Check-in). That's model behavior, not code
 * behavior, and can only be checked against the real API. This eval also
 * doubles as regression protection for the system prompt: re-run it any
 * time src/content/practice.ts's prompt copy changes.
 *
 * Deliberately NOT wired into any automated pipeline — not `test:e2e`, and
 * there's no CI in this repo to wire it into anyway. (`lint`/`typecheck`
 * still statically check this file like any other source file, which is
 * fine: that's zero-cost and makes no network call. What must never happen
 * automatically is *running* it, since each run is a real, non-deterministic,
 * billed model call per case.) Run it by hand:
 *
 *   npm run eval:judgment
 *
 * Requires ANTHROPIC_API_KEY, read from .env.local (see .env.example) or
 * the environment.
 *
 * Issue #47 (ADR-0012) migrated this script to the set-shaped wire: each case
 * still says which Goal it is about and which Verdict it expects, but the
 * Judge is now handed Goal Progress (the Goals canonically before that one)
 * and answers with a Goal Report, from which this script derives the Verdict
 * the same way the client does. No new case categories — those are #52's.
 */

import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";
import { deriveVerdict, type GoalProgress } from "@/lib/goal-progress";
import { MODEL_ID, judgeTurn } from "@/lib/practice-judge";
import type { GoalReport } from "@/lib/practice-turn-protocol";
import { loadEnvLocal } from "./env";

// --- Eval table (spec.md: "每个 Conversation State 的白名单内表达、白名单外
// 但意图正确的自然表达、意图错误的表达、跑题表达") ----------------------------

type EvalCategory = "whitelist" | "natural-paraphrase" | "wrong-intent" | "off-topic";

type EvalCase = {
  state: ActiveConversationState;
  category: EvalCategory;
  message: string;
  expected: Verdict;
  /**
   * Issue #16: with `reply_en`/`highlight_key` gone, `learner_asked_back` is
   * the model's only output besides its judgment on the learner's message —
   * and this eval is its only guard against the real API too. Optional: only
   * asserted when a case sets it.
   */
  expectedAskedBack?: boolean;
  /** Extra context surfaced in output for cases worth calling out explicitly. */
  note?: string;
};

/**
 * Issue #47 (ADR-0012): the Judge is no longer told a single Conversation
 * State — it is given Goal Progress and reports on the *open* Goals, and the
 * Verdict is derived from that report on the client. `state` therefore no
 * longer goes on the wire; it identifies which Goal a case is about, and the
 * Goal Progress handed to `judgeTurn` is exactly the Goals canonically before
 * it ("greeting" → nothing achieved yet, "closing" → the other three). That
 * keeps every case's original meaning — a first attempt at this Goal, nothing
 * achieved yet — without adding new case categories, which are #52's.
 */
function goalProgressBefore(state: ActiveConversationState): GoalProgress {
  return ACTIVE_CONVERSATION_STATES.slice(0, ACTIVE_CONVERSATION_STATES.indexOf(state));
}

const EVAL_CASES: EvalCase[] = [
  // --- greeting ---
  { state: "greeting", category: "whitelist", message: "Hi!", expected: "accepted" },
  {
    state: "greeting",
    category: "natural-paraphrase",
    message: "Well hello there!",
    expected: "accepted",
  },
  {
    state: "greeting",
    category: "wrong-intent",
    message: "Umm, what should I say?",
    expected: "needs_retry",
  },
  {
    state: "greeting",
    category: "off-topic",
    message: "Do you like pizza?",
    expected: "needs_retry",
  },

  // --- checkin ---
  {
    state: "checkin",
    category: "whitelist",
    message: "How are you?",
    expected: "accepted",
    // Reciprocating Emily's own question back at her IS asking back —
    // deliberately not asserting expectedAskedBack: this exact wording is
    // ambiguous (is the learner echoing Emily's question, or answering with
    // one?), so this case only pins the verdict.
  },
  {
    state: "checkin",
    category: "natural-paraphrase",
    message: "Yeah, doing alright",
    expected: "accepted",
    expectedAskedBack: false,
    note: "ticket 12's explicit acceptance case — the MVP's core technical risk bet",
  },
  {
    state: "checkin",
    category: "natural-paraphrase",
    message: "I'm good, thanks! How about you?",
    expected: "accepted",
    expectedAskedBack: true,
    note: "issue #16's learner_asked_back risk bet — a returned question must be detected",
  },
  {
    state: "checkin",
    category: "wrong-intent",
    message: "I don't understand the question.",
    expected: "needs_retry",
  },
  {
    state: "checkin",
    category: "off-topic",
    message: "What's the capital of France?",
    expected: "needs_retry",
  },

  // --- response ---
  {
    state: "response",
    category: "whitelist",
    message: "Good, thanks! And you? I'm doing pretty good, just heading to work.",
    expected: "accepted",
  },
  {
    state: "response",
    category: "natural-paraphrase",
    message: "Pretty good! You? Just running some errands.",
    expected: "accepted",
  },
  { state: "response", category: "wrong-intent", message: "Yes.", expected: "needs_retry" },
  {
    state: "response",
    category: "off-topic",
    message: "What time does the store open?",
    expected: "needs_retry",
  },

  // --- closing ---
  {
    state: "closing",
    category: "whitelist",
    message: "Have a good one!",
    expected: "accepted",
  },
  {
    state: "closing",
    category: "natural-paraphrase",
    message: "Catch you later!",
    expected: "accepted",
  },
  {
    state: "closing",
    category: "wrong-intent",
    message: "Wait, one more thing...",
    expected: "needs_retry",
  },
  {
    state: "closing",
    category: "off-topic",
    message: "What's your favorite movie?",
    expected: "needs_retry",
  },
];

// --- Runner -----------------------------------------------------------------

type EvalOutcome = EvalCase & {
  actual: Verdict | "ERROR";
  pass: boolean;
  learnerAskedBack?: boolean;
  /** The Goal Report behind `actual` — the model's own words, surfaced for failed cases. */
  goalReport?: GoalReport;
  errorMessage?: string;
};

async function runCase(apiKey: string, testCase: EvalCase): Promise<EvalOutcome> {
  try {
    // Issue #47: judgeTurn takes Goal Progress and returns a Goal Report over
    // the open Goals — the Verdict is derived here, the same way the client
    // derives it (src/lib/goal-progress.ts's `deriveVerdict`), so a case's
    // expectation is still expressed as a Verdict exactly as before.
    const goalProgress = goalProgressBefore(testCase.state);
    const result = await judgeTurn({
      apiKey,
      goalProgress,
      message: testCase.message,
      history: [],
    });
    const verdict = deriveVerdict(goalProgress, result.goal_report);
    const verdictPassed = verdict === testCase.expected;
    const askedBackPassed =
      testCase.expectedAskedBack === undefined || result.learner_asked_back === testCase.expectedAskedBack;
    return {
      ...testCase,
      actual: verdict,
      pass: verdictPassed && askedBackPassed,
      learnerAskedBack: result.learner_asked_back,
      goalReport: result.goal_report,
    };
  } catch (error) {
    return {
      ...testCase,
      actual: "ERROR",
      pass: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example) and re-run.",
    );
    process.exitCode = 1;
    return;
  }

  // Sanity-check the state coverage stays complete if a state is ever added.
  const missingStates = ACTIVE_CONVERSATION_STATES.filter(
    (state) => !EVAL_CASES.some((c) => c.state === state),
  );
  if (missingStates.length > 0) {
    console.error(`Eval table is missing coverage for state(s): ${missingStates.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Judgment quality eval — ${EVAL_CASES.length} cases against ${MODEL_ID}\n`);

  const outcomes: EvalOutcome[] = [];
  for (const testCase of EVAL_CASES) {
    process.stdout.write(
      `  [${testCase.state}/${testCase.category}] "${testCase.message}" ... `,
    );
    const outcome = await runCase(apiKey, testCase);
    outcomes.push(outcome);
    console.log(outcome.pass ? "PASS" : `FAIL (expected ${outcome.expected}, got ${outcome.actual})`);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("Details for failed cases:\n");
  const failures = outcomes.filter((o) => !o.pass);
  if (failures.length === 0) {
    console.log("  (none)");
  }
  for (const outcome of failures) {
    console.log(`  [${outcome.state}/${outcome.category}] "${outcome.message}"`);
    console.log(
      `    expected: ${outcome.expected}${outcome.expectedAskedBack !== undefined ? ` (learner_asked_back=${outcome.expectedAskedBack})` : ""}`,
    );
    console.log(
      `    actual:   ${outcome.actual}${outcome.learnerAskedBack !== undefined ? ` (learner_asked_back=${outcome.learnerAskedBack})` : ""}`,
    );
    if (outcome.goalReport) {
      console.log(`    report:   ${JSON.stringify(outcome.goalReport)}`);
    }
    if (outcome.note) console.log(`    note:     ${outcome.note}`);
    if (outcome.errorMessage) console.log(`    error:    ${outcome.errorMessage}`);
    console.log("");
  }

  const passCount = outcomes.length - failures.length;
  const passRate = ((passCount / outcomes.length) * 100).toFixed(1);
  console.log(`${"=".repeat(72)}`);
  console.log(`Pass rate: ${passCount}/${outcomes.length} (${passRate}%)`);

  if (failures.length > 0) process.exitCode = 1;
}

main();
