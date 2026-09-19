/**
 * Judgment quality eval (ticket 12; spec.md "接缝二（辅）：判定质量 eval").
 *
 * Runs a fixed "learner utterance × expected Goal Report" table against the
 * REAL Anthropic API, through the exact same judging code the app uses in
 * production (src/lib/practice-judge.ts) — not a reimplementation, so it
 * can't silently drift from what the system prompt actually produces.
 *
 * Why this exists: the E2E suite (e2e/practice-conversation.spec.ts and
 * friends) stubs the model response entirely, so it can never answer this
 * MVP's biggest technical risk — whether the model reliably accepts natural
 * phrasing OUTSIDE each Goal's Accepted Responses whitelist (e.g. "Yeah,
 * doing alright" for the check-in Goal). That's model behavior, not code
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
 * Issue #47 (ADR-0012) migrated this script to the set-shaped wire: the Judge
 * is handed Goal Progress and answers with a Goal Report.
 *
 * Issue #52 (the last child of #46) finished that migration in the table
 * itself. A case no longer names one Conversation State and one Verdict: it
 * states the **prior Goal Progress** the Judge is handed, the **full Goal
 * Report** it must come back with — one entry per *open* Goal, `achieved` /
 * `failed` / `untouched` — and optionally `learner_asked_back`. The pass check
 * compares that whole report, not a derived Verdict: a Verdict is a function
 * of exactly these values (src/lib/goal-progress.ts's `deriveVerdict`), so
 * comparing the report subsumes it and is strictly stronger — it catches a
 * model that gets the Verdict right for the wrong reason (`failed` where the
 * case expects `untouched`, say), which is precisely the #48/#49 boundary the
 * feature's own behavior now depends on (Emily's `needs_retry` line is picked
 * from the `failed` Goal, and nothing from a `needs_retry` Turn is saved).
 * The table is validated for that shape before any billed call, and it grew
 * four case categories for the shapes Flexible Goal Tracking introduced:
 *
 *   - `multi-goal` — one utterance achieves several Goals (the ticket's own
 *     headline Turn).
 *   - `out-of-order` — a later Goal achieved before an earlier one, which
 *     stays open (ADR-0012: earlier Goals are never credited "in passing").
 *   - `mixed-failure` — one Goal achieved alongside one `failed`: the
 *     all-or-nothing case, `needs_retry` with nothing saved.
 *   - `untouched-boundary` — progress with no failure: what the message never
 *     attempted is `untouched`, never `failed` (#49).
 *
 * Issue #54 (ADR-0013) adds v2 tickets 2/3/4/6's cases for the boundary it
 * moved: `response` means asking Emily back, and never thanking her, so a bare
 * thank-you leaves the Goal `untouched`. The new "I'm good, thanks." case pins
 * that (Check-in answer with a politeness marker, which neither achieves nor
 * fails `response`), #52's own `out-of-order` "I'm fine, thanks!" flips its
 * `response` entry from `achieved` to `untouched` with it, and the
 * `mixed-failure` case whose achieved half was a bare thank-you was re-pointed
 * at a real ask-back so the all-or-nothing shape is still exercised one Goal
 * later. The other side of the same decision is asserted too: an ask-back
 * stands on its own ("How about you?" alone — `response` achieved, `checkin`
 * untouched) and combines with the earlier Goals ("Hi! I'm good." for
 * greeting + check-in with Emily waiting afterwards, "Hi! I'm good, thanks.
 * How are you?" for three at once, and ticket 2's "Hi! How are you today?" for
 * greeting + ask-back with the check-in still open). No new category: these
 * cases use the four #52 added.
 *
 * Issue #55 (v2 tickets 5 and 11) adds ticket 5's own closing table one
 * expression at a time — the seven learner-side goodbyes the ticket pairs with
 * Emily's Closing steers, plus its "See u." misspelling, which must still be
 * `achieved` because grammar alone never makes an attempt `failed`. All eight
 * are `closing`-only against `goalsBefore("closing")`, the same shape #52's
 * closing cases already use, and again no new category.
 */

