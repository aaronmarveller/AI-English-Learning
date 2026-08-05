# CONTEXT

Domain glossary for AI-English-Learning. Use these terms as defined here in code, commits, issues, and docs — don't drift to synonyms.

## Turn

One round-trip in a Practice conversation: the learner's message, plus Emily's corrected reply to it. The learner and Emily advance the conversation one Turn at a time.

## Verdict

The judgment a Turn receives: `accepted`, `needs_retry`, or `off_topic`. Produced by the Judge — never decided on the client.

## Conversation State

Where the learner currently is in Practice's fixed 4-step flow: `greeting → checkin → response → closing → complete`. Only a Turn's `accepted` Verdict advances Conversation State to the next step; `needs_retry` and `off_topic` both hold the learner on the current one.

## Judge / Submit seam

A Turn crosses the client/server boundary through two symmetric deep modules:

- **Judge** — `judgeTurn()` in `src/lib/practice-judge.ts`. Server-only: calls the Anthropic API and produces the Verdict.
- **Submit** — `submitPracticeTurn()` in `src/lib/submit-practice-turn.ts`. Client-only: posts the learner's Turn to the server and reads back the result.

`src/lib/practice-turn-protocol.ts` is the zero-dependency vocabulary both sides import — the wire types and validators describing what a Turn/Verdict/stream event looks like. Neither side's own dependencies (the Anthropic SDK on the server, browser APIs on the client) may leak across this seam.
