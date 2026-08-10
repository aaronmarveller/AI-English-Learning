---
status: accepted
supersedes: docs/adr/0002-progress-dots-completed-and-current-green.md
---

# Progress dots: only the current step is green, after all

ADR-0002 read the 2026-08-07 Notice mockup's 3-green-dot screenshot as "completed steps render green too" and changed `course-progress.tsx` accordingly. Live QA against a real multi-step walkthrough (not a fresh `?debug=1` load with an empty completed list) showed that reading was wrong: with real progress accumulated across several steps, coloring every completed dot green produced far more green dots than the mockup ever intended, and direct user feedback (2026-08-07) confirmed only the current step should be green. This reverts to round 5's original rule: current step solid green, every other step (completed or upcoming) white with a thin border.
