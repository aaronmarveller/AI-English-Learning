import { AUDIO_MANIFEST } from "@/lib/audio-manifest";

/**
 * Pronunciation playback for Explore and Observe's English expressions.
 * (Emily's voice in a Call is not played from here — it comes over the
 * Realtime connection, see src/lib/realtime-call.ts.)
 *
 * Two playback paths behind one function, tried in order — nothing outside
 * this module may touch `window.speechSynthesis` or an `<audio>` element
 * directly:
 *
 * 1. Pre-generated audio: if `text` exactly matches an entry in
 *    src/lib/audio-manifest.ts, play its `public/audio/<id>.mp3` file — zero
 *    latency and the same voice every time.
 * 2. Browser synthesis (`window.speechSynthesis`): the fallback whenever there
 *    is no matching file or it can't be played, so the app still works with
 *    no pre-generated audio at all.
 */

export type SpeakOptions = {
  /** BCP-47 language tag. Defaults to en-US — all Explore expressions are English. */
  lang?: string;
  /** 0.1–10, browser-defined default is 1. */
  rate?: number;
  /** Split "/"-delimited teaching text into sequential segments. Defaults to false. */
  splitOnSlash?: boolean;
};

const PREGENERATED_AUDIO_PATHS = new Map(
  AUDIO_MANIFEST.map((entry) => [entry.text, `/audio/${entry.id}.mp3`]),
);

/** Silence inserted between the segments of a "/"-delimited text (see `speak()`). */
const SEGMENT_PAUSE_MS = 1000;

/** True when the browser exposes a usable Web Speech synthesis API. */
export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/**
 * Known female voice names exposed by common Windows, Apple, and browser
 * speech engines. Emily should remain recognisably female even when the
 * pre-generated audio is unavailable, so this allowlist is considered before
 * the engine-quality labels below. Keep matches token-boundary based: short
 * names such as "Ana" must not accidentally match "Natural".
 */
const PREFERRED_FEMALE_VOICE_NAME_PATTERN =
  /\b(?:ana|aria|ava|emma|fiona|jenny|karen|libby|michelle|moira|samantha|serena|sonia|tessa|victoria|zira)\b/i;

/**
 * Name patterns for the higher-quality system voices some platforms offer
 * alongside their plain default (Edge/Windows' "... Online (Natural)"
 * voices, Chrome's WaveNet-backed "Google ... English" voices, macOS/iOS's
 * "(Enhanced)"/"(Premium)" Siri voices) — checked in priority order. The
 * plain default voice on most platforms reads noticeably more robotic.
 */
const PREFERRED_VOICE_NAME_PATTERNS = [/natural/i, /neural/i, /premium/i, /enhanced/i, /google .*english/i, /samantha/i];

/**
 * Picks the best available voice for `lang` out of `voices`, preferring a
 * known female voice name and then the engine-quality ordering. Returns
 * `undefined` if nothing in `lang` is available at all — callers should fall
 * back to the browser's own default voice in that case, not force a
 * wrong-language one.
 *
 * A plain function of its input (no `window`/`SpeechSynthesis` access), so
 * it's unit-testable without a browser — see speech-synthesis.test.ts.
 */
export function pickBestVoiceFrom<V extends { name: string; lang: string }>(
  voices: readonly V[],
  lang: string,
): V | undefined {
  const langPrefix = lang.split("-")[0].toLowerCase();
  const matchingLang = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));

  const femaleMatch = matchingLang.find((voice) =>
    PREFERRED_FEMALE_VOICE_NAME_PATTERN.test(voice.name),
  );
  if (femaleMatch) return femaleMatch;

  for (const pattern of PREFERRED_VOICE_NAME_PATTERNS) {
    const match = matchingLang.find((voice) => pattern.test(voice.name));
    if (match) return match;
  }
  return matchingLang[0];
}

