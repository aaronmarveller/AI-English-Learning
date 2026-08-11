---
status: superseded in part by ADR-0011
---

# The learner holds the microphone to speak, and waits out a Handoff Gap first

> Push-to-Talk is reverted by [ADR 0011](./0011-tap-to-talk-replaces-push-to-talk.md) — a long press on a mobile web page is the platform's own text-selection gesture, so the learner taps to start and taps again to send. Everything below about the Handoff Gap still holds; everything below about holding the button is kept as the record of a decision that was tried.

Practice's microphone was a toggle: tap to start listening, tap again to stop, with the Turn submitted whenever the recognizer happened to produce a final result. Two changes replace that, both inside the serialized model [ADR 0008](./0008-turn-taking-serializes-emily-and-the-learner.md) established rather than a revision of it. The learner now holds the button down and releases to send (`CONTEXT.md`'s Push-to-Talk) — the gesture WeChat has already taught every Chinese-speaking user. And the microphone stays unavailable for a Handoff Gap after Emily's audio *finishes*, not merely while it plays.

The Handoff Gap exists because iOS Safari cannot hand its audio session back from playback to capture instantly: recognition started the moment Emily's line ends hears nothing and fails with `no-speech`. The alternative was to show the learner a hint and leave the button live. We're enforcing the wait instead, because a hint that gets ignored produces exactly the failure it warned about — and the learner reads that failure as "my English wasn't understood", not "I was too fast". Defining it as part of Turn-Taking rather than as an iOS workaround is deliberate: waiting for the other person's voice to settle is what conversation does anyway, so the gap should outlive the bug that prompted it rather than being deleted as a stale patch once iOS is fixed.

Push-to-Talk carries its own trade-offs, each resolved toward *the learner always knows whether they are being heard*:

- **A hold is one submission.** The recognizer ends itself on its first final result even mid-hold, so the hold session restarts it and accumulates; releasing submits the accumulated finals plus any trailing interim. Releasing must never produce silence.
- **Releasing outside the button cancels.** A mis-press reaching the Judge costs a `needs_retry`, which silently flips that Conversation State's `passedFirstTry` and removes a Highlight from the Learning Summary — a penalty the learner is never shown an explanation for.
- **A press under 300ms is not a hold** and never reaches the recognizer, so a stray tap cannot spend one of the three `no-speech` strikes that auto-disable voice input entirely.
- **Any recognition error ends the hold at once, and the button returns to its unpressed state right then** — even with the finger still down. Holding a dead microphone while believing you are heard is the one failure this gesture must not have. Text already recognized before the error is still submitted on release; Emily asking the learner to repeat half a sentence beats discarding it silently.
- **Keyboard is a first-class hold** (`keydown`/`keyup`). The text fallback is not an acceptable substitute when speaking aloud is the entire product.

## Consequences

- The gap is keyed on audio having actually played, not on Emily having a new line. Where playback was blocked or unavailable there is no audio session to recover, and charging every platform for an iOS constraint would bite hardest exactly where the learner never heard Emily at all.
- The speaking state exposed to microphone surfaces becomes three-valued — speaking / handoff gap / free — not a boolean: the two blocked states owe the learner different explanations.
- Both microphone surfaces are bound by this, Practice's and `ask-in-chinese-sheet.tsx`'s, and the gap covers that sheet's Chinese audio too: same `<audio>` singleton, same audio session, same bug. ADR 0008 already learned this lesson once.
- Restarting the recognizer mid-hold drops whatever is said during the restart. That is unavoidable behind the Web Speech API; the planned cloud realtime ASR removes it, and the restart lives inside `speech-recognition.ts`, so nothing outside that seam changes when it does.
- A hold is capped at 60 seconds and submits what was heard. A microphone held open by a stuck finger in a noisy room would otherwise loop indefinitely with nothing on screen saying so.
