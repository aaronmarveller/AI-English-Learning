import { AUDIO_MANIFEST } from "@/lib/audio-manifest";

/**
 * Speech-synthesis adapter (spec.md "三个适配层" > 语音合成).
 *
 * Two playback paths behind the single `speak()` seam — nothing outside
 * this module may touch `window.speechSynthesis` or an `<audio>` element
 * directly:
 *
 * 1. Pre-generated audio (ticket 13): if `text` exactly matches an entry in
 *    src/lib/audio-manifest.ts, play its `public/audio/<id>.mp3` file —
 *    zero latency, consistent quality, not dependent on the demo machine's
 *    system voice.
 * 2. Browser synthesis (`window.speechSynthesis`, wired in ticket 09): the
 *    fallback whenever there's no manifest match, or the matched file fails
 *    to load/play (ticket 13 DoD: "文件缺失或模型输出偏离模板时降级到浏览器
 *    语音合成"). This is the ONLY path for Practice's live-generated
 *    conversation replies, which have no fixed pool to pre-generate from.
 */

export type SpeakOptions = {
  /** BCP-47 language tag. Defaults to en-US — all Explore expressions are English. */
  lang?: string;
  /** 0.1–10, browser-defined default is 1. */
  rate?: number;
};

const PREGENERATED_AUDIO_PATHS = new Map(
  AUDIO_MANIFEST.map((entry) => [entry.text, `/audio/${entry.id}.mp3`]),
);

/** True when the browser exposes a usable Web Speech synthesis API. */
export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/** The pre-generated `<audio>` element currently playing, if any — tracked so a new `speak()` call or `cancelSpeech()` can stop it. */
let currentPregeneratedAudio: HTMLAudioElement | null = null;

/**
 * Plays the pre-generated file for `text`, if the manifest has one.
 * Resolves `true` on successful playback, `false` if there's no manifest
 * match or the file failed to load/play — the caller falls back to browser
 * synthesis in that case. Never rejects, same contract as `speak()` itself.
 */
function playPregeneratedAudio(text: string, rate?: number): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const path = PREGENERATED_AUDIO_PATHS.get(text);
  if (!path) return Promise.resolve(false);

  return new Promise((resolve) => {
    const audio = new Audio(path);
    if (rate) audio.playbackRate = rate;
    currentPregeneratedAudio = audio;

    audio.addEventListener("ended", () => resolve(true), { once: true });
    audio.addEventListener("error", () => resolve(false), { once: true });
    audio.play().catch(() => resolve(false));
  });
}

/**
 * Speaks `text` aloud and resolves once playback ends (or immediately, as a
 * no-op, if neither playback path is available — callers don't need to
 * feature-detect first). Never rejects: a synthesis error resolves the same
 * as a normal end, since a failed pronunciation playback shouldn't surface
 * as an app error.
 *
 * Cancels any utterance/audio already in flight (from EITHER playback path)
 * before starting a new one, so repeat clicks (including on a different
 * card, or a click that lands mid-fallback) always restart cleanly instead
 * of overlapping.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  cancelSpeech();

  const playedPregenerated = await playPregeneratedAudio(text, options.rate);
  if (playedPregenerated) return;

  if (!isSpeechSynthesisSupported()) {
    return;
  }

  const synth = window.speechSynthesis;

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang ?? "en-US";
    if (options.rate) utterance.rate = options.rate;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    synth.speak(utterance);
  });
}

/** Stops any in-flight playback (pre-generated audio or browser synthesis) without waiting for it to end naturally. */
export function cancelSpeech(): void {
  currentPregeneratedAudio?.pause();
  currentPregeneratedAudio = null;
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}
