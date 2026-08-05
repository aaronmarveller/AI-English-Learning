"use client";

import { useRef, useState, type KeyboardEvent } from "react";

type SceneVideoPlayerProps = {
  src: string;
  captionsSrc: string;
  sceneName: string;
};

/**
 * Native `<video controls>` gives pause/replay/seek/volume/fullscreen and
 * the English-caption toggle for free (spec.md "Out of Scope" > 视频字幕
 * 模块: "使用原生播放器能力，只附英文字幕轨"). This component only adds two
 * things on top of that:
 *
 * 1. A CSS poster/cover (no video-cover image asset exists in this repo —
 *    see src/content/observe.ts) shown until the learner starts playback.
 * 2. A big "tap to play" overlay for that first-play moment specifically.
 *
 * The overlay's trigger is deliberately a plain element with no ARIA
 * `button` role (not a `<button>`, no `role="button"`) rather than a real
 * button: e2e/navigation-spine.spec.ts's walkthrough test does
 * `page.getByRole("button").click()` on every learning page expecting
 * exactly one match, and that match must stay the page's Continue button.
 * The overlay is still reachable by keyboard (`tabIndex` + Enter/Space)
 * and labeled (`aria-label`); once playback starts it's removed from the
 * DOM entirely and native `<video controls>` (a real, standard control
 * surface) takes over for everything else.
 */
export function SceneVideoPlayer({ src, captionsSrc, sceneName }: SceneVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  function startPlayback() {
    // The placeholder src (see src/content/observe.ts — no real file lands
    // until later) can't actually decode, so the returned promise can
    // reject. That's fine: per the HTML spec, play() synchronously flips
    // `paused` to false as part of its own algorithm, before the promise
    // settles — that synchronous flip is the only thing "click starts
    // playback" depends on, so swallow the eventual rejection here.
    videoRef.current?.play().catch(() => {});
    setHasStarted(true);
  }

  function handleOverlayKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startPlayback();
    }
  }

  return (
    <div
      className="relative w-full max-w-full overflow-hidden rounded-card bg-primary"
      style={{ aspectRatio: "16 / 9" }}
    >
      <video
        ref={videoRef}
        data-testid="observe-video"
        className="h-full w-full max-w-full"
        controls
        playsInline
        preload="metadata"
        onPlay={() => setHasStarted(true)}
      >
        <source src={src} type="video/mp4" />
        <track kind="captions" src={captionsSrc} srcLang="en" label="English" default />
      </video>

      {/*
        Ticket 14 added this overlay's press feedback (`active:brightness-90`
        + `group`/`group-active:scale-90` on the ▶ icon) before issue #6's
        shared rule existed. Issue #11 asks this to reuse that shared
        mechanism (globals.css: `.btn-icon-pressed:active` -> `scale-95
        brightness-90`) rather than keep a one-off. It can't be applied
        verbatim to either element here, for two separate reasons:
          - The ▶ icon isn't the actual click target — the whole card is,
            via this outer div's onClick — so a press anywhere on the card
            must still shrink the icon, not just a press on the icon
            itself. `.btn-icon-pressed:active` only matches when the
            pointer is down on that exact element (or its own descendant),
            so putting it directly on the icon span would silently shrink
            "press anywhere on the overlay" down to "press exactly on the
            small ▶ circle". `group-active:` is a different mechanism (it
            reads the ancestor `group` div's `:active` state, which *does*
            cover a press anywhere inside it) and has to stay for that
            reason.
          - The outer div can't take `.btn-icon-pressed`'s `scale-95`
            either: it's `absolute inset-0` inside an `overflow-hidden
            rounded-card` parent, so scaling the div itself (rather than
            something inside it) pulls its own edges in from the card's
            corners each press, revealing the video sitting behind it in
            the gap. Brightness alone doesn't move any edges, so only that
            part of the shared rule is safe to reuse here.
        What's left, and what this does, is align the values with the
        shared rule instead of the class itself: the icon's scale now
        matches `.btn-icon-pressed`'s 95% (was 90%, an unrelated ticket-14
        pick), and the overlay's brightness already matched
        `.btn-icon-pressed`/`.btn-primary`'s 90% before this change.
      */}
      {!hasStarted && (
        <div
          data-testid="video-poster-overlay"
          tabIndex={0}
          aria-label={`播放视频 Play video: ${sceneName}`}
          onClick={startPlayback}
          onKeyDown={handleOverlayKeyDown}
          className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary to-accent text-center active:brightness-90"
        >
          <span
            data-testid="video-play-button"
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-card/90 text-2xl text-primary shadow-lg transition-transform group-active:scale-95"
          >
            ▶
          </span>
          <span className="px-6 text-body-sm font-medium text-primary-foreground">{sceneName}</span>
        </div>
      )}
    </div>
  );
}