/**
 * Resolves once the browser's voice list is populated — most browsers load
 * it asynchronously and `getVoices()` returns empty until the `voiceschanged`
 * event fires. Falls back to whatever `getVoices()` reports after a short
 * timeout if that event never arrives, so this never hangs indefinitely.
 */
function getVoicesOnceReady(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  if (typeof synth.addEventListener !== "function") return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(synth.getVoices()), 500);
    synth.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timeoutId);
        resolve(synth.getVoices());
      },
      { once: true },
    );
  });
}

/**
 * One media element for every pre-generated line. iOS grants playback
 * permission per element, so replacing this instance would throw away the
 * permission a tap established.
 */
let reusableAudio: HTMLAudioElement | null = null;
let cancelCurrentAudioAttempt: (() => void) | null = null;
/** Bumped on every `speak()`/`cancelSpeech()`; an older call sees it change and stops. */
let generation = 0;

function getReusableAudio(): HTMLAudioElement {
  reusableAudio ??= new Audio();
  return reusableAudio;
}

/** Plays the pre-generated file for `text`, if the manifest has one. Resolves `true` only if it played to the end. Never rejects. */
function playPregeneratedAudio(text: string, rate: number | undefined): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const path = PREGENERATED_AUDIO_PATHS.get(text);
  if (!path) return Promise.resolve(false);

  return new Promise((resolve) => {
    const audio = getReusableAudio();
    audio.muted = false;
    audio.src = path;
    audio.playbackRate = rate ?? 1;

    const settle = (played: boolean) => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (cancelCurrentAudioAttempt === onCancelled) cancelCurrentAudioAttempt = null;
      resolve(played);
    };
    const onEnded = () => settle(true);
    const onError = () => settle(false);
    const onCancelled = () => settle(false);
    cancelCurrentAudioAttempt = onCancelled;

    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.play().catch(() => settle(false));
  });
}

/** Speaks `text` through the browser's own synthesiser. Resolves `true` if it was spoken. Never rejects. */
async function speakWithBrowser(text: string, options: SpeakOptions, myGeneration: number): Promise<boolean> {
  if (!isSpeechSynthesisSupported()) return false;

  const synth = window.speechSynthesis;
  const lang = options.lang ?? "en-US";
  const voices = await getVoicesOnceReady();
  if (myGeneration !== generation) return false;
  const voice = pickBestVoiceFrom(voices, lang);

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (voice) utterance.voice = voice;
    if (options.rate) utterance.rate = options.rate;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    synth.speak(utterance);
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Speaks `text` aloud and resolves once playback ends (or immediately, as a
 * no-op, if no playback path is available — callers don't need to
 * feature-detect first). Never rejects: a synthesis error resolves the same
 * as a normal end, since a failed pronunciation playback shouldn't surface as
 * an app error. Resolves `true` if audio actually played.
 *
 * Cancels any audio already in flight before starting, so repeat clicks
 * (including on a different card) always restart cleanly instead of
 * overlapping.
 *
 * Slash splitting is opt-in for teaching-card callers. Ordinary text keeps
 * "/" intact because Chinese prose can naturally use it (for example,
 * "上午/下午都可以说"). Opted-in segments receive a fixed pause and each still
 * goes through the normal playback ladder independently.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<boolean> {
  cancelSpeech();
  const myGeneration = generation;

  const segments = options.splitOnSlash
    ? text
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
    : [text];

  let playedAny = false;
  for (let i = 0; i < segments.length && myGeneration === generation; i++) {
    const played =
      (await playPregeneratedAudio(segments[i], options.rate)) ||
      (myGeneration === generation && (await speakWithBrowser(segments[i], options, myGeneration)));
    playedAny = playedAny || played;
    if (i < segments.length - 1 && myGeneration === generation) await pause(SEGMENT_PAUSE_MS);
  }
  return playedAny;
}

/** Stops any in-flight playback. */
export function cancelSpeech(): void {
  generation += 1;
  reusableAudio?.pause();
  cancelCurrentAudioAttempt?.();
  cancelCurrentAudioAttempt = null;
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
