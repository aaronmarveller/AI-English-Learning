# SPEC: Batch 2 — Home images + Observe videos and custom controls (T-001, T-002, T-003)

## Goal

Put the requirements-doc Home photos in place (after moving the shared Observe poster off the mission thumbnail), ship both Observe scene videos with script-accurate bilingual captions on a custom overlay, and replace the native video menu with the custom mobile controls from the page 2 mock — then make `e2e/home.spec.ts` fully green without inventing Home UI the doc does not show.

## Decisions

- Work only in `/workspace/code/ai-english-learning` on local branch `batch-2-home-observe` (created from local commit `fa296d1` on `batch-1-notice`). Do not `git push`, do not deploy to Vercel, do not start a public tunnel. Never print or commit `.env.local` values.
- A production server may already be on `:3000` (batch 1). Playwright reuses that server when `CI` is unset. After code or asset changes, stop whatever is on `:3000` and run a fresh `npm run build` + `npx next start -p 3000` (or let Playwright’s webServer do that once the port is free) before trusting e2e.

### T-001 Home images

- **Prerequisite (do this first):** the neighbor Observe poster currently reuses `/assets/home/mission-thumb.jpg`. Copy that existing file to its own path, `public/assets/observe/neighbor-poster.jpg`, and point `src/content/observe.ts` at `/assets/observe/neighbor-poster.jpg` *before* replacing the Home thumbnail. Observe must never briefly (or finally) inherit the new couple+“Hi!” mission thumb.
- Then replace files by **byte-for-byte copy** (so sha256 matches the doc originals; do not recompress):
  - `public/assets/home/mission-thumb.jpg` ← `/workspace/docs-source/assets/docx-images/image2.jpeg` (couple in front of a house with a “Hi!” bubble). Expected sha256: `bdf683fbe99d8ccf9f91d2740520e42d4a44c05b948d03efec101398c4c897ff`
  - `public/assets/home/hero.jpg` ← `/workspace/docs-source/assets/docx-images/image3.jpg` (wooden table, books, coffee cup, plants). Expected sha256: `927ee632a6890f658f94ad3c1bc661209dadd474d87caf6ffc4cba662578a479`
- Keep the public path names (`.jpg` is fine; the bytes come from `.jpeg`/`.jpg`). Layout, copy, and behavior of Home are otherwise unchanged.
- **Home e2e must end fully green.** Two pre-existing failures conflict with the requirements doc’s Home screenshot (`docx-images/image1.png`) and with the current product UI. **Follow the doc; update the tests; do not add UI the doc does not show.** Record the change in the test comments:
  1. `e2e/home.spec.ts:139` (`drops the Chinese subtitle, category and globe`) expects 👋 to be visible on `[data-testid="mission-card"]`. The doc Home screenshot has no 👋 on the mission card (photo + “Greeting Someone” + objectives + 开始学习 only), and the current card has no 👋 either. Keep asserting that visible text “邻里问候”, “日常社交”, and “🌐” are absent. **Stop requiring 👋 to be visible**; assert it is also absent (or simply drop that assertion). Do not add a 👋 to the card.
  2. `e2e/home.spec.ts:186` (`header shows only a non-interactive Home tab…`) expects a `navigation` named “main navigation” with a visible “Home” label. The doc Home screenshot has no such tab (and no Progress/Profile). Current Home also has no product nav — only `DebugJumpBar` when `?debug=1`, labeled “调试跳转 Debug jump bar”, which is hidden on `/` without the flag. **Do not add a Home tab.** Rewrite the test to assert there is no `navigation` named “main navigation”, that “Progress” and “Profile” do not appear as controls, and that the page stays on `/`.

### T-002 Observe videos, covers, captions

