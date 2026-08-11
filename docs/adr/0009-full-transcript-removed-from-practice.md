---
status: accepted
---

# The full-transcript drawer is removed from Practice

Practice shipped an expandable drawer holding every message of the conversation — spec.md user story 67 ("能展开查看完整对话记录") and its interaction note ("完整对话记录收在可展开的抽屉里，不占主视觉"). We're removing it, deliberately leaving that user story unmet. The drawer is the one surface on the page that rewards reading over speaking, and it pulls against a decision the rest of Practice has already made twice: a Turn is practiced in the moment, and the Learning Summary that follows carries no transcript at all — `StateTurnRecord` stores only derived signals (`passedFirstTry`, `matchedAcceptedResponse`, `learnerAskedBack`) because encouragement lands at the "you finished this step" grain, not as a line-by-line replay. A scrollback of everything the learner got wrong is the opposite of both. That the drawer had to be collapsed "so it doesn't take the main visual space" was already an admission it didn't belong on the page.

## Consequences

- spec.md's user story 67 and its interaction note are annotated as superseded by this ADR. Without that annotation the next person reading the spec adds the drawer straight back.
- The practice store still holds the full message list — only the surface that displayed it is gone. Nothing about the history sent to the Judge changes.
- `e2e/review.spec.ts` used the drawer as its proof that "重练" leaves a genuinely clean store. That assertion reads the persisted store directly instead.
