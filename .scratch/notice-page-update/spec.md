# Notice page update — issue drafts

Three issues: one parent, two children. Children are independent and can land in either order.

```
#P Parent: Notice moves to step 2 and matches the final design
 ├─ #A Learning Flow becomes Observe → Notice → Explore, with Back to Previous Step
 └─ #B Notice shows "Discover What Greetings Mean." and three Notice Cards
```

Labels: all three `ready-for-agent`.

---

## #P — Notice moves to step 2 and matches the final design

### Problem Statement

The Notice page still shows the retired US-vs-China cultural comparison (three Cultural Insight Cards with flags, a hero street illustration, and the headline "Discover how greetings differ across cultures."). It also sits third in the Learning Flow, after Explore, and its header offers only "← Back to Home". The approved final design puts Notice right after Observe. It reframes the page around what an everyday greeting actually means, and gives later pages a "Back to Previous Step" link.

This reverses #73's decision to treat "Continue → Notice" from Observe as outdated.

### Solution

- Reorder the Learning Flow to **Observe → Notice → Explore → Practice → Review**. There are still 5 progress dots, with Notice now the second.
- Notice, Explore, Practice and Review show **"← Back to Previous Step"**, linking to the step before them. Observe keeps "← Back to Home".
- Rebuild Notice with the headline "Discover What Greetings Mean.", the subtitle "点击卡片，发现对话背后的含义。", and three **Notice Cards** (see CONTEXT.md). All cards start collapsed and open and close independently. Continue reads "Continue 继续学习 →" and goes to Explore.

### Child Issues

| # | Title | Depends on |
|---|-------|------------|
| A | Learning Flow becomes Observe → Notice → Explore, with Back to Previous Step | — |
| B | Notice shows "Discover What Greetings Mean." and three Notice Cards | — |

A and B touch different files, except that B also sets Notice's Continue target. A owns the step order and B owns Notice's own button, so both PRs agree on `/explore`.

### Definition of Done

