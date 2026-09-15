---
status: accepted
---

# Flexible goal tracking replaces the linear Conversation State machine

Practice judged the learner against one Conversation State at a time: the Judge was told the current step, returned one Verdict, and an `accepted` Verdict moved a pointer one step along `greeting → checkin → response → closing → complete` (`src/lib/conversation-state-machine.ts`). A learner who said "Hi Emily! I'm good, thanks. How are you?" as their first line was credited only with `greeting`, then asked "How are you doing today?" — a question they had just answered. We're replacing the pointer with **Goal Progress**: the four steps become four Conversation Goals the learner must achieve in any order and any number per Turn; the Judge is given the set of achieved Goals and returns a **Goal Report** on the open ones (`achieved` / `failed` / `untouched` each); the client derives the Verdict, adds every `achieved` Goal to Goal Progress, and reads the **Focus Goal** — the first open Goal in canonical order — off Goal Progress wherever the old code read "the current state". The Verdict stays a two-value term, but it is no longer the model's output: `accepted` means "at least one Goal achieved and none failed".

## Considered options

- **Earlier Goals count as achieved "in passing" when a later one is.** A learner who answers the check-in without greeting would have `greeting` credited too, so Goal Progress could never be non-contiguous. Rejected: it fabricates a Learning Summary highlight ("you greeted naturally") for something the learner never said, and it makes "Bye!" and "Hi! Bye!" behave differently for no reason the learner could see. Earlier Goals may be left open, and Emily steers back to them.
- **Judge returns a Verdict plus a Goal list.** Rejected: two fields that can contradict each other, and a validation step to reconcile them. The Verdict is derived on the client from one report.
- **Partial credit — save the Goals that were right, retry the one that was wrong.** This is what the flexible-tracking brief's "save completed goals" line literally says, and we're deliberately departing from it: a Turn whose Goal Report has any `failed` Goal is `needs_retry` and *nothing* from it is saved, even the parts that were right. A learner should never have to work out which half of their sentence counted; "say the whole thing again" is a clearer lesson than a silently half-credited turn.
- **Author new composite lines for multi-Goal Turns** ("I'm good too, thanks for asking! Anyway, I should get going — see you!"). Rejected for now: every combination of achieved Goals would need its own line and audio. Emily instead speaks a *sequence* of existing pool lines — a reaction if `checkin` was just achieved, then a steer toward the new Focus Goal — which keeps ADR-0005's pre-generated-audio guarantee with zero new recordings. `greeting` and `response` have no steer pool, so their `needs_retry` lines double as the steer; if that reads as criticism in practice, the fix is a dedicated steer pool, not a change to the rule.

## Consequences

- The wire protocol (`src/lib/practice-turn-protocol.ts`) carries Goal Progress up and a Goal Report down; the "Never skip a Conversation Step" system-prompt constraint and the per-state `learningGoal` wording that assumed Emily had just prompted for the step are rewritten so a Goal can be achieved before it is asked for.
- `StateTurnRecord` bookkeeping keeps its meaning but changes its grain: an attempt counts against the Focus Goal only, so a Goal achieved early is always `passedFirstTry`; `matchedAcceptedResponse` stays whole-sentence exact match, so a multi-Goal sentence matches none of them.
- The practice store persists `goalProgress` instead of `conversationState`; snapshots without it are discarded on load (the same "in-flight sessions reset" precedent as issue #20).
- The progress steps render from the set, not an index — completed Goals can have gaps, and the connector rule (filled when the left neighbour is completed or current) is unchanged.
- Practice completing on a Turn in which `closing` was *not* the Goal achieved gets a Closing line before the Completion line, so Emily always says goodbye.
- Persisting Goal Progress instead of an index is the piece that is hard to reverse: Learning Summary derivation, the eval table, and the e2e stubs all move to the set-shaped contract.
