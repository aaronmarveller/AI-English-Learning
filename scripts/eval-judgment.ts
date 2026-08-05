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
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";
import { MODEL_ID, judgeTurn } from "@/lib/practice-judge";

// --- .env.local loading (no dependency — this script runs outside Next's
// own automatic .env.local loading via `tsx`, so it does its own) ----------

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

// --- Eval table (spec.md: "每个 Conversation State 的白名单内表达、白名单外
// 但意图正确的自然表达、意图错误的表达、跑题表达") ----------------------------

type EvalCategory = "whitelist" | "natural-paraphrase" | "wrong-intent" | "off-topic";

type EvalCase = {
  state: ActiveConversationState;
  category: EvalCategory;
  message: string;
  expected: Verdict;
  /** Extra context surfaced in output for cases worth calling out explicitly. */
  note?: string;
};

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
    expected: "off_topic",
  },

  // --- checkin ---
  { state: "checkin", category: "whitelist", message: "How are you?", expected: "accepted" },
  {
    state: "checkin",
    category: "natural-paraphrase",
    message: "Yeah, doing alright",
    expected: "accepted",
    note: "ticket 12's explicit acceptance case — the MVP's core technical risk bet",
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
    expected: "off_topic",
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
    expected: "off_topic",
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
    expected: "off_topic",
  },
];

// --- Runner -----------------------------------------------------------------

type EvalOutcome = EvalCase & {
  actual: Verdict | "ERROR";
  pass: boolean;
  highlightKey?: string;
  replyEn?: string;
  errorMessage?: string;
};

async function runCase(apiKey: string, testCase: EvalCase): Promise<EvalOutcome> {
  try {
    const result = await judgeTurn({
      apiKey,
      state: testCase.state,
      message: testCase.message,
      history: [],
    });
    return {
      ...testCase,
      actual: result.verdict,
      pass: result.verdict === testCase.expected,
      highlightKey: result.highlight_key,
      replyEn: result.reply_en,
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
    console.log(`    expected: ${outcome.expected}`);
    console.log(`    actual:   ${outcome.actual}${outcome.highlightKey ? ` (highlight_key=${outcome.highlightKey})` : ""}`);
    if (outcome.note) console.log(`    note:     ${outcome.note}`);
    if (outcome.replyEn) console.log(`    Emily replied: "${outcome.replyEn}"`);
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