import {
  ACTIVE_CONVERSATION_STATES,
  type ActiveConversationState,
} from "@/lib/conversation-state-machine";
import {
  getFocusGoal,
  getOpenGoals,
  unexpectedGoalReportKeys,
  type GoalProgress,
} from "@/lib/goal-progress";
import { MODEL_ID, judgeTurn } from "@/lib/practice-judge";
import type { GoalReport } from "@/lib/practice-turn-protocol";
import { loadEnvLocal } from "./env";

// --- Eval table (spec.md: "每个 Conversation Goal 的白名单内表达、白名单外
// 但意图正确的自然表达、意图错误的表达、跑题表达") ----------------------------

/**
 * Ticket 12's four categories, kept by name, plus the four #52 added. The
 * first four mean what they always did — a whitelisted phrasing, a natural
 * equivalent outside the whitelist, an utterance that misses the Goal, an
 * off-topic utterance — except that "misses the Goal" now has to be read
 * through the three-value report: #49's boundary makes most of those
 * `untouched` (the learner never attempted the Goal), with `failed` reserved
 * for a recognisable attempt that did not communicate it. The expected report
 * is what pins which of the two a case is about.
 */
type EvalCategory =
  | "whitelist"
  | "natural-paraphrase"
  | "wrong-intent"
  | "off-topic"
  | "multi-goal"
  | "out-of-order"
  | "mixed-failure"
  | "untouched-boundary";

type EvalCase = {
  category: EvalCategory;
  /**
   * The Goal Progress handed to `judgeTurn` — the Goals already achieved, and
   * therefore the ones the Judge is *not* asked about. This (not a single
   * Conversation State) is the case's whole notion of where the conversation
   * stands (ADR-0012).
   */
  goalProgress: GoalProgress;
  message: string;
  /**
   * The Goal Report this message must produce, with one entry per *open* Goal
   * — all of them, always. The pass check compares this whole object (see this
   * file's top doc comment); a case that named only some of the open Goals
   * would silently assert that the rest came back `undefined`, so the table is
   * validated up front to name exactly the open set (`tableProblems`).
   */
  expectedReport: GoalReport;
  /**
   * Issue #16: with `reply_en`/`highlight_key` gone, `learner_asked_back` is
   * the model's only output besides its judgment on the learner's message —
   * and this eval is its only guard against the real API too. Optional: only
   * asserted when a case sets it, which a case should do whenever the answer
   * is not genuinely ambiguous (the few cases that leave it out say why in a
   * `note`).
   */
  expectedAskedBack?: boolean;
  /**
   * Issue #52: a case whose report is *recorded* rather than asserted — the
   * one utterance the issue explicitly leaves to the model's judgment. The
   * report is printed on every run so the judgment call stays visible, but the
   * case can never turn the run red, because no expectation for it is
   * defensible yet. An ERROR still counts as a failure: a call that errored
   * recorded nothing.
   */
  recordOnly?: true;
  /** Extra context surfaced in output for cases worth calling out explicitly. */
  note?: string;
};

/**
 * Ticket 12's cases, kept at their original meaning: the Goal Progress handed
 * to the Judge is exactly the Goals canonically before the one the case is
 * about ("greeting" → nothing achieved yet, "closing" → the other three) — a
 * first attempt at that Goal, nothing achieved yet, one message that only
 * means to touch it. #47 introduced this when the single `state` field stopped
 * going on the wire; #52 kept it for the migrated cases rather than re-seeding
 * each one, so their reports still describe the same conversation the original
 * table did.
 */
function goalsBefore(state: ActiveConversationState): GoalProgress {
  return ACTIVE_CONVERSATION_STATES.slice(0, ACTIVE_CONVERSATION_STATES.indexOf(state));
}

