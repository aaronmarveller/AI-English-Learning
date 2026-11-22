# Observe videos

- `greeting-somebody-observe.mp4` — real "Meeting a Neighbor" clip.
- `greeting-coffee-shop.mp4` — **placeholder** (10s still of the coffee-shop poster).

## Swapping in the real coffee-shop video

1. Overwrite `public/video/greeting-coffee-shop.mp4` with the real file (H.264 yuv420p + AAC, `+faststart`).
2. Edit only the cue **timings** in `greeting-coffee-shop.en.vtt` and `greeting-coffee-shop.zh.vtt` (keep both files' cues at identical times).
   Do not change cue text unless the script changes.

No code changes are needed.