- Neighbor video: byte-copy `/workspace/docs-source/assets/meeting-a-neighbor.mp4` over `public/video/greeting-somebody-observe.mp4` (keep this path). Source is 10.08s, 1280×720, sha256 `0ea0e9e7773b16f05e7d21770be6395674f97b94d2a1a76ec82d7f7fe207cd8d`.
- Neighbor poster (T-002): after the T-001 move, replace `public/assets/observe/neighbor-poster.jpg` with a byte-copy of `/workspace/docs-source/assets/docx-images/image6.jpeg` (couple on the sidewalk, **no** “Hi!” bubble). sha256 `6aaf4dd94b92cdba2db25dbec25534f2331f40b3fdac078fdcfe006c92163e5e`. It must not be `/assets/home/mission-thumb.jpg`.
- Coffee-shop poster: `public/assets/observe/coffee-shop-poster.png` ← byte-copy of `/workspace/docs-source/assets/docx-images/image5.png` (barista and customer at the counter). sha256 `b8152fc854c8829642d63941b6fe8d2c289c0398275452a6786be1d53034a144`. Keep `.png` so the hash is unchanged. Update `src/content/observe.ts` (it currently points at a missing `/assets/observe/coffee-shop-poster.jpg`).
- Coffee-shop **video is a placeholder** until Python drops the real file. Generate `public/video/greeting-coffee-shop.mp4` (path already referenced) as a ~10s, browser-playable H.264 `yuv420p` + AAC (or silent AAC) clip made from the coffee poster still, with `+faststart`. It must reach `readyState >= 2` and actually play (`currentTime` advances) in Chromium. Document the swap in `public/video/README.md` (and a short comment in `src/content/observe.ts`): replace that mp4 with the real file and update only the coffee-shop VTT cue **timings** (do not change cue text unless the script changes). No feature work for the swap.
- Captions: **text must match the scripts below exactly** (dialogue only — do **not** prefix “Man:” / “Barista:” etc.; the mock shows the spoken line only). English and Chinese in separate VTT files, rendered by a **custom overlay** sourced from those VTT files (parsing VTT in JS and/or hidden `<track>` elements is fine; do not rely on the native cue UI as the learner-visible captions). Default CC *mode* (English) is implemented in T-003, but T-002 must already paint the active cue on screen.
- **Neighbor cue timings** (method: `ffmpeg` `silencedetect` at −25/−30 dB plus a 50 ms RMS envelope of the mono 16 kHz wav; word identity checked with `faster-whisper` `base` on CPU, but **cue text is the doc script, not the ASR wording**, e.g. “See you!” not “See ya.”). Times in seconds:

  | # | EN (exact) | ZH (exact) | start → end |
  |---|---|---|---|
  | 1 | Hey! How's it going? | 嗨！最近怎么样？ | 00:00.15 → 00:01.20 |
  | 2 | Pretty good! How about you? | 挺好的！你呢？ | 00:01.25 → 00:02.50 |
  | 3 | Good! Just enjoying the weather. | 挺好的！正享受这好天气呢。 | 00:02.95 → 00:04.80 |
  | 4 | Yeah, it's a beautiful day! | 是啊，今天天气真好！ | 00:05.30 → 00:06.80 |
  | 5 | See you around! | 回头见！ | 00:07.50 → 00:08.15 |
  | 6 | See you! | 再见！ | 00:08.45 → 00:09.10 |

- **Coffee-shop placeholder cue timings** (evenly spaced over the ~10s still; replace these times when the real video arrives; text is final):

  | # | EN (exact) | ZH (exact) | start → end |
  |---|---|---|---|
  | 1 | Hi! How are you? | 嗨！你好吗？ | 00:00.50 → 00:02.00 |
  | 2 | I'm good, thanks. How are you? | 我挺好的，谢谢！你呢？ | 00:02.20 → 00:04.20 |
  | 3 | Good, thanks! What can I get for you? | 我也挺好的，谢谢！你想点什么？ | 00:04.40 → 00:06.60 |
  | 4 | A latte, please. | 请给我一杯拿铁。 | 00:06.80 → 00:08.40 |
  | 5 | Sure! | 好的！ | 00:08.60 → 00:09.80 |

- Suggested VTT paths: `public/video/greeting-somebody-observe.en.vtt`, `.zh.vtt`, `greeting-coffee-shop.en.vtt`, `.zh.vtt`. Update `src/content/observe.ts` accordingly (two caption URLs per scene is fine). Remove or stop depending on the old Chinese-only `greeting-somebody-observe.vtt` and the empty `greeting-coffee-shop.vtt`.
- Overlay: English only, English over Chinese, or nothing, depending on CC mode (T-003). Cue text on screen must be the script lines above.

### T-003 Custom Observe controls

