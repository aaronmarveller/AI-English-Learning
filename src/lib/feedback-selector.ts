/**
 * Feedback selection module (issue #20; issue #12's "Learning Summary
 * inputs are derived, not reported"). Pure function, same discipline as
 * src/lib/conversation-state-machine.ts: no React, no localStorage, no
 * fetch — just `StateTurnRecord[]` in, `FeedbackLine[]` out.
 *
 * Randomness choice: rather than reaching for a hidden module-level RNG (or
 * a seed parameter that would leak a testing concern into the production
 * signature), `random` is an injectable `() => number` defaulting to
 * `Math.random`. That keeps the function pure and trivially swappable for a
 * deterministic fake — see feedback-selector.test.ts, which pins the
 * Overall guarantee, one-per-group, and first-try-ranking rules exactly
 * because this is injectable.
 *
 * Fixed output contract (AI Configuration section ⑥):
 *   1 praise → 2-3 highlights → 1 suggestion → 1 closing, in that
 *   exact order, every time — even when `turnRecords` is empty (e.g. a
 *   learner reaches /review?debug=1 without having played Practice), via
 *   src/content/review.ts's generic fallback pools.
 *
 * Highlight groups (issue #20 acceptance criteria; #12's own table; issue #51
 * re-grained the records these read from to one per *Goal* achieved rather
 * than one per accepted Turn):
 *   - Greeting    ← the `greeting` Goal's record
 *   - Check-in    ← the `checkin` Goal's record
 *   - Conversation ← the `response` and `closing` Goals' records combined
 *     (at most one highlight from this group, even though two Goals feed it)
 *   - Overall     ← the run as a whole; contributed whenever every one of
 *     the 4 active Goals has a record (i.e. the learner completed the
 *     conversation), regardless of ranking below
 *
 * Selection rules (issue #20 acceptance criteria):
 *   - 2-3 highlights shown
 *   - completing all four Goals always contributes one Overall highlight
 *   - at most one highlight per group
 *   - Goals passed first-try rank above Goals that needed a retry, when
 *     there are more eligible groups than slots
 */

import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import type { StateTurnRecord } from "@/lib/turn-record";
import {
  CLOSING_TEMPLATES,
  PRAISE_TEMPLATES,
  GENERIC_GROWTH_SUGGESTION_TEMPLATES,
  GENERIC_HIGHLIGHT_TEMPLATES,
  HIGHLIGHT_TEMPLATES,
  NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES,
} from "@/content/review";

export type FeedbackLineKind = "praise" | "highlight" | "suggestion" | "closing";

export type FeedbackLine = {
  id: string;
  kind: FeedbackLineKind;
  /** Chinese-majority feedback selected from AI Configuration's template library. */
  text: string;
};

export type HighlightGroup = keyof typeof HIGHLIGHT_TEMPLATES;

/** How many highlight lines to show — the ticket's own fixed range. */
const HIGHLIGHT_COUNT_OPTIONS = [2, 3] as const;

function pickOne<T>(pool: readonly T[], random: () => number): T {
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  return pool[index];
}

