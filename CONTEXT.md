# CONTEXT

Domain glossary for AI-English-Learning. Use these terms as defined here in code, commits, issues, and docs — don't drift to synonyms.

## Turn

One round-trip in a Practice conversation: the learner's message, plus Emily's corrected reply to it. The learner and Emily advance the conversation one Turn at a time.

## Verdict

The judgment a Turn receives: `accepted` or `needs_retry`. Produced by the Judge — never decided on the client. A learner who wanders off the Lesson's topic receives `needs_retry`; off-topic is not a Verdict of its own.

## Turn Outcome

What a learner's submission resolves to overall: `support_requested`, `accepted`, or `needs_retry`. The latter two are Verdicts, decided by the Judge. `support_requested` is decided on the client *before* the Judge is involved — the learner addressed Emily in Chinese — so it is an outcome that never becomes a Verdict.
_Avoid_: Validation Result

## Conversation Script

A Lesson's verbatim library of Emily's lines: for each Conversation State, the pool of English sentences Emily may say on entering it. Emily selects from this library and never improvises, which is what makes every line she speaks pre-generatable as audio.
_Avoid_: reference conversation — the Script is not a stylistic example the Judge paraphrases

## Lesson

One self-contained scenario the learner practices end to end, owning its Conversation Script, its Accepted Responses, and its Chinese help content. Today there is exactly one: `Greeting Somebody`.

## Conversation State

Where the learner currently is in Practice's fixed 4-step flow: `greeting → checkin → response → closing → complete`. Only a Turn's `accepted` Verdict advances Conversation State to the next step; `needs_retry` holds the learner on the current one, and a `support_requested` Turn Outcome never reaches the state machine at all.

## Learning Summary

The learner-facing recap shown after Practice. It presents one Praise, two or three performance-based Highlights, one Suggestion, and one Closing in that order.
_Avoid_: Review in learner-facing copy

## Review

The internal name of the post-Practice learning-flow stage that presents the Learning Summary and offers retry or continue actions.
_Avoid_: Learning Summary when naming the internal flow stage

## Judge / Submit seam

A Turn crosses the client/server boundary through two symmetric deep modules:

- **Judge** — `judgeTurn()` in `src/lib/practice-judge.ts`. Server-only: calls the Anthropic API and produces the Verdict.
- **Submit** — `submitPracticeTurn()` in `src/lib/submit-practice-turn.ts`. Client-only: posts the learner's Turn to the server and reads back the result.

`src/lib/practice-turn-protocol.ts` is the zero-dependency vocabulary both sides import — the wire types and validators describing what a Turn/Verdict/stream event looks like. Neither side's own dependencies (the Anthropic SDK on the server, browser APIs on the client) may leak across this seam.
