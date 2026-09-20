"use client";

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "@/lib/create-persisted-store";
import {
  ACTIVE_CONVERSATION_STATES,
  isActiveConversationState,
  isConversationState,
  type ActiveConversationState,
  type ConversationState,
  type Verdict,
} from "@/lib/conversation-state-machine";
import {
  applyGoalReport,
  deriveConversationState,
  getFocusGoal,
  getNewlyAchievedGoals,
  isGoalProgress,
  isGoalProgressComplete,
  type GoalProgress,
} from "@/lib/goal-progress";
import type { GoalReport } from "@/lib/practice-turn-protocol";
import { isStateTurnRecord, type StateTurnRecord } from "@/lib/turn-record";
import type { OpeningLine, ScriptLine, SupportNudge } from "@/content/lesson";

/**
 * Practice conversation store (ticket 08) — built on the same shared
 * useSyncExternalStore + localStorage factory as src/lib/progress.ts
 * (src/lib/create-persisted-store.ts, extracted in ticket 07), under its
 * own distinct storage key so it never collides with the Learning Flow
 * progress store.
 *
 * This module owns *persisted conversation state*: Goal Progress, the
 * turn-by-turn message history (populated here so a transcript has data to
 * render), and the accumulated per-state `turnRecords` the Learning Summary
 * derives from (issue #20). It performs no model call of its own — the LLM
 * request is the Practice page component's job (see
 * src/components/practice/practice-page-content.tsx), which reports the
 * judged Turn back here via `recordTurnResult`.
 *
 * Issue #47 (ADR-0012): the persisted pointer is gone. What this store
 * persists instead is `goalProgress` — the *set* of Conversation Goals
 * achieved so far — and the Conversation State the rest of the page reads
 * (`usePractice().focusGoal`, `.isComplete`) is derived from it every render
 * via src/lib/goal-progress.ts, never stored. The store applies the Judge's
 * Goal Report to Goal Progress itself (`applyGoalReport`, all-or-nothing per
 * ADR-0012).
 *
 * Issue #52's follow-up on #51 renamed the store's per-Goal bookkeeping from
 * `attemptCounts` to `retryCounts`, because what makes a Goal *not* first-try
 * is a `needs_retry` Turn on it, not a submission: this store now counts only
 * `needs_retry` Turns, keyed by the Focus Goal they were judged against, so a
 * Goal achieved out of order in an all-`accepted` run is first-try however
 * many Turns came before it (see `passedFirstTry` below and
 * docs/ai-configuration.md section 5's suggestion rule). The rename is also
 * what makes the old meaning detectable: `deserialize` requires the new field,
 * so a snapshot written by the old code — whose counts had the old meaning —
 * is discarded wholesale rather than reinterpreted as retries (see
 * `deserialize`).
 *
 * Issue #48: one Turn can be answered by several Conversation Script lines
 * (docs/ai-configuration.md section 3), so `recordTurnResult` takes the
 * whole sequence and persists one `PracticeMessage` per line, in order, in a
 * single write — each line keeps its own Chinese subtitle and its own
 * pre-generated audio, and the transcript stays a faithful record of the
 * Turn. `getCurrentTurnEmilyMessages` reads that Turn's lines back off the
 * transcript for the page's current-turn bubble, keyed on the `sequenceId`
 * that write stamped rather than on adjacency (a support nudge and the
 * opening line are each their own Turn, even though no learner message
 * separates them from the line before).
 *
 * Issue #20 (#12's "Learning Summary inputs are derived, not reported"):
 * replaced the old model-reported `highlightKeys: HighlightKey[]` list with
 * `turnRecords: StateTurnRecord[]` (src/lib/turn-record.ts) — one record per
 * Conversation State that was ever accepted, carrying whether it was passed
 * first try, whether the reply matched an Accepted Response, and whether the
 * learner asked back. `retryCounts` is the bookkeeping this store needs to
 * compute `passedFirstTry` itself: how many `needs_retry` Turns the learner has
 * had judged against each Goal so far, incremented only on those Turns —
 * a `needs_retry` Turn is the whole of what makes a later accepted Goal
 * not-first-try. Pre-issue-#20 persisted data (the old `highlightKeys` shape)
 * has no `turnRecords` field at all, pre-issue-#47 data has no `goalProgress`
 * field, and pre-issue-#52 data has no `retryCounts` field (it has the old
 * `attemptCounts`, whose counts meant submissions) — `deserialize` below
 * treats any of those mismatches as "no saved state" and discards the whole
 * snapshot rather than trying to salvage individual fields (see #12's Further
 * Notes: "In-flight practice sessions will reset").
 */

