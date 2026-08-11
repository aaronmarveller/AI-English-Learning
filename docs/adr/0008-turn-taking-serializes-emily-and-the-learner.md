---
status: accepted
---

# Turn-Taking serializes Emily and the learner — no barge-in, no re-speak

Emily's audio and the learner's microphone were free to overlap, and on real devices they collided both ways: her line played back into the mic that had just started listening, and a line she had not started yet was suppressed outright by `setMicListening` with nothing to bring it back. The candidate design kept the mic instantly tappable — the learner may interrupt at any moment — and made a suppressed line re-speak itself once the listening session ended, generalizing `speakAssertively`'s gesture-retry to every reply. We're serializing instead: the mic is unavailable while Emily is delivering a line, and Emily never begins one while the learner is speaking (`CONTEXT.md`'s Turn-Taking). Barge-in is the more forgiving design on paper, but it preserves the exact moment real devices handle worst — audio being cancelled in the same instant recognition starts — and it needs a second mechanism (a re-speak queue) to repair damage the first mechanism caused. Serialization removes the collision rather than compensating for it, and it matches how the conversation actually reads: you don't talk over the person you're practicing with. The cost is that a learner who already knows what to say waits out the rest of Emily's line; the 🔊 replay control remains their way back to a line, and nothing re-speaks on its own.

## Consequences

- `speech-synthesis.ts` must expose whether Emily is speaking as **subscribable state**, not just a `Promise` return — a promise that never settles (an `<audio>` paused by `cancelSpeech()` fires neither `ended` nor `error`) would leave the mic disabled forever. `cancelSpeech()` therefore clears that state explicitly, and playback carries a timeout so a stalled fetch cannot lock the learner out.
- Both microphone call sites are bound by this, not just Practice's: `ask-in-chinese-sheet.tsx` never called `setMicListening` at all, which was harmless only while help mode had no audio of its own.
- Serialization is extended, not revised, by [ADR 0010](./0010-push-to-talk-and-the-handoff-gap.md): Emily's side of the exchange ends a Handoff Gap later than her audio does. That ADR also had the learner take the floor by holding the microphone rather than tapping it; [ADR 0011](./0011-tap-to-talk-replaces-push-to-talk.md) reverts the gesture to a tap and leaves the Gap in place.