- Replace native `video.controls` with a custom, mobile-friendly bar matching the page 2 mock (`docx-images/image7.jpeg`): play/pause, elapsed/duration, seek/progress, **mute toggle + volume slider** (default volume `1` / 100%, unmuted), **CC**, **Speed**, **Fullscreen**.
- `video.controls === false`. Set `disablePictureInPicture` and `controlsList` including `nodownload` (and no PiP / no download control in the custom bar).
- Keep the existing poster + tap-to-play overlay until the learner starts playback (do not make the overlay a `<button>` / `role="button"` — `e2e/navigation-spine.spec.ts` requires Continue to be the only `getByRole("button")` on Observe before anything is played). **Custom control buttons appear only after the video has started**, so that walkthrough still passes. Once shown, they stay visible and easy to access (do not auto-hide in a way that fails e2e).
- CC offers exactly three options: **English** / **English + Chinese** / **Off**. Default is **English**. Options change the **real custom overlay** (English over Chinese when both, as in the mock). Not a native text-track menu.
- Speed offers only **0.75 / 1 / 1.25** and sets `video.playbackRate`. Default 1×.
- Fullscreen button calls `requestFullscreen` (or the element equivalent) on the **player container** (so the overlay and controls can stay with the video). Playwright/iOS: e2e should **stub** `requestFullscreen` and assert it was called; do not require an actual fullscreen transition.
- Every control has a stable `data-testid` suffixed with the scene id (`coffee-shop` / `neighbor`), including menu options. Use:
  - `observe-cue-overlay-${id}` (and `observe-cue-en-${id}` / `observe-cue-zh-${id}` if useful)
  - `observe-playpause-${id}`, `observe-progress-${id}`
  - `observe-mute-${id}`, `observe-volume-${id}` (slider)
  - `observe-cc-${id}`, `observe-cc-option-en-${id}`, `observe-cc-option-en-zh-${id}`, `observe-cc-option-off-${id}`
  - `observe-speed-${id}`, `observe-speed-option-0.75-${id}`, `observe-speed-option-1-${id}`, `observe-speed-option-1.25-${id}`
  - `observe-fullscreen-${id}`
- At viewport 390×844, after starting a video, each of CC, Speed, mute, volume slider, and Fullscreen has a bounding box inside the viewport.
- Update `e2e/observe.spec.ts` “each video has an English captions track marked default” so it no longer requires a default native `<track default>`. Assert the custom overlay default (English) instead.
- Existing Observe tests that start playback, hide the poster overlay, and leave the other scene paused must still pass.

## Acceptance criteria

1. **T-001 move first** — Observe’s neighbor poster path is no longer `/assets/home/mission-thumb.jpg`.
2. **T-001 hashes (files and served)** — sha256 of `public/assets/home/mission-thumb.jpg` and of `GET http://127.0.0.1:3000/assets/home/mission-thumb.jpg` both equal `bdf683fbe99d8ccf9f91d2740520e42d4a44c05b948d03efec101398c4c897ff`. sha256 of `public/assets/home/hero.jpg` and of `GET /assets/home/hero.jpg` both equal `927ee632a6890f658f94ad3c1bc661209dadd474d87caf6ffc4cba662578a479`.
3. **T-001 Home UI** — On `/`, `img[src="/assets/home/mission-thumb.jpg"]` inside `[data-testid="mission-card"]` is visible, and the hero `img[src="/assets/home/hero.jpg"]` is present. Other Home layout/copy/behavior unchanged.
4. **T-001 Home e2e green** — `npx playwright test e2e/home.spec.ts` is all green, including the two tests updated to follow the doc (no 👋, no main-navigation Home tab).
5. **T-002 videos serve** — `GET /video/greeting-coffee-shop.mp4` and `GET /video/greeting-somebody-observe.mp4` return HTTP 200 with size well above a few KB. Neighbor file sha256 matches `0ea0e9e7773b16f05e7d21770be6395674f97b94d2a1a76ec82d7f7fe207cd8d`.
6. **T-002 posters** — Coffee-shop poster is the image5 still (sha256 `b8152fc854c8829642d63941b6fe8d2c289c0398275452a6786be1d53034a144`); neighbor poster is image6 (sha256 `6aaf4dd94b92cdba2db25dbec25534f2331f40b3fdac078fdcfe006c92163e5e`), not the Home mission thumb.
7. **T-002 playback** — On `/observe?debug=1`, both `[data-testid="observe-video-coffee-shop"]` and `[data-testid="observe-video-neighbor"]` reach `readyState >= 2` and, after the poster overlay is clicked, are not `paused` and `currentTime` advances.
8. **T-002 on-screen cues** — While a video plays, the custom overlay shows the exact script line for the current time (English default). A VTT file grep alone is not enough. Neighbor lines 1–6 and coffee-shop lines 1–5 appear on screen at their cue times.
9. **T-002 swap note** — `public/video/README.md` explains how to drop in the real coffee-shop mp4 and update only caption timings.
10. **T-003 native menu gone** — After start, `video.controls === false`, no download control, no PiP control, `disablePictureInPicture` is true, `controlsList` includes `nodownload`.
11. **T-003 CC / speed / volume / fullscreen** — Default overlay is English. Switching to English + Chinese shows both languages (English over Chinese) from the T-002 script; Off shows no overlay captions. Speed 0.75 / 1 / 1.25 each set `playbackRate` and no other speed options exist. Mute toggle and slider change `muted` and/or `volume`; default volume is 1. Fullscreen stub shows `requestFullscreen` is called.
12. **T-003 testids + viewport** — All listed controls have the testids above; at 390×844 each of CC, Speed, mute, volume slider, and Fullscreen is inside the viewport.
13. **No Notice / Explore regressions from this batch** — existing Notice suite stays green. Explore’s 9 pre-existing failures may remain. Home must be green. Full suite after this batch: only those 9 Explore failures (no new ones).
14. **Build** — `npm run build` exits 0. `GET /` and `GET /observe` return 200.

