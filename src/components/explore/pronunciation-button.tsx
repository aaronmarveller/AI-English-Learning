"use client";

import { useState } from "react";
import { speak } from "@/lib/speech-synthesis";

type PronunciationButtonProps = {
  /** The exact text spoken aloud when activated. */
  text: string;
  /** Accessible label. Defaults to a generic "play pronunciation of <text>". */
  label?: string;
  testId?: string;
  className?: string;
  /** Greyed out and unclickable (Guided Practice, before a Situation is picked). */
  disabled?: boolean;
};

/**
 * Speaker-icon control that plays `text` through the speech-synthesis
 * adapter (src/lib/speech-synthesis.ts) — this component never touches
 * `window.speechSynthesis` itself. Repeatable: clicking again re-triggers
 * playback (the adapter cancels any in-flight utterance first).
 *
 * A real `<button>` — e2e/navigation-spine.spec.ts's shared walkthrough
 * test scopes its own button query by accessible name (`/Continue/`), so
 * this page is free to use the semantically-correct element/role for every
 * control instead of working around an unscoped query.
 */
export function PronunciationButton({
  text,
  label,
  testId,
  className = "",
  disabled = false,
}: PronunciationButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  async function activate() {
    setIsPlaying(true);
    try {
      await speak(text);
    } finally {
      setIsPlaying(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={label ?? `播放发音 Play pronunciation: ${text}`}
      data-testid={testId}
      data-state={isPlaying ? "playing" : "idle"}
      disabled={disabled}
      className={`btn-icon-pressed inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-accent-soft text-accent transition-colors duration-[220ms] data-[state=playing]:bg-[#d6f2e1] disabled:cursor-not-allowed disabled:bg-[#eef0f3] disabled:text-muted disabled:opacity-60 ${className}`.trim()}
      onClick={activate}
    >
      {isPlaying ? (
        <span aria-hidden data-testid="waveform" className="flex h-4 items-center gap-0.5">
          {[0, 1, 2, 3].map((bar) => (
            <span
              key={bar}
              className="waveform-bar block h-4 w-[3px] rounded-full bg-accent"
              style={{ animationDelay: `${bar * 120}ms` }}
            />
          ))}
        </span>
      ) : (
        <span aria-hidden>🔈</span>
      )}
    </button>
  );
}