export type PracticeMessage = {
  id: string;
  role: "emily" | "learner";
  /** English text — always populated. */
  textEn: string;
  /** Chinese translation. Populated for Emily's messages (from the selected
   * Conversation Script line's `zh` — see src/lib/emily-reply-selector.ts —
   * or the opening line's `zh`); empty string for the learner's own echoed input. */
  textZh: string;
  /** The Conversation State active when this message was produced — for a graded Turn, the Focus Goal it was judged against (see `recordTurnResult`). */
  state: ConversationState;
  /**
   * Which write this message arrived in: every `appendMessages` call stamps
   * one fresh id, so the several Script lines of one graded Turn's reply share
   * a value while the opening line, each learner echo and each support nudge
   * are each their own (issue #48).
   *
   * This is what makes "the lines of the current Turn" decidable at all.
   * Adjacency is not enough: a silence nudge arrives right after Emily's
   * previous line with no learner message in between, so a tail-walk over
   * consecutive Emily messages would read "Hi! No rush — whenever you're ready."
   * as one Turn's line sequence.
   *
   * Optional because snapshots persisted before #48 have no such field —
   * `isPracticeMessage` accepts their absence, and
   * `getCurrentTurnEmilyMessages` treats a message without it as its own Turn,
   * which is exactly what a pre-#48 transcript (never more than one line per
   * Turn) means.
   */
  sequenceId?: string;
};

export type PracticeStoreState = {
  /** The set of Conversation Goals achieved so far (ADR-0012) — what replaced the old `conversationState` pointer, and the only thing the Conversation State is derived from. */
  goalProgress: GoalProgress;
  messages: PracticeMessage[];
  turnRecords: StateTurnRecord[];
  /** How many `needs_retry` Turns this Goal has been the Focus Goal of so far — only those, because a `needs_retry` Turn is the whole of what makes a later accepted Goal not-first-try (see `recordTurnResult`). Keyed by the Focus Goal at submission time, exactly as #47 specified; every other Verdict leaves it untouched. */
  retryCounts: Partial<Record<ActiveConversationState, number>>;
  /**
   * The learner's Retry Streak (issue #56; docs/ai-configuration.md section 3):
   * how many `needs_retry` Turns in a row the *current* Focus Goal has had, and
   * which Goal that was. `null` means no streak at all — the learner's last
   * Turn was `accepted`, or nothing has been retried yet.
   *
   * Deliberately a second field beside `retryCounts` rather than a reuse of it,
   * because the two say different things and only one of them resets:
   * `retryCounts` is *cumulative per Goal* and never resets — it is what Review
   * reads to say "needed support for <Goal>" (#51/#57) and what makes a later
   * accepted Goal not-first-try — while the streak is about *consecutive
   * attempts at the Goal Emily is currently asking for*, which is what decides
   * whether the recovery speaks tier 1 or tier 2 (`selectEmilyLinesForTurn`'s
   * `focusRetryStreak`). A learner who retried Check-in, then achieved
   * `response` out of order — an `accepted` Turn that leaves Check-in open —
   * has `retryCounts.checkin === 1` forever and a streak of `null`, and the
   * next stuck Check-in attempt deserves tier 1: they made progress since.
   *
   * Keyed by Goal so "the streak resets when the Focus Goal changes" is a
   * property of the shape rather than a rule someone has to remember: a count
   * recorded for Check-in can never be read for a later Focus Goal. A
   * `support_requested` Turn Outcome never reaches this store at all, so the
   * streak is untouched by the one Turn that is not an attempt.
   */
  retryStreak: { goal: ActiveConversationState; count: number } | null;
};

const STORAGE_KEY = "greeting-somebody:practice";

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value (a fresh literal on every call reads as "always
// changed" and can trigger a render loop). createPersistedStore returns this
// exact reference from its getServerSnapshot. Never mutated in place — every
// update goes through `store.persist`, which always builds a new object.
const INITIAL_STATE: PracticeStoreState = {
  goalProgress: [],
  messages: [],
  turnRecords: [],
  retryCounts: {},
  retryStreak: null,
};

function isPracticeMessage(value: unknown): value is PracticeMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.role === "emily" || v.role === "learner") &&
    typeof v.textEn === "string" &&
    typeof v.textZh === "string" &&
    isConversationState(v.state) &&
    // Absent in snapshots persisted before issue #48 — accepted, since a
    // pre-#48 transcript is still a valid one (see PracticeMessage.sequenceId).
    (v.sequenceId === undefined || typeof v.sequenceId === "string")
  );
}

