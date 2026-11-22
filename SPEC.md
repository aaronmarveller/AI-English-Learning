# SPEC: Batch 3 — Explore typography, formula highlight, Explore More fade, audio waveform, Guided Practice (T-007, T-009, T-010, T-008, T-011)

## Goal

Finish the Explore typography and micro-interactions (formula-step highlight, Explore More fade, shared pronunciation waveform) and Guided Practice’s selection styling, and make the entire Playwright suite green — including the 9 pre-existing Explore failures — without changing product behavior the requirements keep as an exclusive section accordion.

## Decisions

- Work only in `/workspace/code/ai-english-learning` on local branch `batch-3-explore-practice` (created from local commit `b0c2f40` on `batch-2-home-observe`). Do not `git push`, do not deploy to Vercel, do not start a public tunnel. Never print or commit `.env.local` values.
- After code changes, stop the process on `:3000` and use a fresh `npm run build` + `npx next start -p 3000` (or Playwright’s webServer once the port is free). Playwright reuses an existing `:3000` when `CI` is unset.
- Implement in this order: **T-007 → T-009 → T-010 → T-008 → T-011**.

### Why the 9 Explore tests fail today (do not “add missing testids”)

The testids and copy already exist (`expression-card-greeting-hi`, `section-greeting-body`, `explore-more-greeting`, etc., and the #81 tables in `src/content/explore.ts`). The 9 failures all call `openAll()`, which clicks checkin, then response, then closing. Sections are an **exclusive accordion** (`ExplorePageContent` keeps a single `openSection`; `ChunkSection` unmounts a closed body). After `openAll()`, only Closing is open, so Greeting/Check-in/Response cards and Explore More toggles are not in the DOM.

Keep the exclusive accordion (the existing passing test “sections form an accordion: opening one closes the others” must still pass; T-007 says existing accordion e2e still passes). **Do not switch Explore sections to independent expand.**

**Follow that product rule in the tests, rather than weakening copy/testid assertions:**

- Replace `openAll()` with a helper that opens **one** named section (click its header if `data-state` is not `expanded`; wait until its body is visible). In any test that loops over all four sections’ **content**, open that section at the start of the iteration (this closes the previous one).
- Tests titled “with every section open” (lines 388 and 526) cannot have all four bodies visible at once under the accordion. Rewrite them to: for each section, open it (and open that section’s Explore More for the 526 test), assert the body / Explore More body is visible, and assert no horizontal overflow at 375px. Keep the no-overflow assertion; do not drop it. Record the title/helper change in a short comment.
- Also update the passing “no image carousel…” test (it uses `openAll()` but still passes because a missing body has 0 images — that makes the assertion weak). Open each section in turn so the assertion actually looks at each body.
- Do not weaken word-for-word copy, tint, or testid assertions. Do not invent new testids that already exist.

This is the documented contradiction: the accordion (keep) vs tests that assume all four section bodies are mounted at once (update the tests).

### T-007 Typography and spacing

- Section header titles (the “English · 中文” span in `chunk-section.tsx`, currently `text-[12px]`) must have computed `font-size` **14–15px** inclusive, for `section-greeting`, `section-checkin`, `section-response`, `section-closing`.
- English expression lines stay **16–18px** (current `text-h3` is 18px — keep in range). Chinese translations and pills stay clearly secondary (do not shrink them into unreadability).
- Reduce vertical padding/gaps on expression cards and expanded section bodies so the expanded list is more compact (`p-4` / `gap-3` / header `py-4` are the first knobs).
- Explore More toggle (`explore-more-*-toggle`): text **fully visible**, no `truncate` / `line-clamp` / overlap. Reduce vertical padding (and icon size only if needed) so the control’s bounding-box height is **as close to 44–48px as layout allows**. 44–48 is a target, not a hard fail. Record the measured height (Playwright bounding box) in the test output / a comment. Do not shrink text below a readable size.

### T-009 Formula step highlighting

- Mapping (already true in `EXPLORE_SECTIONS.response.main` / `CORE_EXPRESSIONS`):
  - `formula-step-1` (Respond) → `expression-card-response-good-thanks`
  - `formula-step-2` (Add More) → `expression-card-response-little-busy-today`
  - `formula-step-3` (Ask Back) → `expression-card-response-how-about-you`
- Steps become **clickable buttons**. Clicking a step highlights only the matching **main** Response card (not Explore More variants) with a **light-green background tint plus a 2px `#2fae60` / `border-accent` border**. Only one card at a time. Clicking the same step again clears the highlight. Clicking another step moves it. **Does not play audio** (no pronounce `data-state="playing"` as a result).
- Subtle 200–250ms transition on the highlight.
- Update `e2e/explore.spec.ts` “Response opens with the Conversation Formula…” which currently does `panel.locator("button, a").toHaveCount(0)`: allow the three step buttons; still no links; existing copy/order assertions still pass. Add tests for the highlight behavior above.

### T-010 Explore More fade

- Opening Explore More: the revealed cards / body fade in with **opacity**, duration **200–250ms**.
- Closing: fade out **150–200ms**. The body **stays mounted** during (and after) the close animation so computed `transition-delay`/`duration` can be read and the fade is visible. After close, the body is not visible to Playwright (`not.toBeVisible()` — zero height and/or `visibility: hidden` / `aria-hidden`, not merely `opacity: 0` with a laid-out box if that would break existing tests).
- Existing toggle behavior is unchanged (independent per section; state survives its parent section being collapsed).
- E2E: `explore-more-greeting-toggle` reveals `explore-more-greeting-body` containing `expression-card-greeting-hey` and `expression-card-greeting-good-to-see-you`. Assert `transition-property` includes `opacity`; open duration 200–250ms (allow 190–260ms); close duration 150–200ms (allow 140–210ms). Same fade on all four sections.

### T-008 Shared PronunciationButton waveform

- Keep the existing `speak()` path. While playing, replace the speaker emoji with **3–4 animated vertical bars**, `data-testid="waveform"`. When playback ends or fails, return to idle speaker; waveform gone.
- The **playing expression card** (Explore) gets a **1px light-green (`#2fae60`) border** — distinct from T-009’s 2px border + background tint. Default cards can use a 1px transparent/`border-border` border to avoid layout shift. Guided Practice rows reuse the same button (waveform + playing/idle) but T-008’s 1px card border is for Explore expression cards; Guided Practice selected style is T-011’s  and must stay visually distinct. Playing audio must not change Guided Practice selections (T-011).
- `data-state` goes `playing` → `idle` on end. Computed transition on the highlight/icon **200–250ms** (allow 190–260ms).
- Reuse the existing controllable `speechSynthesis` stub (`installControllableSpeechStub` in `e2e/explore.spec.ts`) and `__resolveSpeech`. Also cover `guided-pronounce-response-good-thanks` after a situation is selected.
- Only the playing control shows a waveform so `getByTestId("waveform")` is unambiguous while one line is playing.

### T-011 Guided Practice

- Situation cards already have green border + checkmark — keep. The card's own color/border transition is the situation switch: **~220ms, asserted 200–250ms** (`duration-[220ms]`).
- Expression rows: **remove the visible native `<input type="checkbox">`**. Selected rows use a green (`#2fae60`) border + checkmark, **150–200ms transition (`duration-[180ms]`, unchanged)**, matching the page 5 mocks. Unselected rows have the default border and no checkmark.
  - Keep the rows accessible (`role="checkbox"` + `aria-checked`, or equivalent). Existing `e2e/guided-practice.spec.ts` uses `getByRole("checkbox")` and `check()` / `setChecked()` / `toBeChecked()` / `toBeDisabled()`. Prefer implementing a proper ARIA checkbox so those tests stay valid. If Playwright cannot drive a non-native control that way, update the guided tests to click the row and assert `aria-checked` / a `data-selected` attribute, and record that change. Do not leave a visible native checkbox as the selected control.
- Your Response preview already uses `assembleResponse` (Respond → Add More → Ask Back). Keep that order; updates should feel smooth (a short 150–200ms opacity/content transition is enough, no new logic).
- Feedback (`guided-feedback`): fade in **200–250ms** when it appears after selections change. Keep existing feedback strings and rules.
- Situation switch: **200–250ms** transition; **selections are preserved** (already true). Feedback still follows existing neighbor/coffee copy for that selection.
- Clicking `guided-pronounce-response-good-thanks` (or any speaker) changes playing/idle + waveform (T-008) and does **not** change the selected set.
- Keep existing UI/content otherwise. Continue behavior unchanged.

## Acceptance criteria

1. **T-007 typography** — On `/explore?debug=1`, each section header title’s computed font-size is 14–15px. `[data-testid="expression-card-greeting-hi"]` “Hi!” is 16–18px. Explore More toggle text is fully visible; measured height is recorded and as close to 44–48px as possible.
2. **T-007 / Explore e2e** — All existing Explore tests pass after the `openAll` helper fix described above. Word-for-word copy, tints, and testids are unchanged in meaning.
3. **T-009** — Formula steps are buttons. Click 1/2/3 highlights only the mapped Response card with light-green tint + 2px accent border; click again clears; no audio. The old `button, a` count-0 assertion is updated. Remaining formula copy assertions pass.
4. **T-010** — Explore More open fade 200–250ms opacity; close fade 150–200ms; body stays mounted for the close animation; existing toggle behavior remains; computed transitions asserted (with the tolerances above).
5. **T-008** — Click `pronounce-greeting-hi` (with the speech stub): `data-state="playing"`, `waveform` visible (3–4 bars, not the speaker emoji), card has 1px light-green border. After `__resolveSpeech()`, idle, waveform gone, 1px playing border gone. Transition 200–250ms. Same waveform behavior on `guided-pronounce-response-good-thanks`.
6. **T-011** — Situation and expression selection use green border + checkmark (no visible native checkbox on expression rows). Preview stays in formula order. Feedback fades 200–250ms. Situation switch 200–250ms preserves selections. Playing audio does not change selections. Existing guided-practice e2e stays green (with any recorded ARIA/test updates).
7. **Full suite** — `npx playwright test` has **0 failures**.
8. **Build / HTTP** — `npm run build` exits 0. `GET /`, `GET /explore`, `GET /practice`, `GET /guided-practice` return 200.

## Exact end-to-end checks

```bash
# Baseline (already recorded before this batch):
# npx playwright test e2e/explore.spec.ts e2e/guided-practice.spec.ts
# → 19 passed, 9 failed (of 28). All 9 failures are the Explore tests listed in the tickets.

curl -sS -o /dev/null -w "GET / HTTP %{http_code}\n" http://127.0.0.1:3000/
curl -sS -o /dev/null -w "GET /explore HTTP %{http_code}\n" http://127.0.0.1:3000/explore
curl -sS -o /dev/null -w "GET /practice HTTP %{http_code}\n" http://127.0.0.1:3000/practice
curl -sS -o /dev/null -w "GET /guided-practice HTTP %{http_code}\n" http://127.0.0.1:3000/guided-practice

npx playwright test e2e/explore.spec.ts
npx playwright test e2e/guided-practice.spec.ts
npx playwright test
```

Expected after the fix: Explore all green, Guided Practice all green, full suite **0 failed**.

Screenshots at 390×844 under `/workspace/code/ai-english-learning/artifacts/batch-3/`:

- `explore-top.png` — Explore top (typography, Greeting open)
- `explore-formula-highlight.png` — Response section, a formula step selected and the matching card highlighted
- `explore-more-open.png` — Greeting Explore More open (Hey! / Good to see you!)
- `explore-waveform.png` — a card playing with the waveform (use the speech stub or pause mid-play)
- `guided-practice-selected.png` — Guided Practice with selected checkmarks and the response preview

## Out of scope

- T-001–T-006 (already shipped). T-012 (public tunnel) — do not start a tunnel.
- GitHub push, Vercel, printing `.env.local`.
- Changing Notice/Observe/Home except through the shared `PronunciationButton`.
- Making Explore sections independently expandable.
