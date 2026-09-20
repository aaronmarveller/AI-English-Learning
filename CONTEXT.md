# CONTEXT

Domain glossary for AI-English-Learning. Use these terms as defined here in code, commits, issues, and docs — don't drift to synonyms.

## Turn

One round-trip in a Practice conversation: the learner's message, plus Emily's corrected reply to it. The learner and Emily advance the conversation one Turn at a time.

## Verdict

The judgment a Turn receives: `accepted` when the Goal Report has at least one `achieved` Goal and no `failed` one; `needs_retry` otherwise. All-or-nothing — a Turn that gets one Goal right and another wrong is `needs_retry`, and none of it counts. Derived on the client from the Goal Report — the Judge never names a Verdict itself. A learner who wanders off the Lesson's topic receives `needs_retry`; off-topic is not a Verdict of its own.

## Turn Outcome

What a learner's submission resolves to overall: `support_requested`, `accepted`, or `needs_retry`. The latter two are Verdicts, derived from the Judge's Goal Report. `support_requested` is decided on the client *before* the Judge is involved — the learner addressed Emily in Chinese — so it is an outcome that never becomes a Verdict.
_Avoid_: Validation Result

## Recovery

Emily's reply to a `needs_retry` Turn, in one of two tiers. Tier 1 is a nudge followed by the Goal's question: the shared "Sorry, I didn't quite get that." when an open Goal's Goal Report is `failed`, or the Goal's own off-topic nudge when every open Goal is `untouched`. Tier 2 — from the learner's second consecutive `needs_retry` Turn on the current Focus Goal — is a single direct example. The tier is chosen by the Retry Streak, and which Goal's Recovery is spoken follows the `needs_retry` rule: the first Goal in canonical order the Goal Report marked `failed`, or the Focus Goal when nothing was `failed`. A Recovery never changes Goal Progress and never moves the Focus Goal; only its second tier may reveal an Accepted Response.
_Avoid_: retry line, `needs_retry` line — a Recovery is a sequence, and the pool once called `needsRetryLines` is now `steerLines`

## Retry Streak

How many `needs_retry` Turns in a row the current Focus Goal has had: the first one hears the Recovery's tier 1, and the second and later ones hear tier 2. It resets on any `accepted` Turn — including one that leaves the Focus Goal open — and starts over when the Focus Goal changes; a `support_requested` Turn never touches it. Deliberately not the per-Goal `retryCounts`, which counts every `needs_retry` Turn ever judged against a Goal and never resets.
_Avoid_: retry count — that is `retryCounts`, the per-Goal bookkeeping the Learning Summary reads, and it must not reset

## Conversation Script

A Lesson's verbatim library of Emily's lines: for each Conversation Goal, the pool of English sentences Emily may say to react to it being achieved or to steer toward it. Emily selects from this library and never improvises — a Turn that achieves several Goals at once is answered by several library lines in sequence, never by a composed one — which is what makes every line she speaks pre-generatable as audio.
_Avoid_: reference conversation — the Script is not a stylistic example the Judge paraphrases

## Lesson

One self-contained scenario the learner practices end to end, owning its Conversation Script, its Accepted Responses, and its Chinese help content. Today there is exactly one: `Greeting Somebody`.

## Conversation Goal

One of the four things a learner must communicate to complete a Lesson's Practice: `greeting`, `checkin`, `response`, `closing`. Goals have a canonical order but are not gates — a single Turn may achieve several, and a later Goal may be achieved before an earlier one. Each Goal is defined by the intent it asks the learner to communicate, not by particular wording: `response` means asking Emily a question back about herself, so a bare thank-you leaves `response` untouched — thanking Emily is politeness riding on the `checkin` answer, not a Goal of its own.
_Avoid_: step, Conversation Step — a step implies one-at-a-time in sequence, which Goals are not

## Goal Report

What the Judge returns for a Turn: for each still-open Conversation Goal, whether the learner's message `achieved` it, `failed` it (recognisably attempted its intent without communicating it), or left it `untouched`. The Judge is only ever asked about open Goals, so a Goal Report never re-credits one already achieved. Unrelated chatter is `untouched`, never `failed`; grammar alone never makes an attempt `failed`.

## Goal Progress

The set of Conversation Goals achieved so far in this Practice. Grows only through `accepted` Turns — every Goal that Turn's Goal Report marked `achieved` joins at once — and never shrinks: an achieved Goal is never asked for again. All four achieved means the Practice is complete.

## Focus Goal

The first open Conversation Goal in canonical order — the one Emily's next line steers toward, and the one a Recovery and the Chinese help content are written for. A `support_requested` Turn Outcome never changes it.

## Conversation State

Where the learner is in Practice, derived from Goal Progress: the Focus Goal, or `complete` once all four Goals are achieved. Not a value that advances on its own — it is read off Goal Progress after every Turn.
_Avoid_: treating it as a step counter — Goal Progress can be non-contiguous, so "the state" is not "how many steps are done"

## Learning Summary

The learner-facing recap shown after Practice. It presents one Praise, two or three performance-based Highlights, one Suggestion, and one Closing in that order. Addressed to the learner in Chinese, with English surviving only as the short expressions the Lesson taught — the opposite of the Conversation Script, which is English precisely because speaking it *is* the practice.
_Avoid_: Review in learner-facing copy

## Review

The internal name of the post-Practice learning-flow stage that presents the Learning Summary and offers retry or continue actions.
_Avoid_: Learning Summary when naming the internal flow stage

## Turn-Taking

Who holds the floor: Emily and the learner never hold it at the same time. The learner cannot begin speaking while Emily is still delivering a line, nor during the Handoff Gap that follows it, and Emily never begins a line while the learner is speaking. A product rule, not a device workaround — it is what keeps a Turn a clean exchange instead of two voices competing for one microphone.
_Avoid_: barge-in — interrupting Emily mid-line is deliberately not offered

## Handoff Gap

The short beat after Emily's line ends in which the floor belongs to neither side: she has finished, and the learner may not start yet. Part of Turn-Taking rather than a delay bolted onto it — waiting for the other person's voice to settle before answering is what a real conversation does.

## Silence Reminder

What Emily speaks after 15–20 s of the learner's silence — measured from the end of her line, once the Handoff Gap has ended — as the silence-nudge pool's line followed by the Goal question the Recovery's first tier asks. It never changes Goal Progress, never records a Turn, never reveals an Accepted Response, and never repeats the same nudge twice in a row; it is not a `needs_retry` Turn and does not advance the Retry Streak, because silence is not a failed attempt.
_Avoid_: Silence nudge — that names the three-line pool, which is now only the reminder's first half

## Tap-to-Talk

How the learner takes the floor: they tap the microphone to open it and tap again to send. Everything recognized between the two taps becomes a single Turn's message, and stopping always sends.
_Avoid_: Push-to-Talk, hold-to-talk — holding the button was tried and reverted; recording — a tap produces a message, never a stored artifact

## Judge / Submit seam

A Turn crosses the client/server boundary through two symmetric deep modules:

- **Judge** — `judgeTurn()` in `src/lib/practice-judge.ts`. Server-only: calls the Anthropic API and produces the Verdict.
- **Submit** — `submitPracticeTurn()` in `src/lib/submit-practice-turn.ts`. Client-only: posts the learner's Turn to the server and reads back the result.

`src/lib/practice-turn-protocol.ts` is the zero-dependency vocabulary both sides import — the wire types and validators describing what a Turn/Verdict/stream event looks like. Neither side's own dependencies (the Anthropic SDK on the server, browser APIs on the client) may leak across this seam.