/** Sanitizes a persisted `retryCounts` value, dropping anything that isn't a number keyed by a real Conversation Goal. Called only once the field is known to be present (see `deserialize`), so a malformed *entry* inside it degrades to "no retries recorded for that Goal" rather than discarding the rest of the snapshot — unlike a missing field, a corrupt one isn't evidence of a pre-change shape. */
function sanitizeRetryCounts(value: unknown): Partial<Record<ActiveConversationState, number>> {
  if (typeof value !== "object" || value === null) return {};
  const v = value as Record<string, unknown>;
  const result: Partial<Record<ActiveConversationState, number>> = {};
  for (const state of ACTIVE_CONVERSATION_STATES) {
    if (typeof v[state] === "number") result[state] = v[state];
  }
  return result;
}

/**
 * Sanitizes a persisted `retryStreak` (issue #56), for the same reason
 * `sanitizeRetryCounts` exists: a corrupt entry degrades to "no streak" rather
 * than discarding the snapshot. `undefined` is a *missing* field, handled in
 * `deserialize` — see its doc comment for why that one is not an error.
 */
function sanitizeRetryStreak(
  value: unknown,
): { goal: ActiveConversationState; count: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const goal = v.goal;
  const count = v.count;
  if (!isActiveConversationState(goal) || typeof count !== "number" || count <= 0) return null;
  return { goal, count };
}

/**
 * Issue #20 (#12's Further Notes: "In-flight practice sessions will reset"):
 * a snapshot is only trusted if the fields this store cannot work without are
 * present and well-shaped — `turnRecords` (whose absence means the old
 * pre-#20 `highlightKeys` shape), `goalProgress` (whose absence means the old
 * pre-#47 `conversationState` shape), and `retryCounts` (whose absence means a
 * pre-#52 snapshot, whose `attemptCounts` counted *submissions* rather than
 * retries — and the shape is otherwise identical, so the rename is the only
 * thing that makes that old meaning detectable at all). Any mismatch is treated
 * as "no saved state" rather than a partial-recovery case: the whole snapshot
 * is discarded (falling back to `INITIAL_STATE`, same as a JSON.parse failure)
 * instead of crashing or silently mixing old and new shapes. `messages`
 * degrades per-entry instead, since it isn't load-bearing for correctness.
 *
 * Issue #56's `retryStreak` is the one field whose *absence* is not treated as
 * a shape mismatch, and deliberately so: it is not load-bearing (a snapshot
 * without one is a conversation where the learner has not retried since their
 * last `accepted` Turn, which is a perfectly good starting point — the first
 * attempt on the Focus Goal), and its absence has exactly one possible cause,
 * a pre-#56 session, whose streak is genuinely unknowable. Discarding an
 * otherwise-valid snapshot to recover a value the old code never wrote would
 * throw away the learner's conversation to no purpose. A *malformed* one is
 * sanitized away as usual (`sanitizeRetryStreak`).
 */
/** Exported for practice-state.test.ts's discard-safely coverage (the persisted-store factory's own `serialize`/`deserialize` contract is otherwise private per store). */
export function deserialize(raw: string): PracticeStoreState {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return INITIAL_STATE;
  const p = parsed as Record<string, unknown>;

  if (!Array.isArray(p.turnRecords) || !p.turnRecords.every(isStateTurnRecord)) {
    return INITIAL_STATE;
  }
  if (!isGoalProgress(p.goalProgress)) {
    return INITIAL_STATE;
  }
  if (typeof p.retryCounts !== "object" || p.retryCounts === null) {
    return INITIAL_STATE;
  }

  const goalProgress = p.goalProgress;
  const messages = Array.isArray(p.messages) ? p.messages.filter(isPracticeMessage) : [];
  const turnRecords = p.turnRecords;
  const retryCounts = sanitizeRetryCounts(p.retryCounts);
  const retryStreak = sanitizeRetryStreak(p.retryStreak);
  return { goalProgress, messages, turnRecords, retryCounts, retryStreak };
}

function serialize(state: PracticeStoreState): string {
  return JSON.stringify(state);
}