1. Walking Home → Observe → Continue lands on `/notice`, where dot 2 is the current dot.
2. On Notice, Continue lands on `/explore`. On Explore, Continue lands on `/practice`.
3. Notice matches the four approved designs (default view, and each card expanded in turn), with copy taken word for word from the Notice Content attachment (reproduced in #B).
4. All e2e and unit tests pass.

---

## #A — Learning Flow becomes Observe → Notice → Explore, with Back to Previous Step

Part of #P.

### Problem Statement

The step order is hard-coded as `observe → explore → notice → practice → review` (`src/lib/progress.ts:25`). The approved design has Notice second. Every learning page's header also offers only "← Back to Home" (`src/app/(learning)/layout.tsx`, `data-testid="back-home"`), so a learner who wants to revisit the step they just finished has to go back through Home.

### Solution

- `STEP_IDS` becomes `["observe", "notice", "explore", "practice", "review"]`. The unlock chain and the dot order follow from it automatically. There are still 5 dots, and only the current dot is green. Completed steps get no checkmark; the existing dot styling stays unchanged.
- Observe's Continue changes from `/explore` to `/notice`. Explore's Continue changes from `/notice` to `/practice`, keeping its label "继续 Continue". Notice's Continue target is set in #B.
- In the shared learning layout, the left-hand header slot becomes:
  - on `/observe`: unchanged, "← Back to Home" → `/`, `data-testid="back-home"`
  - on `/notice`, `/explore`, `/practice`, `/review`: **"← Back to Previous Step"** → the route of the previous entry in `STEP_IDS`, `data-testid="back-previous"`, `aria-label="返回上一步"`
- Back to Previous Step is a plain link. It marks nothing complete, clears nothing, and asks for no confirmation. Leaving Practice mid-Call this way behaves exactly as leaving via Back to Home does today.
- **No migration of stored progress.** A learner whose localStorage says Explore is complete but Notice is not will be redirected to Home from `/explore` until they complete Notice. Only demo data is affected.
- Update the comments and docs that state the old order: `src/lib/progress.ts`, `src/components/course-progress.tsx`, `src/app/(learning)/layout.tsx`, and `.scratch/greeting-somebody-mvp/spec.md` (lines 25, 28 and 250).

### User Stories

1. As a learner, I want Notice to come right after Observe, so that I think about what greetings mean before I learn the expressions.
2. As a learner on Notice, Explore, Practice or Review, I want "← Back to Previous Step", so that I can revisit the step I just finished.
3. As a learner on Observe, I want "← Back to Home" to stay, so that I can still leave the lesson from its first step.
4. As a learner, I want going back not to undo any progress, so that I can return forward without redoing anything.

### Testing Decisions

The seam is e2e via Playwright. Nothing new is unit-tested; `progress.ts` is covered through navigation-spine.

- `e2e/navigation-spine.spec.ts`: its walk-the-flow and redirect cases iterate `STEP_ROUTES`/`STEP_IDS`, so they pick up the new order. Check that any hard-coded `explore` assumptions (around line 128) still hold under the new unlock chain, and adjust them if not.
- `e2e/observe.spec.ts:62-76`: Continue now lands on `/notice`.
- `e2e/explore.spec.ts:206-214`: Continue now lands on `/practice`.
- New cases in navigation-spine:
  - Each of notice, explore, practice and review shows `back-previous` linking to the previous step's route.
  - Observe shows `back-home` and not `back-previous`.
  - Clicking `back-previous` on Explore lands on `/notice` and leaves the progress dots unchanged.

### Out of Scope

- Notice page content (#B).
- A sixth stage or a sixth dot.
- Checkmarks on completed dots.

---

## #B — Notice shows "Discover What Greetings Mean." and three Notice Cards

Part of #P.

### Problem Statement

Notice renders three Cultural Insight Cards comparing the US and China, using flags, emoji previews and a "为什么？" column. These come from `src/content/notice.ts`, `src/components/notice/cultural-comparison-body.tsx` and `src/components/notice/notice-card.tsx`. The page also has a hero street illustration and uses a single-open accordion: opening one card closes the others. The final design replaces all of this with three Notice Cards about what a greeting means. Those cards start collapsed and open independently.

### Solution

**Top of page** (`src/components/notice/notice-page-content.tsx`)
- `StageTag` reads "Notice" with icon `💡`, still `asHeading`.
- `CourseProgressChip` is unchanged.
- The headline is **"Discover What Greetings Mean."** in `text-display`, matching Observe's headline scale.
- The subtitle is **"点击卡片，发现对话背后的含义。"** in `text-body text-muted`.
- The hero image and the two-column header row are removed. The page is one stacked column.

**Notice Card shell** (reuse `NoticeCard`, reshaped)
- Number badge: a filled soft-green circle with a green digit, as in the design.
- The header text is the card's question.
- The chevron is a green ⌄ when collapsed and ⌃ when expanded.
- **Collapsed:** the header shows two circular photos (left and right) separated by a muted "VS" and a thin vertical rule. Each photo has a small round icon badge at its top-right corner, green-tinted on the left photo and red-tinted on the right.
- **Expanded:** the photos are hidden and the body shows two side-by-side panels separated by "VS". The left panel is soft green with a green title; the right panel is soft pink with a dark-red title. Below them is a full-width soft-green tip bar with a lightbulb icon.
- Keep the testid and ARIA shape: `{id}`, `data-state`, `{id}-header` (with `aria-expanded` and `aria-controls`), and `{id}-body`.

**Accordion behaviour:** each card has its own open state, all three start collapsed, and any number can be open at once. Nothing gates Continue.

**Continue:** "Continue 继续学习 →" → `/explore`, `markStepComplete="notice"`.

**Content** (`src/content/notice.ts`, rewritten; copy is word for word from the Notice Content attachment)

| id | Question | Left panel | Right panel | Tip |
|---|---|---|---|---|
| `greeting-intention` | “How are you?” 真的是在问近况吗？ | Friendly Greeting · 礼貌寒暄 — 表达友好，不一定期待详细回答。 | Genuine Check-in · 真正关心 — 想了解你的近况，可以多分享一些。 | 就像中文的“吃了吗？”，有时只是打个招呼，有时是真的关心你。 |
| `conversation-length` | 为什么有的对话短，有的会多聊？ | Quick Greeting · 简短问候 — 简单回应，然后继续当前的事。 Scenes: 咖啡店 / 餐厅 / 商店 | Small Talk · 日常寒暄 — 可以分享近况，再多聊几句。 Scenes: 同事 / 邻居 / 朋友 | 这只是常见例子。聊多久，还要看彼此的关系、当下的情况和对方的反应。 |
| `conversation-cues` | 怎么判断继续聊还是结束？ | Keep Talking · 可能想继续聊 — cues: 对方继续提问 / 主动分享近况 / 愿意停下来聊 | Move On · 可能准备结束 — cues: 准备离开 / 忙于其他事 / 表示要结束 | 看看对方的反应，不是每次都需要多聊。 |

Panel layout per card, following the design:
- Card 1: a large icon (waving hand / heart), then the English title, the Chinese title, a hairline divider, and the description.
- Card 2: the English title, the Chinese title, the description, then three scene tiles in a row (icon above label).
- Card 3: the English title, the Chinese title, a hairline divider, then three cue rows (a round tinted icon followed by the label).

Proposed content type:

```ts
type NoticeSide = {
  titleEn: string;
  titleZh: string;
  description?: string;
  icon: NoticeIconName;            // big icon (card 1) and collapsed photo badge
  photo: { src: string; alt: string };
  items?: { icon: NoticeIconName; label: string }[]; // card 2 scenes / card 3 cues
};
export type NoticeCard = {
  id: "greeting-intention" | "conversation-length" | "conversation-cues";
  question: string;
  left: NoticeSide;
  right: NoticeSide;
  tip: string;
};
export const NOTICE_HEADLINE = { en: "Discover What Greetings Mean.", zh: "点击卡片，发现对话背后的含义。" };
export const NOTICE_CARDS: NoticeCard[];
```

**Photos.** These are placeholders; the real files drop in later with no code change.

| Card | Left | Right |
|---|---|---|
| 1 | `/assets/notice/greeting-intention-friendly.webp` | `/assets/notice/greeting-intention-genuine.webp` |
| 2 | `/assets/notice/conversation-length-quick.webp` | `/assets/notice/conversation-length-small-talk.webp` |
| 3 | `/assets/notice/conversation-cues-keep-talking.webp` | `/assets/notice/conversation-cues-move-on.webp` |

Photos render as `object-cover` circles over a neutral `bg-page` fill, so a missing file shows an empty circle rather than a broken layout.

**Photo badge icons:**
- Card 1: wave and heart.
- Card 2: coffee cup and people.
- Card 3: chat bubble and wave.

**Icons.** Add these to `src/components/icons.tsx` as `currentColor` line icons, following that file's existing style and no-emoji rule: wave, heart, coffee, fork-knife, shopping-bag, briefcase, house, users, chat-bubble, user, exit, x, lightbulb, chevron-down. `ClockIcon` already exists and is reused. Green icons sit on the left side and red icons on the right.

**Delete:**
- `src/components/notice/cultural-comparison-body.tsx`
- `src/components/notice/flag-icon.tsx`
- `src/content/notice.test.ts` (it tests the removed emoji previews)
- `public/assets/notice/` files: `hero-street-greeting.jpg`, `flag-china.png`, `who-greets-us.jpg`, `who-greets-china.jpg`, `keep-chatting-us.webp`, `keep-chatting-china.webp`, `small-talk-topics-us.webp`, `small-talk-topics-china.webp`

**Keep:** `public/assets/notice/flag-us.png`, which `src/components/practice/emily-info-card.tsx` still uses.

### User Stories

1. As a learner, I want the headline "Discover What Greetings Mean.", so that I know this page is about meaning, not phrases.
2. As a learner, I want all three cards collapsed at first, with two photos each, so that I can scan the three questions before choosing one.
3. As a learner, I want to open any card and keep it open while I open another, so that I can compare them.
4. As a learner, I want each card to contrast two readings side by side with a tip below, so that I see the difference at a glance.
5. As a learner, I want to continue without opening any card, so that reading stays optional.
6. As a screen-reader user, I want each card header to be a button that announces its expanded state, so that I can operate the cards without seeing them.
7. As a content editor, I want all Notice copy, photos and icons named in `src/content/notice.ts`, so that I can change them without touching components.

### Testing Decisions

`e2e/notice.spec.ts` is rewritten. It uses `/notice?debug=1` and asserts only what a learner can see or do.

- Default state: all three cards are `data-state="collapsed"` and no `{id}-body` is visible. The headline and subtitle are visible, and no hero image is present.
- Independence: open `greeting-intention`, then open `conversation-length`, and both are expanded. Click `greeting-intention-header` again, and only it collapses; `conversation-length` stays expanded.
- Content: expanding each card shows both panel titles, all scene or cue labels, and the tip, word for word from the table above.
- Continue: with nothing opened, clicking Continue lands on `/explore`.
- Mobile: at 375 px width with every card open, `scrollWidth <= clientWidth`.

There are no unit tests, because the page is presentational.

### Out of Scope

- Step order and the back link (#A).
- Sourcing the six real photos.
- Changes to the progress-dot styling.
