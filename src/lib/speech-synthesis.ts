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

/**
 * Name patterns for the higher-quality system voices some platforms offer
 * alongside their plain default (Edge/Windows' "... Online (Natural)"
 * voices, Chrome's WaveNet-backed "Google ... English" voices, macOS/iOS's
 * "(Enhanced)"/"(Premium)" Siri voices) — checked in priority order. The
 * plain default voice on most platforms reads noticeably more robotic, which
 * is what browser-synthesis playback sounds like whenever there's no
 * pregenerated file for the text (every one of Practice's live, per-turn
 * replies from the LLM — see this file's top doc comment).
 */
const PREFERRED_VOICE_NAME_PATTERNS = [/natural/i, /neural/i, /premium/i, /enhanced/i, /google .*english/i, /samantha/i];

/**
 * Picks the best available voice for `lang` out of `voices`, preferring an
 * exact-language match and, within that, a name matching
 * `PREFERRED_VOICE_NAME_PATTERNS` (falling back through the list in order).
 * Returns `undefined` if nothing in `lang` is available at all — callers
 * should fall back to the browser's own default voice in that case, not
 * force a wrong-language one.
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

  for (const pattern of PREFERRED_VOICE_NAME_PATTERNS) {
    const match = matchingLang.find((voice) => pattern.test(voice.name));
    if (match) return match;
  }
  return matchingLang[0];
}

/**
 * Resolves once the browser's voice list is populated — most browsers load
 * it asynchronously and `getVoices()` returns empty until the `voiceschanged`
 * event fires, especially on the very first call in a session. Falls back to
 * whatever `getVoices()` reports after a short timeout if that event never
 * arrives (some browsers only ever expose a synchronous list and never fire
 * it), so this never hangs `speakSegment` indefinitely.
 */
function getVoicesOnceReady(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  // Some `speechSynthesis` implementations (and test doubles standing in for
  // one) don't support `addEventListener` at all — nothing left to wait for
  // in that case beyond whatever `getVoices()` already reported.
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

/** Silence inserted between segments of a "/"-delimited text (see `speak()`). */
const SEGMENT_PAUSE_MS = 1000;

/**
 * Speaks one segment through the pregenerated-audio-or-browser-synthesis
 * pipeline. Never rejects. Resolves `true` if audio actually started
 * (pregenerated playback, or the browser accepted the synthesis utterance
 * without erroring), `false` if both paths were unavailable or blocked —
 * `speakAssertively` below uses this to know whether it needs to fall back
 * to the next user interaction.
 */
async function speakSegment(text: string, options: SpeakOptions): Promise<boolean> {
  const playedPregenerated = await playPregeneratedAudio(text, options.rate);
  if (playedPregenerated) return true;

  if (!isSpeechSynthesisSupported()) {
    return false;
  }

  const synth = window.speechSynthesis;
  const lang = options.lang ?? "en-US";
  const voices = await getVoicesOnceReady();
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
 * no-op, if neither playback path is available — callers don't need to
 * feature-detect first). Never rejects: a synthesis error resolves the same
 * as a normal end, since a failed pronunciation playback shouldn't surface
 * as an app error. Resolves `true` if audio actually started at any point,
 * `false` if every segment was blocked/unavailable (e.g. the browser's
 * autoplay-without-a-user-gesture restriction) — see `speakAssertively`,
 * which is what most callers that care about this want.
 *
 * Cancels any utterance/audio already in flight (from EITHER playback path)
 * before starting a new one, so repeat clicks (including on a different
 * card, or a click that lands mid-fallback) always restart cleanly instead
 * of overlapping.
 *
 * `text` containing "/" (e.g. Explore's "Good morning. / Good afternoon. /
 * Good evening." combo card) is split into segments and spoken one after
 * another with a fixed silence in between — neither TTS path supports
 * SSML-style pause markers, so the "/" itself is never sent to either and a
 * precise gap is inserted here instead. Each segment still goes through the
 * normal pregenerated-audio-or-browser-fallback lookup independently.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<boolean> {
  cancelSpeech();

  const segments = text
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return speakSegment(text, options);
  }

  let playedAny = false;
  for (let i = 0; i < segments.length; i++) {
    const played = await speakSegment(segments[i], options);
    playedAny = playedAny || played;
    if (i < segments.length - 1) await pause(SEGMENT_PAUSE_MS);
  }
  return playedAny;
}

/**
 * Speaks `text` "as soon as possible" despite browsers blocking unmuted
 * audio that isn't triggered by a user gesture: tries `speak()` immediately
 * (succeeds outright wherever the browser already grants autoplay — e.g. the
 * user has interacted with this origin before), and only if that attempt
 * comes back blocked, arms a one-time listener for the very next
 * `pointerdown`/`keydown` anywhere in the document and speaks then instead,
 * since that next interaction is a genuine user gesture the browser will
 * always honor.
 *
 * Deliberately waits for the immediate attempt's outcome before arming
 * anything, rather than racing "try immediately" against "listen for the
 * next interaction" — a blocked attempt resolves near-instantly (there's no
 * playback to wait for), so this adds no perceptible delay, and it means the
 * fallback listener only ever exists when it's actually needed. Arming it
 * unconditionally up front would risk a second, unwanted playback: nothing
 * would tell an early tap (e.g. the learner starting to type while the first
 * attempt is still quietly succeeding) that it wasn't the fallback's cue.
 *
 * For call sites that want a line spoken "on load" (Practice's opening line
 * — see practice-page-content.tsx) rather than in direct response to a
 * click, since a bare `speak()` there silently does nothing on browsers that
 * require a gesture first (most mobile browsers, on a fresh page/session).
 *
 * Fire-and-forget by design (no returned promise) — the eventual playback
 * may happen anywhere from immediately to whenever the learner first taps
 * the page, so there's nothing meaningful for a caller to await.
 */
export function speakAssertively(text: string, options: SpeakOptions = {}): void {
  void speak(text, options).then((played) => {
    if (played || typeof document === "undefined") return;

    function onFirstInteraction(): void {
      document.removeEventListener("pointerdown", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
      void speak(text, options);
    }
    document.addEventListener("pointerdown", onFirstInteraction, { once: true });
    document.addEventListener("keydown", onFirstInteraction, { once: true });
  });
}

/** Stops any in-flight playback (pre-generated audio or browser synthesis) without waiting for it to end naturally. */
export function cancelSpeech(): void {
  currentPregeneratedAudio?.pause();
  currentPregeneratedAudio = null;
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}