const store = createPersistedStore<PracticeStoreState>({
  storageKey: STORAGE_KEY,
  initialState: INITIAL_STATE,
  serialize,
  deserialize,
});

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `practice-msg-${Date.now()}-${messageIdCounter}`;
}

let sequenceIdCounter = 0;
/** One fresh id per `appendMessages` call — see PracticeMessage.sequenceId. */
function nextSequenceId(): string {
  sequenceIdCounter += 1;
  return `practice-sequence-${Date.now()}-${sequenceIdCounter}`;
}

/**
 * Shared internal helper: constructs `PracticeMessage`s (assigning each a
 * fresh id, and all of them one shared `sequenceId`) and persists them
 * appended to `messages`, in the order given. Every exported function below
 * that appends an Emily/learner message goes through this, rather than each
 * hand-rolling the same "build the message object, spread it onto the end of
 * `messages`, persist" shape.
 *
 * Plural since issue #48: one Turn can be answered by a *sequence* of
 * Conversation Script lines (docs/ai-configuration.md section 3), and the
 * whole sequence belongs to a single persist — a per-line persist would let a
 * rehydration or a re-render observe a half-appended Turn, and would make the
 * "one Turn's messages arrived together" invariant a thing callers have to
 * remember instead of something this helper guarantees. That one write is also
 * what `sequenceId` records, which is how
 * `getCurrentTurnEmilyMessages` can tell a graded reply's several lines from
 * two unrelated Emily messages that merely sit next to each other.
 *
 * `stateOverrides` lets a caller update the other top-level store fields in
 * the same persist call — only `recordTurnResult` needs this, to move
 * `goalProgress`/`turnRecords`/`retryCounts` alongside appending Emily's
 * reply. Everything else distinct about each caller
 * (ensureOpeningMessage's no-op guard when messages already exist,
 * recordTurnResult's `applyGoalReport` call) stays in the caller, not here.
 */
function appendMessages(
  current: PracticeStoreState,
  inputs: { role: PracticeMessage["role"]; textEn: string; textZh: string; state: ConversationState }[],
  stateOverrides: Partial<
    Pick<PracticeStoreState, "goalProgress" | "turnRecords" | "retryCounts" | "retryStreak">
  > = {},
): void {
  if (inputs.length === 0) return;
  const sequenceId = nextSequenceId();
  const appended: PracticeMessage[] = inputs.map((input) => ({
    id: nextMessageId(),
    ...input,
    sequenceId,
  }));
  store.persist({ ...current, ...stateOverrides, messages: [...current.messages, ...appended] });
}

/**
 * The Emily messages of the *current* Turn — what the Practice page's current
 * double bubble shows (src/components/practice/message-bubble-pair.tsx), in
 * order, and what the page speaks as one sequence.
 *
 * "This Turn's lines" means lines that arrived *together*: `sequenceId`
 * matches the one `appendMessages` stamped on them (issue #48). Adjacency
 * alone is not the same thing — a silence nudge, or the opening line, is an
 * Emily message with no learner message in front of it, so a tail-walk over
 * consecutive Emily messages would merge the nudge into the previous line
 * ("Hi! No rush — whenever you're ready."). A message with no `sequenceId`
 * (persisted before #48) is its own Turn, which is what a pre-#48 transcript —
 * never more than one line per Turn — always was.
 *
 * While a learner Turn is still being graded their echo is the last message,
 * and the lines above them are the previous Turn's, which is exactly the pair
 * the page renders: Emily's line(s), then the learner's echo.
 */
export function getCurrentTurnEmilyMessages(messages: readonly PracticeMessage[]): PracticeMessage[] {
  const withoutTrailingLearner =
    messages[messages.length - 1]?.role === "learner" ? messages.slice(0, -1) : messages;
  const last = withoutTrailingLearner[withoutTrailingLearner.length - 1];
  if (last === undefined || last.role !== "emily") return [];

  const lines: PracticeMessage[] = [last];
  for (let i = withoutTrailingLearner.length - 2; i >= 0; i--) {
    const message = withoutTrailingLearner[i];
    if (
      message.role !== "emily" ||
      message.sequenceId === undefined ||
      message.sequenceId !== last.sequenceId
    ) {
      break;
    }
    lines.unshift(message);
  }
  return lines;
}

/**
 * Appends Emily's opening line as the very first message, if the transcript
 * is still empty. No-op otherwise — safe to call unconditionally on every
 * mount (fresh start picks a line; a resumed/refreshed session keeps
 * whichever line was already shown, since it's already message #1).
 */