const EVAL_CASES: EvalCase[] = [
  // --- greeting, nothing achieved yet -------------------------------------
  {
    category: "whitelist",
    goalProgress: goalsBefore("greeting"),
    message: "Hi!",
    expectedReport: {
      greeting: "achieved",
      checkin: "untouched",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
  },
  {
    category: "natural-paraphrase",
    goalProgress: goalsBefore("greeting"),
    message: "Well hello there!",
    expectedReport: {
      greeting: "achieved",
      checkin: "untouched",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
  },
  {
    category: "wrong-intent",
    goalProgress: goalsBefore("greeting"),
    message: "Umm, what should I say?",
    expectedReport: {
      greeting: "untouched",
      checkin: "untouched",
      response: "untouched",
      closing: "untouched",
    },
    note: "asking what to say is not an attempt at a greeting — #49's untouched boundary. learner_asked_back is not asserted: the question is addressed to Emily but is not a question *back* about her.",
  },
  {
    category: "off-topic",
    goalProgress: goalsBefore("greeting"),
    message: "Do you like pizza?",
    expectedReport: {
      greeting: "untouched",
      checkin: "untouched",
      response: "untouched",
      closing: "untouched",
    },
    note: "off-topic: every open Goal untouched (docs/ai-configuration.md section 1's Global Constraints). learner_asked_back is not asserted — not what this case is about.",
  },

  // --- checkin, greeting already achieved ---------------------------------
  {
    category: "whitelist",
    goalProgress: goalsBefore("checkin"),
    message: "How are you?",
    expectedReport: { checkin: "untouched", response: "achieved", closing: "untouched" },
    note: "reciprocating Emily's question is the `response` Goal ('How about you?', 'And you?'), not `checkin` — the learner asked about Emily, and said nothing about how they are. learner_asked_back is not asserted: this exact wording has always been the table's ambiguous one (echoing Emily's question vs. asking it), and the report is what this case pins.",
  },
  {
    category: "natural-paraphrase",
    goalProgress: goalsBefore("checkin"),
    message: "Yeah, doing alright",
    expectedReport: { checkin: "achieved", response: "untouched", closing: "untouched" },
    expectedAskedBack: false,
    note: "ticket 12's explicit acceptance case — the MVP's core technical risk bet",
  },
  {
    category: "natural-paraphrase",
    goalProgress: goalsBefore("checkin"),
    message: "I'm good, thanks! How about you?",
    expectedReport: { checkin: "achieved", response: "achieved", closing: "untouched" },
    expectedAskedBack: true,
    note: "issue #16's learner_asked_back risk bet, and #48's multi-Goal shape in miniature: the returned question achieves `response` in the same Turn",
  },
  {
    category: "wrong-intent",
    goalProgress: goalsBefore("checkin"),
    message: "I don't understand the question.",
    expectedReport: { checkin: "untouched", response: "untouched", closing: "untouched" },
    expectedAskedBack: false,
    note: "the learner engaged with the question without attempting to say how they are — nothing attempted, so `untouched`, not `failed` (#49)",
  },
  {
    category: "off-topic",
    goalProgress: goalsBefore("checkin"),
    message: "What's the capital of France?",
    expectedReport: { checkin: "untouched", response: "untouched", closing: "untouched" },
    note: "off-topic: every open Goal untouched. learner_asked_back is not asserted — not what this case is about.",
  },

  // --- response, greeting + checkin already achieved -----------------------
  {
    category: "whitelist",
    goalProgress: goalsBefore("response"),
    message: "Good, thanks! And you? I'm doing pretty good, just heading to work.",
    expectedReport: { response: "achieved", closing: "untouched" },
    expectedAskedBack: true,
  },
  {
    category: "natural-paraphrase",
    goalProgress: goalsBefore("response"),
    message: "Pretty good! You? Just running some errands.",
    expectedReport: { response: "achieved", closing: "untouched" },
    expectedAskedBack: true,
  },
  {
    category: "wrong-intent",
    goalProgress: goalsBefore("response"),
    message: "Yes.",
    expectedReport: { response: "untouched", closing: "untouched" },
    expectedAskedBack: false,
    note: 'docs/ai-configuration.md section 4 names a bare "Yes." as the canonical `untouched` — never `failed`, even on the Goal being judged',
  },
  {
    category: "off-topic",
    goalProgress: goalsBefore("response"),
    message: "What time does the store open?",
    expectedReport: { response: "untouched", closing: "untouched" },
    note: "off-topic: every open Goal untouched. learner_asked_back is not asserted — not what this case is about.",
  },

  // --- closing, everything else already achieved --------------------------
  {
    category: "whitelist",
    goalProgress: goalsBefore("closing"),
    message: "Have a good one!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
  },
  {
    category: "natural-paraphrase",
    goalProgress: goalsBefore("closing"),
    message: "Catch you later!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
  },
  {
    category: "wrong-intent",
    goalProgress: goalsBefore("closing"),
    message: "Wait, one more thing...",
    expectedReport: { closing: "untouched" },
    expectedAskedBack: false,
    note: "the opposite of a goodbye attempt, so nothing was attempted toward this Goal — `untouched`, never `failed`",
  },
  {
    category: "off-topic",
    goalProgress: goalsBefore("closing"),
    message: "What's your favorite movie?",
    expectedReport: { closing: "untouched" },
    note: "off-topic: the one open Goal untouched. learner_asked_back is not asserted — not what this case is about.",
  },

  // --- multi-goal (#52): one utterance achieves several Goals --------------
  {
    category: "multi-goal",
    goalProgress: [],
    message: "Hi Emily! I'm good, thanks. How are you?",
    expectedReport: {
      greeting: "achieved",
      checkin: "achieved",
      response: "achieved",
      closing: "untouched",
    },
    expectedAskedBack: true,
    note: "the ticket's headline Turn (issue #46): greeting, check-in and the returned question all land at once, and Emily must not ask how the learner is doing again",
  },
  {
    category: "multi-goal",
    goalProgress: [],
    message: "Hello! I'm doing well.",
    expectedReport: {
      greeting: "achieved",
      checkin: "achieved",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
    note: "two Goals, neither of them the one Emily steered at, and no question back to separate them",
  },

  // --- out-of-order (#52): a later Goal before an earlier one -------------
  {
    category: "out-of-order",
    goalProgress: [],
    message: "I'm fine, thanks!",
    expectedReport: {
      greeting: "untouched",
      checkin: "achieved",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
    note: "issue #52's case: answering the check-in first leaves `greeting` untouched — never credited in passing (ADR-0012). Its `response` half is the boundary issue #54 (ADR-0013) settled the other way from #52's first live run: a bare thank-you is politeness, not an ask-back, so it leaves `response` `untouched` — exactly as a message that attempted no Goal does, and never `failed`, because a thank-you is not a garbled question back. \"Thanks.\" is no longer one of `response`'s Accepted Responses for the same reason.",
  },
  {
    category: "out-of-order",
    goalProgress: [],
    message: "Hi! Bye!",
    expectedReport: {
      greeting: "achieved",
      checkin: "untouched",
      response: "untouched",
      closing: "achieved",
    },
    expectedAskedBack: false,
    note: "issue #52's case: a greeting and a goodbye in one line, with the check-in left open for Emily to steer back to",
  },
  {
    category: "out-of-order",
    goalProgress: [],
    message: "I'm doing well. See you!",
    expectedReport: {
      greeting: "untouched",
      checkin: "achieved",
      response: "untouched",
      closing: "achieved",
    },
    expectedAskedBack: false,
    note: "two non-canonical Goals at once, with `greeting` still open — Goal Progress with a gap for the check-in (ADR-0012 allows it; the Focus Goal stays `greeting`)",
  },

  // --- mixed failure (#52): one Goal right, one Goal attempted and wrong --
  {
    category: "mixed-failure",
    goalProgress: goalsBefore("checkin"),
    message: "I'm fine. See you later alligator crocodile",
    expectedReport: { checkin: "achieved", response: "untouched", closing: "failed" },
    expectedAskedBack: false,
    note: "issue #49's acceptance case: `closing` is a recognisable goodbye attempt that did not communicate it, so the Turn is `needs_retry` and the correct half is not saved either",
  },
  {
    category: "mixed-failure",
    goalProgress: goalsBefore("response"),
    message: "How about you? See you later alligator crocodile",
    expectedReport: { response: "achieved", closing: "failed" },
    expectedAskedBack: true,
    note: "the same all-or-nothing shape one Goal later, on the ask-back that issue #54 (ADR-0013) makes what achieves `response`: a real question back achieved alongside a garbled goodbye `failed`, so the Turn is `needs_retry` and the correct half is not saved either. (This case used \"Thank you! ...\" until #54, when a bare thank-you stopped counting as a `response` — the ask-back is what keeps the shape exercised.)",
  },

  // --- untouched boundary (#52): progress without failure ----------------
  {
    category: "untouched-boundary",
    goalProgress: [],
    message: "Hi! I like pizza.",
    expectedReport: {
      greeting: "achieved",
      checkin: "untouched",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
    note: "issue #52's case: one Goal achieved and the rest silence — 'Hi!' is progress, and 'I like pizza' is not a failed check-in",
  },
  {
    category: "untouched-boundary",
    goalProgress: [],
    message: "Hi! Yes.",
    expectedReport: {
      greeting: "achieved",
      checkin: "untouched",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
    note: 'issue #52\'s case: a bare "Yes." is the doc\'s canonical `untouched` — the boundary #49 drew, at the Goal the learner is most likely to be answering',
  },
  {
    category: "untouched-boundary",
    goalProgress: [],
    message: "Hi! Good you are?",
    expectedReport: {
      greeting: "achieved",
      checkin: "untouched",
      response: "untouched",
      closing: "untouched",
    },
    recordOnly: true,
    note: "issue #52 records this one rather than asserting it, as a documented judgment call: a garbled question-back after a greeting could defensibly be `achieved` `response` (the intent came through), `failed` `response` (a recognisable attempt that did not), or `untouched`. The greeting half ('Hi!') is not in doubt, and the report this run produced is printed below.",
  },

  // --- issue #54 (ADR-0013; v2 tickets 2/3/4/6): `response` means asking
  // Emily back ------------------------------------------------------------
  {
    category: "untouched-boundary",
    goalProgress: [],
    message: "I'm good, thanks.",
    expectedReport: {
      greeting: "untouched",
      checkin: "achieved",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
    note: "the case that pins ADR-0013 decision 1 (v2 ticket 3's first Check-in row): 'I'm good, thanks.' is a Check-in answer with a politeness marker — the thank-you neither achieves nor fails `response`, so no steer toward `response` follows and Emily waits for the learner to continue. `greeting` stays untouched because the learner volunteered the check-in without greeting her (ADR-0012), so with `greeting` still open this case's Goal Progress does put a `greeting` steer after the acknowledgement; the shape ADR-0013 describes as one line is the ordinary one where `greeting` is already achieved (#52's 'Yeah, doing alright' case one Goal later).",
  },
  {
    category: "out-of-order",
    goalProgress: [],
    message: "How about you?",
    expectedReport: {
      greeting: "untouched",
      checkin: "untouched",
      response: "achieved",
      closing: "untouched",
    },
    expectedAskedBack: true,
    note: "v2 ticket 4's ask-back alone (ADR-0013 decision 1): asking Emily a question back achieves `response` and says nothing about how *they* are, so `checkin` stays `untouched` — as does `greeting`, never credited in passing (ADR-0012). Emily answers from the asked-back pool; with both earlier Goals still open here she then steers back to `greeting`, the first open Goal in canonical order (ADR-0012/#50).",
  },
  {
    category: "multi-goal",
    goalProgress: [],
    message: "Hi! I'm good.",
    expectedReport: {
      greeting: "achieved",
      checkin: "achieved",
      response: "untouched",
      closing: "untouched",
    },
    expectedAskedBack: false,
    note: "v2 ticket 6's Example 1 (ticket 3's attachment row 'Hi! I'm good.'): greeting and check-in in one Turn with no ask-back, so Emily acknowledges and then waits rather than steering toward `response` — the wait ticket 3 asks for.",
  },
  {
    category: "multi-goal",
    goalProgress: [],
    message: "Hi! I'm good, thanks. How are you?",
    expectedReport: {
      greeting: "achieved",
      checkin: "achieved",
      response: "achieved",
      closing: "untouched",
    },
    expectedAskedBack: true,
    note: "v2 ticket 6's Example 2, three Goals at once: the ask-back is what achieves `response` (#54), so Emily answers it from the asked-back pool and steers to Closing — she never gives a Check-in-only acknowledgement first and waits for a second ask-back (ticket 4's \"Important\").",
  },
  {
    category: "natural-paraphrase",
    goalProgress: [],
    message: "Hi! How are you today?",
    expectedReport: {
      greeting: "achieved",
      checkin: "untouched",
      response: "achieved",
      closing: "untouched",
    },
    expectedAskedBack: true,
    note: "v2 ticket 2's Example 1, and ADR-0013 decision 1 in the first exchange of a conversation: the learner greets and asks Emily how she is in one breath, which achieves `response` and says nothing about how *they* are, so `checkin` stays `untouched`. Emily answers, then steers to the check-in — the Focus Goal.",
  },

  // --- issue #55 (v2 ticket 5's Closing table; tickets 5 and 11) -----------
  //
  // The fine-grained half of ticket 5: the exact learner-side expressions its
  // Closing table pairs with each of Emily's steers, plus the misspelling the
  // ticket calls out. Every one of them is a goodbye and nothing else — the
  // other three Goals are already in Goal Progress (`goalsBefore("closing")`),
  // so the whole report is `closing` — and none of them asks Emily a question,
  // so `learner_asked_back` is `false` throughout. Six of the eight are rows on
  // `closing`'s Accepted Responses list (Section 2 of docs/ai-configuration.md)
  // and are `whitelist` cases, though the table's own punctuation differs from
  // the list's in places ("Bye." and "You too." are listed without the table's
  // exclamation mark). The other two are `natural-paraphrase` cases —
  // "Thanks, you too!" and the misspelling "See u." — which the Global
  // Conversation Rules require to be accepted just the same.
  {
    category: "whitelist",
    goalProgress: goalsBefore("closing"),
    message: "You too!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "v2 ticket 5's first learner-response row ('Have a nice day!' → 'You too!'): the returned well-wish is a goodbye in this position. The whitelist carries it as \"You too.\" — the exclamation mark is punctuation, not a different expression.",
  },
  {
    category: "whitelist",
    goalProgress: goalsBefore("closing"),
    message: "See you!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "v2 ticket 5's most-paired learner response, and one of the Closing pool's own lines — the pool and the learner can say the same thing, which is why issue #55 re-authored both pools.",
  },
  {
    category: "whitelist",
    goalProgress: goalsBefore("closing"),
    message: "Bye!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "the shortest goodbye on the list (whitelist: \"Bye.\") — a one-word farewell is a complete attempt at this Goal.",
  },
  {
    category: "whitelist",
    goalProgress: goalsBefore("closing"),
    message: "Take care!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "v2 ticket 5's learner-response column under 'Take care!' — an offer of care that closes a conversation rather than continuing it.",
  },
  {
    category: "natural-paraphrase",
    goalProgress: goalsBefore("closing"),
    message: "Thanks, you too!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "v2 ticket 5's first row, second variant: a thank-you plus a returned well-wish — off the whitelist, and still a goodbye. The thank-you does not make it a `response` attempt (nothing is asked back, so `learner_asked_back` is false), and per ADR-0013 a thank-you is not an ask-back at all.",
  },
  {
    category: "whitelist",
    goalProgress: goalsBefore("closing"),
    message: "Have a nice day!",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "both a whitelist entry and a Closing-pool line (issue #55's steer pool) — e.g. the same sentence is what Emily says to invite the goodbye and what the learner may say to give it.",
  },
  {
    category: "whitelist",
    goalProgress: goalsBefore("closing"),
    message: "Goodbye.",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "the whitelist's most explicit goodbye, and the only one that reads equally as an ending the learner chose rather than the one Emily steered toward (credited either way — ADR-0012).",
  },
  {
    category: "natural-paraphrase",
    goalProgress: goalsBefore("closing"),
    message: "See u.",
    expectedReport: { closing: "achieved" },
    expectedAskedBack: false,
    note: "issue #55's misspelling case: a text-message abbreviation of \"See you.\" The minor spelling error must not stop it being `achieved` — grammar alone never makes an attempt `failed` (docs/ai-configuration.md section 4, section 1's Global Conversation Rules).",
  },
];

// --- Table invariants (checked before any billed call) ----------------------

/**
 * #52's table invariants. Both are cheap and both are the kind of mistake that
 * would otherwise hide behind a green run: an expected report that names the
 * wrong Goal set (the pass check would compare values the Judge was never
 * asked for), and a Goal that no case exercises as a Focus Goal (the table's
 * original sanity check, kept — every Goal must still be the one Emily would
 * steer at in at least one case).
 */
function tableProblems(): string[] {
  const problems: string[] = [];
  const goalsWithNoFocusCase = ACTIVE_CONVERSATION_STATES.filter(
    (goal) => !EVAL_CASES.some((testCase) => getFocusGoal(testCase.goalProgress) === goal),
  );
  if (goalsWithNoFocusCase.length > 0) {
    problems.push(`no case has this Goal as its Focus Goal: ${goalsWithNoFocusCase.join(", ")}`);
  }
  for (const testCase of EVAL_CASES) {
    const openGoals = getOpenGoals(testCase.goalProgress);
    const expected = Object.keys(testCase.expectedReport).sort().join(", ");
    const open = [...openGoals].sort().join(", ");
    if (expected !== open) {
      problems.push(
        `"${testCase.message}" expects {${expected}} but its Goal Progress leaves open {${open}}`,
      );
    }
  }
  return problems;
}

// --- Runner -----------------------------------------------------------------

type EvalOutcome = EvalCase & {
  /** Where Emily would steer next — the Focus Goal of this case's prior Goal Progress. */
  focusGoal: ActiveConversationState | null;
  /** False for a `recordOnly` case only when the call itself failed. */
  pass: boolean;
  /** The model's own report — the whole pass check, and what a failure needs to show. */
  actualReport?: GoalReport;
  learnerAskedBack?: boolean;
  /** Report keys outside the open Goals. The tool schema makes these impossible; surfaced if they ever appear. */
  unexpectedKeys?: string[];
  errorMessage?: string;
};

/**
 * #52's pass check: the full Goal Report, Goal by Goal, over exactly the Goals
 * the Judge was asked about. `actual[key]` is `undefined` for a Goal the model
 * left out — printed as such — so a truncated report fails loudly rather than
 * passing on the keys that did arrive.
 */
function reportMatches(progress: GoalProgress, expected: GoalReport, actual: GoalReport): boolean {
  return getOpenGoals(progress).every((goal) => expected[goal] === actual[goal]);
}

async function runCase(apiKey: string, testCase: EvalCase): Promise<EvalOutcome> {
  const { goalProgress } = testCase;
  try {
    // The Exact Same Code Production Runs: judgeTurn builds the system prompt
    // from Goal Progress and calls the forced `submit_turn_result` tool, so a
    // prompt-wording regression shows up here and nowhere else.
    //
    // `history` is deliberately empty for every case (as it was before #52):
    // what a case asserts is one learner message judged against a Goal set,
    // and Goal Progress — not the transcript — is what the Judge's report is
    // keyed to (ADR-0012).
    const result = await judgeTurn({
      apiKey,
      goalProgress,
      message: testCase.message,
      history: [],
    });
    const reportPassed =
      testCase.recordOnly === true ||
      reportMatches(goalProgress, testCase.expectedReport, result.goal_report);
    const askedBackPassed =
      testCase.expectedAskedBack === undefined ||
      result.learner_asked_back === testCase.expectedAskedBack;
    return {
      ...testCase,
      focusGoal: getFocusGoal(goalProgress),
      pass: reportPassed && askedBackPassed,
      actualReport: result.goal_report,
      learnerAskedBack: result.learner_asked_back,
      unexpectedKeys: unexpectedGoalReportKeys(goalProgress, result.goal_report),
    };
  } catch (error) {
    return {
      ...testCase,
      focusGoal: getFocusGoal(goalProgress),
      pass: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- Output -----------------------------------------------------------------

function formatProgress(progress: GoalProgress): string {
  return progress.length === 0 ? "(nothing yet)" : progress.join(", ");
}

/** `{checkin: achieved, response: untouched}` — only the Goals this case was asked about, in canonical order. */
function formatReport(progress: GoalProgress, report: GoalReport): string {
  const entries = getOpenGoals(progress).map((goal) => `${goal}: ${report[goal] ?? "(missing)"}`);
  return `{${entries.join(", ")}}`;
}

function formatAskedBack(value: boolean | undefined): string {
  return value === undefined ? "(not asserted)" : `learner_asked_back=${value}`;
}

function describe(testCase: EvalCase): string {
  return `[${testCase.category}] progress: ${formatProgress(testCase.goalProgress)} — "${testCase.message}"`;
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

  const problems = tableProblems();
  if (problems.length > 0) {
    console.error("The eval table is malformed:\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  const assertedCount = EVAL_CASES.filter((testCase) => testCase.recordOnly !== true).length;
  const recordedCount = EVAL_CASES.length - assertedCount;
  console.log(
    `Judgment quality eval — ${EVAL_CASES.length} cases (${assertedCount} asserted, ${recordedCount} recorded-only) against ${MODEL_ID}\n`,
  );

  const outcomes: EvalOutcome[] = [];
  for (const testCase of EVAL_CASES) {
    process.stdout.write(`  ${describe(testCase)} ... `);
    const outcome = await runCase(apiKey, testCase);
    outcomes.push(outcome);
    console.log(outcome.pass ? "PASS" : `FAIL (expected ${formatReport(testCase.goalProgress, testCase.expectedReport)}, got ${outcome.actualReport ? formatReport(testCase.goalProgress, outcome.actualReport) : outcome.errorMessage ?? "ERROR"})`);
  }

  const failures = outcomes.filter((outcome) => !outcome.pass);
  console.log(`\n${"=".repeat(72)}`);
  console.log("Details for failed cases:\n");
  if (failures.length === 0) {
    console.log("  (none)");
  }
  for (const outcome of failures) {
    console.log(`  ${describe(outcome)}`);
    console.log(
      `    expected: ${formatReport(outcome.goalProgress, outcome.expectedReport)} (${formatAskedBack(outcome.expectedAskedBack)})`,
    );
    console.log(
      `    actual:   ${outcome.actualReport ? formatReport(outcome.goalProgress, outcome.actualReport) : "ERROR"} (${formatAskedBack(outcome.learnerAskedBack)})`,
    );
    if (outcome.unexpectedKeys && outcome.unexpectedKeys.length > 0) {
      console.log(`    unexpected Goal keys (dropped by the client): ${outcome.unexpectedKeys.join(", ")}`);
    }
    if (outcome.note) console.log(`    note:     ${outcome.note}`);
    if (outcome.errorMessage) console.log(`    error:    ${outcome.errorMessage}`);
    console.log("");
  }

  const recorded = outcomes.filter((outcome) => outcome.recordOnly === true);
  if (recorded.length > 0) {
    console.log(`${"=".repeat(72)}`);
    console.log("Recorded-only cases (not asserted — issue #52's documented judgment calls):\n");
    for (const outcome of recorded) {
      console.log(`  ${describe(outcome)}`);
      console.log(
        `    recorded: ${outcome.actualReport ? formatReport(outcome.goalProgress, outcome.actualReport) : "ERROR"} (${formatAskedBack(outcome.learnerAskedBack)})`,
      );
      if (outcome.note) console.log(`    note:     ${outcome.note}`);
      // An errored record-only case is listed in the failures above too — it
      // recorded nothing, so it is reported as a failure rather than hidden
      // behind "recorded".
      if (outcome.errorMessage) console.log(`    error:    ${outcome.errorMessage}`);
      console.log("");
    }
  }

  // Per-category tally over asserted cases only — the category is what tells
  // us *which* judgment the prompt is getting wrong.
  const categories = [...new Set(EVAL_CASES.map((testCase) => testCase.category))];
  const tally = categories
    .map((category) => {
      const inCategory = outcomes.filter(
        (outcome) => outcome.category === category && outcome.recordOnly !== true,
      );
      const passed = inCategory.filter((outcome) => outcome.pass).length;
      return `${category} ${passed}/${inCategory.length}`;
    })
    .join(", ");

  const asserted = outcomes.filter((outcome) => outcome.recordOnly !== true);
  const passCount = asserted.filter((outcome) => outcome.pass).length;
  const passRate = asserted.length === 0 ? "0.0" : ((passCount / asserted.length) * 100).toFixed(1);
  console.log(`${"=".repeat(72)}`);
  console.log(`By category: ${tally}`);
  console.log(
    `Pass rate: ${passCount}/${asserted.length} asserted cases (${passRate}%)${recordedCount > 0 ? ` — plus ${recordedCount} recorded-only case(s), not counted` : ""}`,
  );

  if (failures.length > 0) process.exitCode = 1;
}

main();
