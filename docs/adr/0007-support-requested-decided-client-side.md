---
status: accepted
---

# `support_requested` is decided on the client, not by the Judge

A learner who addresses Emily in Chinese needs a different response path than a learner attempting the English Turn — one that offers help rather than a Verdict. The candidate design routed every submission through the Judge and let the model classify it, keeping Conversation State detection in one place. We're deciding this on the client instead: the client runs a CJK character detector — a trivial, reliable, pure function — on the learner's input *before* calling the Judge at all. Chinese input resolves straight to the `support_requested` Turn Outcome and never reaches the model or the Conversation State Machine; everything else goes to the Judge and comes back `accepted` or `needs_retry`. Detecting Chinese script is deterministic and free: it costs no latency, no API call, and cannot be gotten wrong the way a model classification could. Routing it through the Judge would also have added a third value to the model's output contract for a decision that a few lines of client code already make perfectly. This keeps the Judge's contract narrowly about the Verdict (`docs/ai-configuration.md` section 4) and keeps `support_requested` — along with the CJK detector that decides it — entirely client-side and unit-testable.