export function ensureOpeningMessage(line: OpeningLine): void {
  const current = store.getSnapshot();
  if (current.messages.length > 0) return;
  appendMessages(current, [
    {
      role: "emily",
      textEn: line.en,
      textZh: line.zh,
      state: deriveConversationState(current.goalProgress),
    },
  ]);
}

/** Appends the learner's echoed input as a message in the current state, ahead of grading. */
export function appendLearnerMessage(text: string): void {
  const current = store.getSnapshot();
  appendMessages(current, [
    {
      role: "learner",
      textEn: text,
      textZh: "",
      state: deriveConversationState(current.goalProgress),
    },
  ]);
}

/**
 * Records the server's structured result for the just-submitted learner
 * turn: applies the Judge's Goal Report to Goal Progress via the pure
 * all-or-nothing rule (src/lib/goal-progress.ts's `applyGoalReport` — an
 * `accepted` Turn adds every Goal the report marked `achieved`, at once, and
 * a `needs_retry` Turn saves nothing), appends Emily's reply as a message
 * tagged with the Goal the turn was judged against, and — only when the turn
 * was accepted — appends one `StateTurnRecord` per Goal the turn achieved
 * (issue #20; see src/lib/turn-record.ts). A `needs_retry` turn instead bumps
 * the Focus Goal's `retryCounts` entry (so a later accepted attempt against
 * the same Goal correctly computes `passedFirstTry: false` — "the Focus Goal's
 * own record reflects prior `needs_retry` Turns on it", issue #51) but never
 * itself contributes a record — only an accepted Goal produces a highlight
 * candidate.
 *
 * Issue #51 re-grains that from #47's "one record per accepted Turn,
 * attributed to the Focus Goal" to one record per `achieved` Goal, in
 * canonical order (ADR-0012's Consequences). The two are identical in #47's
 * one-Goal-per-Turn conversations and differ exactly once a Turn can achieve
 * several: "Hi Emily! I'm good, thanks. How are you?" is one Turn and three
 * records. The achieved-this-Turn set is derived here rather than passed in —
 * `getNewlyAchievedGoals`' diff of `applyGoalReport` against the Goal Progress
 * it was given (src/lib/goal-progress.ts; the same call
 * src/lib/emily-reply-selector.ts makes for its line composition), so the
 * store cannot disagree with itself about which Goals the Turn added, and a
 * `needs_retry` Turn's diff is empty by construction, so no verdict branch is
 * needed. Three things follow from ADR-0012 and are why each field is computed
 * where it is:
 *
 *   - `passedFirstTry` — a Goal is first-try unless it has been retried, and
 *     "retried" means a `needs_retry` Turn was judged against it while it was
 *     the Focus Goal (`retryCounts`). Counting submissions instead would be
 *     wrong the moment Goals arrive out of order (issue #52's follow-up): in
 *     #50's own "I'm fine, thanks!" → "Thanks" → "Hi!" run, every Turn is
 *     `accepted` and the Focus Goal is `greeting` throughout, so a submission
 *     counter would book two attempts against Greeting and report its
 *     achievement as retried though the learner never retried anything, which
 *     would then re-rank the Learning Summary and pick the wrong Suggestion
 *     pool (docs/ai-configuration.md section 5). A Goal achieved while it was
 *     *not* the Focus Goal therefore has no retry booked against it at all and
 *     is always first-try, while the Focus Goal's own record is false exactly
 *     when it has a prior `needs_retry` Turn (#51's acceptance criterion).
 *   - `matchedAcceptedResponse` — `matchedAcceptedResponseGoals` is the set of
 *     Goals whose Accepted Responses the learner's whole sentence matched, and
 *     it is the caller's (practice-page-content.tsx's) because only it knows
 *     `Lesson` content: this module stays ignorant of it. A *subset of Goal
 *     Progress* rather than a per-Goal boolean map, so the page's check is the
 *     same one-comparison-per-Goal expression that produces the set, and this
 *     store's side is a single `includes`. Intersecting it with the achieved
 *     set is automatic — a Goal this Turn did not achieve produces no record —
 *     and whole-sentence exact match means a sentence that achieves several
 *     Goals matches none of them, so the set is empty for every multi-Goal
 *     Turn.
 *   - `learnerAskedBack` — the Judge's `learner_asked_back` describes the
 *     learner's message as a whole, but only the `response` Goal is *about*
 *     answering or returning a question (docs/ai-configuration.md section 3's
 *     Response sub-pool split), so it is written to the `response` record and
 *     `false` on every other one. A Turn that did not achieve `response`
 *     records nothing for it.
 *
 * Issue #56 adds one more piece of bookkeeping beside `retryCounts`:
 * `retryStreak`, the count of consecutive `needs_retry` Turns on the Focus Goal
 * that decides the next recovery's tier. It is bumped by exactly the Turns
 * `retryCounts` is bumped by and cleared by every other Verdict — but it is
 * *replaced* rather than accumulated, and it is keyed by the Goal it counts, so
 * it answers a different question from `retryCounts` (see that field's own doc
 * comment in `PracticeStoreState`). Both are written in the same persist as the
 * reply, so a Turn can never be recorded with one of them moved and not the
 * other.
 *
 * Issue #48: `replyLines` is the *sequence* Emily's line selector returned
 * (src/lib/emily-reply-selector.ts) — one or more Conversation Script lines
 * for this Turn. Each becomes its own `PracticeMessage`, in order, in a single
 * persist (see `appendMessages`), so the persisted transcript is a faithful
 * record of what Emily said, each line keeping its own Chinese subtitle and
 * its own pre-generated audio, and the learner can still read all of it.
 * Messages stay tagged with the Focus Goal: that is the Goal the Turn was
 * judged against (the Report's domain), not the Goal the learner achieved.
 *
 * Returns the resulting Goal Progress so the caller can act on it (e.g. know
 * immediately that the conversation just completed) without waiting on a
 * re-render.
 */
