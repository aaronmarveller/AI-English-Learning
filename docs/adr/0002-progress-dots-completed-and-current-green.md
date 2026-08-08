---
status: accepted
supersedes: course-progress.tsx round-5 UI draft correction (2026-08-07)
---

# Progress dots: completed and current steps both render green

An earlier UI draft round (round 5) corrected the progress dots so only the *current* step renders solid green, with completed steps rendered white with a thin border — the reasoning being that coloring every completed step green as well as the current one read as "every dot is green" once more than one step was done. The 2026-08-07 Notice page mockup reverses this: completed steps and the current step both render solid green, only upcoming steps stay white-bordered. We're taking the mockup as the new source of truth for this shared component (`course-progress.tsx`), which affects all 5 learning pages, not just Notice.