/** Fisher-Yates shuffle (using the injected `random`) then take the first `count` — used to pick several *distinct* items from a pool without replacement. */
function pickDistinct<T>(pool: readonly T[], count: number, random: () => number): T[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

type GroupCandidate = { group: HighlightGroup; passedFirstTry: boolean };

/**
 * Builds the set of eligible highlight groups from this run's accumulated
 * per-Goal records — at most one candidate per group (Greeting, Check-in,
 * Conversation, Overall), per the "at most one highlight per group" rule.
 *
 * One record per Goal achieved (issue #51), and an achieved Goal is never open
 * again, so a Goal contributes at most one record and this index is total.
 */
function buildGroupCandidates(turnRecords: StateTurnRecord[]): GroupCandidate[] {
  const byGoal = new Map(turnRecords.map((record) => [record.state, record]));
  const candidates: GroupCandidate[] = [];

  const greeting = byGoal.get("greeting");
  if (greeting) candidates.push({ group: "greeting", passedFirstTry: greeting.passedFirstTry });

  const checkin = byGoal.get("checkin");
  if (checkin) candidates.push({ group: "checkin", passedFirstTry: checkin.passedFirstTry });

  const conversationRecords = [byGoal.get("response"), byGoal.get("closing")].filter(
    (record): record is StateTurnRecord => record !== undefined,
  );
  if (conversationRecords.length > 0) {
    candidates.push({
      group: "conversation",
      passedFirstTry: conversationRecords.some((record) => record.passedFirstTry),
    });
  }

  const completedAllFourGoals = ACTIVE_CONVERSATION_STATES.every((goal) => byGoal.has(goal));
  if (completedAllFourGoals) {
    // Overall's guarantee is unconditional on completion — it doesn't
    // compete on first-try ranking for its own inclusion, only (like every
    // other group) for which of the 2-3 *slots* the caller below assigns it
    // first.
    candidates.push({ group: "overall", passedFirstTry: true });
  }

  return candidates;
}

/**
 * Picks up to `count` groups to actually show, honoring: Overall is always
 * included first when eligible (the "completing all four Goals always
 * contributes one Overall highlight" guarantee), then the remaining slots
 * are filled from the other eligible groups, first-try-passed ones ranked
 * ahead of retry-needed ones (with ties broken via the injected `random`).
 */
function selectHighlightGroups(
  turnRecords: StateTurnRecord[],
  count: number,
  random: () => number,
): GroupCandidate[] {
  const candidates = buildGroupCandidates(turnRecords);
  const overall = candidates.find((candidate) => candidate.group === "overall");
  const others = candidates.filter((candidate) => candidate.group !== "overall");

  const firstTryOthers = pickDistinct(
    others.filter((candidate) => candidate.passedFirstTry),
    others.length,
    random,
  );
  const retryOthers = pickDistinct(
    others.filter((candidate) => !candidate.passedFirstTry),
    others.length,
    random,
  );
  const rankedOthers = [...firstTryOthers, ...retryOthers];

  const selected: GroupCandidate[] = [];
  if (overall) selected.push(overall);
  for (const candidate of rankedOthers) {
    if (selected.length >= count) break;
    selected.push(candidate);
  }

  return selected.slice(0, count);
}

/**
 * Builds the 2-3 highlight lines, reflecting the distinct groups this
 * conversation's `turnRecords` actually earned. Tops up with generic
 * (still-positive) copy when fewer than `count` groups are eligible — an
 * incomplete run (e.g. a learner reaching /review mid-conversation) must
 * still show the fixed 2-3 highlight count.
 */
function selectHighlightTexts(turnRecords: StateTurnRecord[], count: number, random: () => number): string[] {
  const groups = selectHighlightGroups(turnRecords, count, random);
  const texts = groups.map((candidate) => pickOne(HIGHLIGHT_TEMPLATES[candidate.group], random));

  while (texts.length < count) {
    const unused = GENERIC_HIGHLIGHT_TEMPLATES.filter((text) => !texts.includes(text));
    if (unused.length === 0) break;
    texts.push(pickOne(unused, random));
  }

  return texts;
}

/**
 * Picks the single suggestion, grounded in whether any Goal needed a retry
 * anywhere in the conversation (issue #20 acceptance criteria: "the
 * suggestion is chosen by whether any state needed a retry" — a Goal is that
 * state, per issue #51's one-record-per-Goal grain). Every option comes from
 * AI Configuration's positive, beginner-friendly suggestion library. A clean,
 * all-first-try run receives a generic growth suggestion.
 *
 * Issue #15: the off-topic suggestion pool is deleted along with the
 * Verdict that fed it — off-topic attempts are `needs_retry`
 * (docs/ai-configuration.md section 4), which already feeds this same
 * "needed a retry" signal, so there is nothing separate to branch on.
 */
function selectSuggestionPool(turnRecords: StateTurnRecord[]): string[] {
  const neededRetrySomewhere = turnRecords.some((record) => !record.passedFirstTry);
  return neededRetrySomewhere ? NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES : GENERIC_GROWTH_SUGGESTION_TEMPLATES;
}

/**
 * Selects this run's 4-part Chinese-majority Learning Summary, in fixed order: 1
 * praise → 2-3 highlights → 1 suggestion → 1 closing.
 *
 * @param turnRecords The current practice run's accumulated per-Goal
 *   records (`usePractice().turnRecords`) — one entry per Conversation Goal
 *   that was ever achieved, in the order it was achieved.
 * @param random Injectable RNG, defaulting to `Math.random` — see this
 *   file's doc comment for why.
 */
export function selectFeedback(
  turnRecords: StateTurnRecord[],
  random: () => number = Math.random,
): FeedbackLine[] {
  const lines: FeedbackLine[] = [
    { id: "praise", kind: "praise", text: pickOne(PRAISE_TEMPLATES, random) },
  ];

  const highlightCount = pickOne(HIGHLIGHT_COUNT_OPTIONS, random);
  const highlightTexts = selectHighlightTexts(turnRecords, highlightCount, random);
  highlightTexts.forEach((text, index) => {
    lines.push({ id: `highlight-${index}`, kind: "highlight", text });
  });

  lines.push({
    id: "suggestion",
    kind: "suggestion",
    text: pickOne(selectSuggestionPool(turnRecords), random),
  });

  lines.push({ id: "closing", kind: "closing", text: pickOne(CLOSING_TEMPLATES, random) });

  return lines;
}