## Exact end-to-end checks

From `/workspace/code/ai-english-learning`, against the production server on port 3000:

```bash
# HTTP sanity
curl -sS -o /dev/null -w "GET / HTTP %{http_code}\n" http://127.0.0.1:3000/
curl -sS -o /dev/null -w "GET /observe HTTP %{http_code}\n" http://127.0.0.1:3000/observe

# T-001 served hashes (must match the expected digests above)
curl -sS http://127.0.0.1:3000/assets/home/mission-thumb.jpg | sha256sum
curl -sS http://127.0.0.1:3000/assets/home/hero.jpg | sha256sum
sha256sum public/assets/home/mission-thumb.jpg public/assets/home/hero.jpg

# T-002 videos and posters
curl -sS -o /dev/null -w "coffee mp4:%{http_code} size:%{size_download}\n" http://127.0.0.1:3000/video/greeting-coffee-shop.mp4
curl -sS -o /dev/null -w "neighbor mp4:%{http_code} size:%{size_download}\n" http://127.0.0.1:3000/video/greeting-somebody-observe.mp4
curl -sS http://127.0.0.1:3000/video/greeting-somebody-observe.mp4 | sha256sum
curl -sS http://127.0.0.1:3000/assets/observe/coffee-shop-poster.png | sha256sum
curl -sS http://127.0.0.1:3000/assets/observe/neighbor-poster.jpg | sha256sum

# Playwright
npx playwright test e2e/home.spec.ts
npx playwright test e2e/observe.spec.ts
npx playwright test
```

Expected after the fix:

- `e2e/home.spec.ts` all green.
- `e2e/observe.spec.ts` all green, including new T-002/T-003 assertions (and the updated captions test).
- Full `npx playwright test`: Home green; Notice still green; Explore still has the same 9 pre-existing failures; no new failures.

Baseline (before this batch, current prod server): `npx playwright test e2e/home.spec.ts e2e/observe.spec.ts` → **23 passed, 2 failed** (of 25). Failures: `home.spec.ts:139` (👋 missing) and `home.spec.ts:186` (no “main navigation” Home tab). Observe’s existing 10 tests passed. Coffee-shop mp4 is currently missing on disk.

Screenshots at 390×844, saved under `/workspace/code/ai-english-learning/artifacts/batch-2/`:

- `home-hero-mission.png` — Home top, showing hero still life and mission thumb (couple + “Hi!”)
- `observe-neighbor-en.png` — Meeting a Neighbor playing with English caption visible
- `observe-neighbor-en-zh.png` — same, English + Chinese caption visible
- `observe-coffee-placeholder.png` — At a Coffee Shop placeholder (poster and/or playing still)

## Out of scope

- T-004–T-006 (already shipped on `batch-1-notice`) and T-007–T-012.
- GitHub push, Vercel, public tunnels.
- Replacing the coffee-shop placeholder with the real Drive video (Python will drop that later).
- Changing Explore, Notice, or Practice except as needed to keep shared layout working.
- Adding a product “Home” tab or a 👋 on the mission card.
