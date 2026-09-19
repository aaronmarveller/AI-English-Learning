---
status: superseded
superseded-by: 0013-response-goal-means-asking-emily-back.md
---

# Practice's "response" step accepts a single short phrase, not just the full 3-part combo

The `response` Conversation State originally required the learner's whole turn to combine all three parts of the response combo (acknowledgment + question back + one added detail) in a single reply — a standalone `"And you?"` was deliberately excluded from `acceptedResponses` (ticket 4) so the model wouldn't credit an incomplete turn.

Cross-referencing the team's external "AI Configuration" doc surfaced that its Step 3 (Response) Accepted Responses are short standalone continuations — `"Thank you."`, `"Thanks."`, `"How about you?"`, `"And you?"` — with no requirement to combine them. We're aligning `src/content/practice.ts`'s `response` state to that doc: a short single-phrase continuation now completes the step on its own, while the fuller 3-part combo (still listed as an example) remains equally acceptable but is no longer required.