export function recordTurnResult(input: {
  focusGoal: ActiveConversationState;
  verdict: Verdict;
  goalReport: GoalReport;
  replyLines: readonly ScriptLine[];
  /**
   * The Goals whose Accepted Responses the learner's whole message matched
   * verbatim (src/lib/turn-record.ts's `matchesAcceptedResponse`) — normally
   * empty, or one entry; see this function's doc comment.
   */
  matchedAcceptedResponseGoals: readonly ActiveConversationState[];
  learnerAskedBack: boolean;
}): GoalProgress {
  const current = store.getSnapshot();

  // Only a `needs_retry` Turn is a retry: it is the one Verdict that leaves
  // Goal Progress where it was, so the learner is being asked for the same
  // Goal again. An `accepted` Turn moves on and books nothing — see
  // `passedFirstTry` in this function's doc comment for why a submission
  // counter would be wrong here.
  const retryCounts =
    input.verdict === "needs_retry"
      ? {
          ...current.retryCounts,
          [input.focusGoal]: (current.retryCounts[input.focusGoal] ?? 0) + 1,
        }
      : current.retryCounts;

  // The Retry Streak (issue #56): consecutive `needs_retry` Turns on the Focus
  // Goal, so this is the *other* half of the same Verdict — where `retryCounts`
  // adds one to a Goal's lifetime total, this replaces the streak, and any
  // `accepted` Turn clears it outright. Progress is progress even when the
  // Focus Goal stays open (a Turn that achieved a later Goal), which is the
  // whole reason the streak is not `retryCounts`: that Turn's learner should
  // hear tier 1 again, not the second try's direct example.
  const retryStreak =
    input.verdict === "needs_retry"
      ? {
          goal: input.focusGoal,
          count: (current.retryStreak?.goal === input.focusGoal ? current.retryStreak.count : 0) + 1,
        }
      : null;

  const goalProgress = applyGoalReport(current.goalProgress, input.goalReport, input.verdict);
  // Exactly what this Turn added to Goal Progress: canonical order, no
  // duplicates, and empty for a `needs_retry` Turn (applyGoalReport saves
  // nothing from one).
  const achievedThisTurn = getNewlyAchievedGoals(current.goalProgress, goalProgress);

  const turnRecords = [
    ...current.turnRecords,
    ...achievedThisTurn.map(
      (goal) =>
        ({
          state: goal,
          // Read off the counts as they stood *before* this Turn: an accepted
          // Turn bumps nothing, so this is "has this Goal ever been retried",
          // and a Goal with no entry has never been the Focus Goal of a
          // `needs_retry` Turn at all.
          passedFirstTry: (current.retryCounts[goal] ?? 0) === 0,
          matchedAcceptedResponse: input.matchedAcceptedResponseGoals.includes(goal),
          learnerAskedBack: goal === "response" && input.learnerAskedBack,
        }) satisfies StateTurnRecord,
    ),
  ];

  appendMessages(
    current,
    input.replyLines.map((line) => ({
      role: "emily" as const,
      textEn: line.en,
      textZh: line.zh,
      state: input.focusGoal,
    })),
    { goalProgress, turnRecords, retryCounts, retryStreak },
  );
  return goalProgress;
}

