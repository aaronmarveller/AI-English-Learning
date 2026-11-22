"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type Cue = { start: number; end: number; text: string };
type CcMode = "en" | "en-zh" | "off";

const CC_OPTIONS: { mode: CcMode; testId: string; label: string }[] = [
  { mode: "en", testId: "en", label: "English" },
  { mode: "en-zh", testId: "en-zh", label: "English + Chinese" },
  { mode: "off", testId: "off", label: "Off" },
];
const SPEEDS = [0.75, 1, 1.25];

function parseTimestamp(t: string): number {
  const parts = t.split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->").map((x) => x.trim().split(" ")[0]);
    cues.push({ start: parseTimestamp(a), end: parseTimestamp(b), text: lines.slice(i + 1).join("\n") });
  }
  return cues;
}

function activeText(cues: Cue[], time: number): string | null {
  return cues.find((c) => time >= c.start && time < c.end)?.text ?? null;
}

function formatTime(sec: number): string {
  const s = Number.isFinite(sec) ? Math.floor(sec) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type SceneVideoPlayerProps = {
  /** Scene id; suffixes the test ids so multiple players can coexist. */
  id: string;
  src: string;
  captionsEnSrc: string;
  captionsZhSrc: string;
  sceneName: string;
  poster: string;
};

const BAR_BTN = "flex h-9 min-w-9 items-center justify-center rounded-button px-2 text-[12px] font-medium text-white";
const MENU = "absolute right-0 bottom-full z-10 mb-1 flex flex-col rounded-button bg-card p-1 text-[12px] text-foreground shadow-lg";

/**
 * Observe's scene player: a plain `<video>` (no native controls, PiP or
 * download) with a custom caption overlay driven by the scene's English and
 * Chinese VTT files, and a custom control bar (play/pause, seek, mute +
 * volume, CC, speed, fullscreen) that appears once playback has started.
 *
 * The poster/tap-to-play overlay is deliberately a plain element with no
 * `button` role: e2e/navigation-spine.spec.ts expects Continue to be the only
 * button on Observe before anything is played. It is keyboard reachable
 * (`tabIndex` + Enter/Space) and labeled, and is removed once playback starts.
 */
export function SceneVideoPlayer({
  id,
  src,
  captionsEnSrc,
  captionsZhSrc,
  sceneName,
  poster,
}: SceneVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [ccMode, setCcMode] = useState<CcMode>("en");
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState<"cc" | "speed" | null>(null);
  const [enCues, setEnCues] = useState<Cue[]>([]);
  const [zhCues, setZhCues] = useState<Cue[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = (url: string, set: (c: Cue[]) => void) =>
      fetch(url)
        .then((r) => r.text())
        .then((t) => !cancelled && set(parseVtt(t)))
        .catch(() => {});
    load(captionsEnSrc, setEnCues);
    load(captionsZhSrc, setZhCues);
    return () => {
      cancelled = true;
    };
  }, [captionsEnSrc, captionsZhSrc]);

  function startPlayback() {
    // play() flips `paused` synchronously; a rejected promise (e.g. an
    // undecodable file) is ignored.
    videoRef.current?.play().catch(() => {});
    setHasStarted(true);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function handleOverlayKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startPlayback();
    }
  }

  function syncTime() {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    if (Number.isFinite(v.duration)) setDuration(v.duration);
  }

  const enText = ccMode === "off" ? null : activeText(enCues, time);
  const zhText = ccMode === "en-zh" ? activeText(zhCues, time) : null;

  return (
    <div ref={containerRef} className="flex w-full max-w-full flex-col bg-primary rounded-card">
      <div className="relative w-full overflow-hidden rounded-card" style={{ aspectRatio: "16 / 9" }}>
        <video
          ref={videoRef}
          data-testid={`observe-video-${id}`}
          className="h-full w-full max-w-full object-cover"
          playsInline
          disablePictureInPicture
          controlsList="nodownload noremoteplayback"
          preload="metadata"
          poster={poster}
          onPlay={() => {
            setHasStarted(true);
            setPaused(false);
          }}
          onPause={() => setPaused(true)}
          onTimeUpdate={syncTime}
          onSeeked={syncTime}
          onLoadedMetadata={syncTime}
          onVolumeChange={(e) => {
            setMuted(e.currentTarget.muted);
            setVolume(e.currentTarget.volume);
          }}
        >
          <source src={src} type="video/mp4" />
        </video>

        {(enText || zhText) && (
          <div
            data-testid={`observe-cue-overlay-${id}`}
            className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-center gap-0.5 text-center"
          >
            {enText && (
              <span
                data-testid={`observe-cue-en-${id}`}
                className="rounded bg-black/70 px-2 py-0.5 text-[13px] leading-5 text-white"
              >
                {enText}
              </span>
            )}
            {zhText && (
              <span
                data-testid={`observe-cue-zh-${id}`}
                className="rounded bg-black/70 px-2 py-0.5 text-[12px] leading-5 text-white"
              >
                {zhText}
              </span>
            )}
          </div>
        )}

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
          data-testid={`video-poster-overlay-${id}`}
          tabIndex={0}
          aria-label={`播放视频 Play video: ${sceneName}`}
          onClick={startPlayback}
          onKeyDown={handleOverlayKeyDown}
          className="group absolute inset-0 flex cursor-pointer items-center justify-center active:brightness-90"
        >
          <span
            data-testid={`video-play-button-${id}`}
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-card/90 text-2xl text-primary shadow-lg transition-transform group-active:scale-95"
          >
            ▶
          </span>
        </div>
      )}
      </div>

      {hasStarted && (
        <div className="flex flex-col gap-1 px-2 py-2">
          <div className="flex items-center gap-2 text-[11px] text-white">
            <span aria-label="Elapsed time">{formatTime(time)}</span>
            <input
              type="range"
              data-testid={`observe-progress-${id}`}
              aria-label="Seek"
              className="min-w-0 flex-1"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              onChange={(e) => {
                if (videoRef.current) videoRef.current.currentTime = Number(e.target.value);
                setTime(Number(e.target.value));
              }}
            />
            <span aria-label="Duration">{formatTime(duration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid={`observe-playpause-${id}`}
              aria-label={paused ? "Play" : "Pause"}
              className={BAR_BTN}
              onClick={togglePlay}
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button
              type="button"
              data-testid={`observe-mute-${id}`}
              aria-label={muted ? "Unmute" : "Mute"}
              className={BAR_BTN}
              onClick={() => {
                if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
              }}
            >
              {muted || volume === 0 ? "🔇" : "🔊"}
            </button>
            <input
              type="range"
              data-testid={`observe-volume-${id}`}
              aria-label="Volume"
              className="w-14 shrink-0"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = v.volume === 0;
              }}
            />
            <div className="ml-auto flex items-center gap-1">
              <div className="relative">
                <button
                  type="button"
                  data-testid={`observe-cc-${id}`}
                  aria-label="Captions"
                  aria-expanded={menu === "cc"}
                  className={BAR_BTN}
                  onClick={() => setMenu(menu === "cc" ? null : "cc")}
                >
                  CC
                </button>
                {menu === "cc" && (
                  <div className={MENU}>
                    {CC_OPTIONS.map((o) => (
                      <button
                        key={o.mode}
                        type="button"
                        data-testid={`observe-cc-option-${o.testId}-${id}`}
                        aria-pressed={ccMode === o.mode}
                        className={`rounded px-3 py-2 text-left whitespace-nowrap ${ccMode === o.mode ? "font-bold" : ""}`}
                        onClick={() => {
                          setCcMode(o.mode);
                          setMenu(null);
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  data-testid={`observe-speed-${id}`}
                  aria-label="Speed"
                  aria-expanded={menu === "speed"}
                  className={BAR_BTN}
                  onClick={() => setMenu(menu === "speed" ? null : "speed")}
                >
                  {speed}×
                </button>
                {menu === "speed" && (
                  <div className={MENU}>
                    {SPEEDS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        data-testid={`observe-speed-option-${r}-${id}`}
                        aria-pressed={speed === r}
                        className={`rounded px-3 py-2 text-left ${speed === r ? "font-bold" : ""}`}
                        onClick={() => {
                          if (videoRef.current) videoRef.current.playbackRate = r;
                          setSpeed(r);
                          setMenu(null);
                        }}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                data-testid={`observe-fullscreen-${id}`}
                aria-label="Fullscreen"
                className={BAR_BTN}
                onClick={() => containerRef.current?.requestFullscreen?.()}
              >
                ⛶
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