/**
 * Appends one or more Emily messages without touching Goal Progress or
 * `turnRecords` — for support features that must never move a conversation
 * forward (ticket 10's silence-timeout nudge; spec.md user story 62: "20 秒没
 * 说话时 Emily 只轻轻推一下、不催也不给答案"). Unlike `recordTurnResult`, this
 * never applies a Goal Report — the learner hasn't submitted a turn to judge,
 * so there is nothing to apply.
 *
 * Issue #47: the messages are tagged with the Focus Goal (the Conversation
 * State derived from Goal Progress) — the nudge is aimed at whatever Emily is
 * waiting for, which is the Focus Goal by definition. The nudge *text* is
 * still drawn from the Lesson's one global 3-line pool
 * (docs/ai-configuration.md section 3 specifies a single pool, not one per
 * Goal); selection happens at the call site
 * (src/lib/emily-reply-selector.ts's `selectSilenceReminder`).
 *
 * Issue #56: plural, because the silence nudge is now a *silence reminder* —
 * the nudge followed by the Focus Goal's question (section 3's "Silence
 * reminder"), which the learner must see and hear as one Turn. Both lines
 * therefore go through one `appendMessages` call and share a `sequenceId`,
 * which is what keeps them one Turn for the bubble and one playback (see
 * `getCurrentTurnEmilyMessages`); appending them separately would read as two.
 * Takes `SupportNudge`-shaped objects (rather than positional strings) so call
 * sites can pass a reminder's lines straight through.
 */
export function appendSupportMessages(inputs: readonly SupportNudge[]): void {
  const current = store.getSnapshot();
  appendMessages(
    current,
    inputs.map((input) => ({
      role: "emily" as const,
      textEn: input.en,
      textZh: input.zh,
      state: deriveConversationState(current.goalProgress),
    })),
  );
}

/** Clears the conversation back to a clean start — ticket 11's Retry button will call this. */
export function resetPractice(): void {
  store.persist({ goalProgress: [], messages: [], turnRecords: [], retryCounts: {}, retryStreak: null });
}

/**
 * React hook: subscribes to the practice store and re-renders on change.
 * `getServerSnapshot` returns the fixed empty/initial state so server render
 * and the first client hydration pass agree (no hydration mismatch); React
 * then swaps in the real localStorage-backed value immediately after
 * hydrating, same pattern as src/lib/progress.ts's `useProgress`.
 *
 * `focusGoal` and `isComplete` are derived here rather than stored
 * (ADR-0012): a snapshot with `goalProgress: []` reads exactly like a
 * brand-new conversation, so a discarded pre-#47 snapshot needs no special
 * case beyond `deserialize`'s wholesale fallback. There is no
 * `conversationState` field: every consumer wants the Focus Goal or the
 * completed-Goal set, and `deriveConversationState` is the store's own
 * business for tagging messages.
 */
export function usePractice() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const focusGoal = getFocusGoal(state.goalProgress);
  return {
    goalProgress: state.goalProgress,
    /** The first open Goal in canonical order, or `null` once every Goal is achieved. */
    focusGoal,
    messages: state.messages,
    turnRecords: state.turnRecords,
    isComplete: isGoalProgressComplete(state.goalProgress),
    /**
     * The Retry Streak for the *current* Focus Goal (issue #56), as the count
     * `selectEmilyLinesForTurn` reads: `0` when there is no streak, or when the
     * one on record belongs to a Goal the learner has since left behind. That
     * second case is why this is derived here rather than handed out raw — a
     * count for a Goal that is no longer the Focus Goal is stale by
     * construction, and `0` is what "the Focus Goal changed" means.
     */
    focusRetryStreak:
      state.retryStreak !== null && state.retryStreak.goal === focusGoal
        ? state.retryStreak.count
        : 0,
    ensureOpeningMessage,
    appendLearnerMessage,
    recordTurnResult,
    appendSupportMessages,
    resetPractice,
  };
}

export { ACTIVE_CONVERSATION_STATES };
