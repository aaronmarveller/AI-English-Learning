import { AUDIO_MANIFEST } from "@/lib/audio-manifest";

/**
 * Speech-synthesis adapter (spec.md "三个适配层" > 语音合成).
 *
 * Three playback paths behind the single `speak()` seam, tried in order —
 * nothing outside this module may touch `window.speechSynthesis` or an
 * `<audio>` element directly:
 *
 * 1. Pre-generated audio (ticket 13): if `text` exactly matches an entry in
 *    src/lib/audio-manifest.ts, play its `public/audio/<id>.mp3` file —
 *    zero latency, consistent quality, not dependent on the demo machine's
 *    system voice or a network round-trip.
 * 2. Live-generated audio (src/app/api/practice/speak/route.ts): for fixed
 *    Conversation Script lines whose pre-generated asset is unavailable,
 *    plus dynamic Chinese help follow-ups —
 *    synthesizes it on demand through the same OpenAI voice the
 *    pregenerated files use, so it sounds like the same speaker instead of
 *    dropping to a noticeably more robotic system voice.
 * 3. Browser synthesis (`window.speechSynthesis`, wired in ticket 09): the
 *    final fallback whenever neither of the above is available (no
 *    manifest match AND the live route is unreachable/unconfigured — ticket
 *    13 DoD: "文件缺失或模型输出偏离模板时降级到浏览器语音合成"), so the app
 *    still works with zero TTS provider configured.
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
 * OpenAI tiers are unavailable, so this allowlist is considered before the
 * engine-quality labels below. Keep matches token-boundary based: short
 * names such as "Ana" must not accidentally match "Natural".
 */
const PREFERRED_FEMALE_VOICE_NAME_PATTERN =
  /\b(?:ana|aria|ava|emma|fiona|jenny|karen|libby|michelle|moira|samantha|serena|sonia|tessa|victoria|zira)\b/i;

/**
 * Name patterns for the higher-quality system voices some platforms offer
 * alongside their plain default (Edge/Windows' "... Online (Natural)"
 * voices, Chrome's WaveNet-backed "Google ... English" voices, macOS/iOS's
 * "(Enhanced)"/"(Premium)" Siri voices) — checked in priority order. The
 * plain default voice on most platforms reads noticeably more robotic, which
 * is what browser-synthesis playback sounds like whenever there's no
 * pregenerated file for the text (for example, a missing Conversation
 * Script asset or a dynamic Chinese follow-up).
 */
const PREFERRED_VOICE_NAME_PATTERNS = [/natural/i, /neural/i, /premium/i, /enhanced/i, /google .*english/i, /samantha/i];

/**
 * Picks the best available voice for `lang` out of `voices`, preferring a
 * known female voice name and then the existing engine-quality ordering.
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

/** User gestures recognized by both the reusable-element unlock and `speakAssertively`'s retry path. */
const FIRST_INTERACTION_EVENTS = ["pointerdown", "touchend", "click", "keydown"] as const;

/**
 * One media element for every pre-generated and live-generated line. iOS
 * grants playback permission per element, so replacing this instance would
 * also throw away the permission established by `unlockReusableAudio`.
 */
let reusableAudio: HTMLAudioElement | null = null;
let cancelCurrentAudioAttempt: (() => void) | null = null;

function getReusableAudio(): HTMLAudioElement {
  reusableAudio ??= new Audio();
  return reusableAudio;
}

/** A real, local source played muted on the first gesture to unlock the singleton on iOS. */
const AUDIO_UNLOCK_SOURCE = "/audio/opening-1.mp3";

function unlockReusableAudio(): void {
  const audio = getReusableAudio();
  audio.muted = true;
  audio.src = AUDIO_UNLOCK_SOURCE;
  // `play()` must remain synchronous in this event stack. A later real line
  // replaces the source and unmutes the same, now-authorized element.
  void audio.play().catch(() => {});

  for (const event of FIRST_INTERACTION_EVENTS) {
    document.removeEventListener(event, unlockReusableAudio);
  }
}

if (typeof document !== "undefined") {
  for (const event of FIRST_INTERACTION_EVENTS) {
    document.addEventListener(event, unlockReusableAudio);
  }
}

/**
 * Owners whose speech recognition sessions currently capture the learner's
 * mic. Multiple UI surfaces can briefly coexist, so each may release only
 * the token it acquired.
 */
export type MicListeningOwner = symbol;
const micListeningOwners = new Set<MicListeningOwner>();

function isMicListening(): boolean {
  return micListeningOwners.size > 0;
}

/**
 * Public external-store state for Turn-Taking consumers. Each `speak()` owns
 * the state it acquired, so an older cancelled call cannot release a newer
 * call when its promise eventually settles.
 */
let activeSpeechOwner: symbol | null = null;
let activePlaybackHasStarted = false;

/**
 * Which part of turn-taking currently owns the microphone gate. The Handoff
 * Gap is a conversation rule, rather than an iOS workaround: after Emily has
 * audibly spoken, the learner waits briefly for her voice to settle before
 * starting their own turn.
 */
export type TurnTakingState = "speaking" | "handoff-gap" | "idle";

/** The deliberate pause between audible playback ending and learner capture. */
export const HANDOFF_GAP_MS = 3_000;

let turnTakingState: TurnTakingState = "idle";
let handoffGapTimeout: ReturnType<typeof setTimeout> | null = null;
const turnTakingListeners = new Set<() => void>();

function publishTurnTakingState(next: TurnTakingState): void {
  if (turnTakingState === next) return;
  turnTakingState = next;
  turnTakingListeners.forEach((listener) => listener());
}

function clearHandoffGap(): void {
  if (handoffGapTimeout !== null) {
    clearTimeout(handoffGapTimeout);
    handoffGapTimeout = null;
  }
}

function beginHandoffGap(): void {
  clearHandoffGap();
  publishTurnTakingState("handoff-gap");
  handoffGapTimeout = setTimeout(() => {
    handoffGapTimeout = null;
    publishTurnTakingState("idle");
  }, HANDOFF_GAP_MS);
}

/** Three-valued public store used by every microphone surface. */
export function getTurnTakingSnapshot(): TurnTakingState {
  return turnTakingState;
}

export function getServerTurnTakingSnapshot(): TurnTakingState {
  return "idle";
}

export function subscribeToTurnTaking(listener: () => void): () => void {
  turnTakingListeners.add(listener);
  return () => turnTakingListeners.delete(listener);
}

/** @deprecated Use the three-state Turn-Taking store above for mic gating. */
export function getSpeakingSnapshot(): boolean {
  return turnTakingState === "speaking";
}

/** @deprecated Use getServerTurnTakingSnapshot. */
export function getServerSpeakingSnapshot(): boolean {
  return false;
}

/** @deprecated Use subscribeToTurnTaking. */
export function subscribeToSpeaking(listener: () => void): () => void {
  return subscribeToTurnTaking(listener);
}

function acquireSpeaking(): symbol {
  const owner = Symbol("speech-playback");
  clearHandoffGap();
  activeSpeechOwner = owner;
  activePlaybackHasStarted = false;
  publishTurnTakingState("speaking");
  return owner;
}

function releaseSpeaking(owner: symbol, didAudiblyStart = false): void {
  if (activeSpeechOwner !== owner) return;
  activeSpeechOwner = null;
  activePlaybackHasStarted = false;
  if (didAudiblyStart) beginHandoffGap();
  else publishTurnTakingState("idle");
}

function ownsSpeaking(owner: symbol): boolean {
  return activeSpeechOwner === owner;
}

/**
 * Acquires microphone ownership while speech recognition is listening, so
 * every playback tier in `speakSegment` can refuse to start audio that would
 * play back through the speaker and bleed into that same microphone. Called
 * by each microphone surface at the same points it tracks its local state.
 *
 * This guards two different orderings of the same speaker-into-microphone
 * collision (see `AUDIO_UNLOCK_EXEMPT_SELECTOR`'s doc comment below for the
 * underlying hardware reason this matters):
 *
 * - Audio already playing, or requested but not yet audible, when the mic
 *   starts: handled immediately here, by `cancelSpeech()`. `currentAudio` is
 *   assigned synchronously by every tier before it ever calls `play()` (see
 *   `playPregeneratedAudio`/`playLiveGeneratedAudio`), including the
 *   live-generated tier's own network fetch — which now happens *inside* the
 *   `<audio>` element itself (the browser fetches `/api/practice/speak`
 *   directly; see that function's doc comment) rather than as a JS-visible
 *   `fetch()` this module awaits — so `cancelSpeech()`'s `currentAudio?.pause()`
 *   correctly reaches it regardless of how far into loading it is.
 * - The mic is already listening when a *new* `speak()` call is made (e.g.
 *   the 🔊 replay button while still mid-turn): nothing transitions at that
 *   moment for `cancelSpeech()` above to react to, so each tier in
 *   `speakSegment` separately checks microphone ownership before starting, right
 *   next to its own `play()`/`speak()` call.
 */
export function acquireMicListening(): MicListeningOwner {
  const owner = Symbol("mic-listening");
  micListeningOwners.add(owner);
  cancelSpeech();
  return owner;
}

export function releaseMicListening(owner: MicListeningOwner): void {
  micListeningOwners.delete(owner);
}

/**
 * `playPregeneratedAudio`'s outcome — deliberately distinguishes "the
 * browser is refusing any unmuted audio right now" from "this specific file
 * isn't a usable source", because `speakSegment` needs to treat them very
 * differently: a genuinely missing/broken file should fall through to the
 * next tier (live-generated audio, then browser synthesis), but neither an
 * autoplay-policy block NOR being superseded by a newer `speak()` call
 * should — every tier plays through an `<audio>` element or an equally
 * gesture-gated API, so a policy block would just recur, and for the
 * live-generated tier that "again" costs a real, wasted API call for audio
 * this function already has a free file for. A superseded attempt isn't a
 * problem with this file at all: `cancelSpeech()` (called at the top of
 * every `speak()`) stops whatever's currently playing before starting the
 * new request, and pausing a still-pending `play()` rejects it with
 * `AbortError` — a race that's especially live for the opening line, whose
 * `speakAssertively` immediate-attempt-plus-listener design (see that
 * function's own doc comment) can have a second `speak()` call for the same
 * text land while the first is still resolving. Either way,
 * `speakAssertively`'s gesture-triggered retry (or the newer call that
 * superseded this one) is what actually gets audio playing — see
 * practice-page-content.tsx.
 */
type PregeneratedAudioOutcome = "played" | "interrupted" | "unavailable";

/** DOMException names from a rejected `play()` that mean "don't fall through to another tier" — see `PregeneratedAudioOutcome`. */
const INTERRUPTED_PLAY_ERROR_NAMES = new Set(["NotAllowedError", "AbortError"]);

/**
 * Plays the pre-generated file for `text`, if the manifest has one. Never
 * rejects, same contract as `speak()` itself.
 */
function playPregeneratedAudio(
  text: string,
  rate: number | undefined,
  onPlaybackStarted: () => void,
): Promise<PregeneratedAudioOutcome> {
  if (typeof window === "undefined") return Promise.resolve("unavailable");
  const path = PREGENERATED_AUDIO_PATHS.get(text);
  if (!path) return Promise.resolve("unavailable");
  // See acquireMicListening's doc comment: never start audio the mic would pick
  // back up. "interrupted" (not "unavailable") so speakSegment doesn't fall
  // through to the live/browser tiers below — same as an autoplay block.
  if (isMicListening()) return Promise.resolve("interrupted");

  return new Promise((resolve) => {
    const audio = getReusableAudio();
    audio.muted = false;
    audio.src = path;
    audio.playbackRate = rate ?? 1;

    const settle = (outcome: PregeneratedAudioOutcome) => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (cancelCurrentAudioAttempt === onInterrupted) cancelCurrentAudioAttempt = null;
      resolve(outcome);
    };
    const onEnded = () => settle("played");
    const onError = () => settle("unavailable");
    const onInterrupted = () => settle("interrupted");
    cancelCurrentAudioAttempt = onInterrupted;

    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.play().then(onPlaybackStarted).catch((error: unknown) => {
      const interrupted = error instanceof DOMException && INTERRUPTED_PLAY_ERROR_NAMES.has(error.name);
      settle(interrupted ? "interrupted" : "unavailable");
    });
  });
}

/**
 * Synthesizes `text` on demand through src/app/api/practice/speak/route.ts
 * (the same OpenAI voice the pregenerated files use) and plays the result —
 * the middle rung of the pregenerated → live-generated → browser-synthesis
 * ladder, for text with no fixed pool to pre-generate from ahead of time
 * (a missing fixed asset or a dynamic Chinese help follow-up).
 * Resolves `true` on successful playback, `false` on any failure (no server
 * key configured, upstream error, playback error) — the caller falls back
 * to browser synthesis in that case, same contract as
 * `playPregeneratedAudio`. Never rejects.
 *
 * Points `<audio src>` straight at the route — a GET, with `text` as a query
 * param — instead of fetch()-ing it in JS and wrapping the resulting `Blob`
 * in an object URL first. That used to be how this worked, until it turned
 * out WebKit's `<audio>` element reliably refuses to play a `blob:` (or even
 * `data:`) URL built from an in-JS fetch of this exact same audio, with a
 * `NotSupportedError`, on real iOS/iPadOS Safari — even though the identical
 * bytes play fine from a plain URL (see the route's own doc comment for how
 * this was diagnosed). Letting the browser fetch the audio itself, the same
 * way the pregenerated-file tier already does, sidesteps that entirely. A
 * repeat request for the same text (the 🔊 replay button,
 * message-bubble-pair.tsx) is now covered by the route's own Cache-Control
 * instead of a hand-rolled in-memory cache.
 */
function playLiveGeneratedAudio(
  text: string,
  rate: number | undefined,
  onPlaybackStarted: () => void,
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  // See acquireMicListening's doc comment: never start audio the mic would pick
  // back up.
  if (isMicListening()) return Promise.resolve(false);

  return new Promise((resolve) => {
    const audio = getReusableAudio();
    audio.muted = false;
    audio.src = `/api/practice/speak?text=${encodeURIComponent(text)}`;
    audio.playbackRate = rate ?? 1;

    const settle = (played: boolean) => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (cancelCurrentAudioAttempt === onInterrupted) cancelCurrentAudioAttempt = null;
      resolve(played);
    };
    const onEnded = () => settle(true);
    const onError = () => settle(false);
    const onInterrupted = () => settle(false);
    cancelCurrentAudioAttempt = onInterrupted;

    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.play().then(onPlaybackStarted).catch(() => settle(false));
  });
}

/** Silence inserted between segments of a "/"-delimited text (see `speak()`). */
const SEGMENT_PAUSE_MS = 1000;

/** Maximum time allowed for a playback attempt to actually start. */
export const PLAYBACK_START_TIMEOUT_MS = 30_000;

/**
 * Speaks one segment through the pregenerated-audio → live-generated-audio →
 * browser-synthesis pipeline. Never rejects. Resolves `true` if audio
 * actually started through any of the three, `false` if all three were
 * unavailable or blocked — `speakAssertively` below uses this to know
 * whether it needs to fall back to the next user interaction.
 */
async function speakSegment(
  text: string,
  options: SpeakOptions,
  owner: symbol,
  onPlaybackStarted: () => void,
): Promise<boolean> {
  if (!ownsSpeaking(owner)) return false;
  const pregenerated = await playPregeneratedAudio(text, options.rate, onPlaybackStarted);
  if (pregenerated === "played") return true;
  // Neither an autoplay-policy block nor being superseded by a newer
  // `speak()` call is a reason to fall through — see
  // `PregeneratedAudioOutcome`'s doc comment.
  if (pregenerated === "interrupted") return false;
  if (!ownsSpeaking(owner)) return false;

  const playedLive = await playLiveGeneratedAudio(text, options.rate, onPlaybackStarted);
  if (playedLive) return true;
  if (!ownsSpeaking(owner)) return false;

  if (!isSpeechSynthesisSupported()) {
    return false;
  }

  const synth = window.speechSynthesis;
  const lang = options.lang ?? "en-US";
  const voices = await getVoicesOnceReady();
  const voice = pickBestVoiceFrom(voices, lang);
  // getVoicesOnceReady can take up to 500ms (see its own doc comment) — the
  // same re-check as playLiveGeneratedAudio's, for the same reason.
  if (isMicListening() || !ownsSpeaking(owner)) return false;

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (voice) utterance.voice = voice;
    if (options.rate) utterance.rate = options.rate;

    utterance.onstart = onPlaybackStarted;
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
 * Slash splitting is opt-in for teaching-card callers. Ordinary text keeps
 * "/" intact because Chinese prose can naturally use it (for example,
 * "上午/下午都可以说"). Opted-in segments receive a fixed pause and each still
 * goes through the normal playback ladder independently.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<boolean> {
  cancelSpeech();

  if (isMicListening()) return false;
  const owner = acquireSpeaking();
  let didAudiblyStart = false;

  const segments = options.splitOnSlash
    ? text
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
    : [text];

  let timeoutId: ReturnType<typeof setTimeout>;
  const onPlaybackStarted = () => {
    didAudiblyStart = true;
    if (ownsSpeaking(owner)) activePlaybackHasStarted = true;
    if (ownsSpeaking(owner)) clearTimeout(timeoutId);
  };

  const playback = async () => {
    if (segments.length <= 1) {
      return speakSegment(text, options, owner, onPlaybackStarted);
    }

    let playedAny = false;
    for (let i = 0; i < segments.length && ownsSpeaking(owner); i++) {
      const played = await speakSegment(segments[i], options, owner, onPlaybackStarted);
      playedAny = playedAny || played;
      if (i < segments.length - 1 && ownsSpeaking(owner)) await pause(SEGMENT_PAUSE_MS);
    }
    return playedAny;
  };

  const timedOut = new Promise<false>((resolve) => {
    timeoutId = setTimeout(() => {
      if (ownsSpeaking(owner)) {
        stopActivePlayback();
        releaseSpeaking(owner, didAudiblyStart);
      }
      resolve(false);
    }, PLAYBACK_START_TIMEOUT_MS);
  });

  try {
    return await Promise.race([playback(), timedOut]);
  } finally {
    clearTimeout(timeoutId!);
    releaseSpeaking(owner, didAudiblyStart);
  }
}

/**
 * User-gesture events that count as "the learner interacted with the page"
 * for `speakAssertively`'s fallback below. Deliberately more than just
 * `pointerdown` — real devices vary in which of these a given browser
 * recognizes as satisfying its autoplay-unlock gesture requirement (e.g.
 * older/embedded mobile browsers lean on `touchend` or plain `click` more
 * reliably than `pointerdown`), so every one of them is armed and whichever
 * fires first wins.
 */
/**
 * A control marked with this attribute never counts as the "first
 * interaction" `speakAssertively` is listening for — see the mic button in
 * practice-input-form.tsx, marked for exactly this reason: starting speech
 * *recognition* at the same instant this function starts speech *synthesis*
 * plays Emily's audio back through the speaker at the exact moment the
 * microphone starts listening, and on real devices that reliably drowns out
 * or echo-cancels the learner's own voice out of the recognized transcript.
 * An excluded interaction is simply ignored (not consumed) — the listeners
 * stay armed for a later, non-excluded one instead.
 */
const AUDIO_UNLOCK_EXEMPT_SELECTOR = "[data-audio-unlock-exempt]";

function isAudioUnlockExempt(event: Event): boolean {
  return event.target instanceof Element && event.target.closest(AUDIO_UNLOCK_EXEMPT_SELECTOR) !== null;
}

/**
 * Speaks `text` "as soon as possible" despite browsers blocking unmuted
 * audio that isn't triggered by a user gesture: tries `speak()` immediately
 * (succeeds outright wherever the browser already grants autoplay — e.g. the
 * user has interacted with this origin before) while *simultaneously*
 * listening for the learner's very next interaction anywhere on the page,
 * and speaks again then if the immediate attempt turns out to have been
 * blocked — that interaction is a genuine user gesture the browser will
 * always honor.
 *
 * The listeners are armed synchronously, up front, rather than only after
 * learning the immediate attempt was blocked: on a real device the browser's
 * own block-vs-allow decision isn't necessarily instant (e.g. it may need to
 * start fetching the file first), so waiting for that outcome before arming
 * anything left a real window where an eager learner's very first tap — the
 * one thing this function exists to catch — could land before any listener
 * existed and be silently lost, with nothing left to prompt a second one.
 * Arming immediately closes that window at the cost of a rare, harmless
 * double-attempt (handled below): if the immediate attempt actually
 * succeeds around the same moment as a stray early tap, the second `speak()`
 * call simply cancels and restarts the same line (see `speak()`'s own
 * cancel-before-starting behavior) rather than overlapping it.
 *
 * For call sites that want a line spoken "on load" (Practice's opening line
 * — see practice-page-content.tsx) rather than in direct response to a
 * click, since a bare `speak()` there silently does nothing on browsers that
 * require a gesture first (most mobile browsers, on a fresh page/session).
 *
 * Fire-and-forget for playback (no returned promise) — the eventual
 * playback may happen anywhere from immediately to whenever the learner
 * first taps the page, so there's nothing meaningful for a caller to await.
 * DOES return a cleanup function, though: since exempt interactions (the mic
 * button) are ignored rather than consumed, the listeners can otherwise
 * outlive their usefulness (e.g. a learner who only ever taps the mic across
 * several restarted conversations, each arming its own fresh set) — a
 * caller driven by a React effect should return this from the effect so it
 * runs on cleanup, same as any other effect subscription.
 */
export function speakAssertively(text: string, options: SpeakOptions = {}): () => void {
  if (typeof document === "undefined") {
    void speak(text, options);
    return () => {};
  }

  let outcomeKnown = false;
  let succeeded = false;
  let interactionHandled = false;

  function removeListeners(): void {
    for (const event of FIRST_INTERACTION_EVENTS) {
      document.removeEventListener(event, onFirstInteraction);
    }
  }

  function onFirstInteraction(event: Event): void {
    if (interactionHandled) return;
    // An exempt interaction (the mic button — see AUDIO_UNLOCK_EXEMPT_SELECTOR's
    // doc comment) isn't consumed: every listener stays armed for a later,
    // non-exempt one, deliberately not using the DOM's own `{ once: true }`
    // (which would've auto-removed this listener regardless of the check
    // below, the exact thing this branch exists to avoid).
    if (isAudioUnlockExempt(event)) return;
    // Likewise not consumed if the mic is still listening at the moment this
    // otherwise-qualifying interaction fires (e.g. the learner taps
    // something else while still mid-turn): speaking now would collide with
    // the mic exactly like any other tier `acquireMicListening`'s doc comment
    // describes, but burning the one-shot retry on an attempt that's just
    // going to be suppressed would leave this text silent for the rest of
    // the session. Stay armed for a later interaction instead — typically
    // the very next tap after the mic session ends.
    if (isMicListening()) return;
    interactionHandled = true;
    removeListeners();
    // If the immediate attempt already succeeded, there's nothing left to
    // do; otherwise (blocked, or its outcome isn't known yet) this gesture
    // is the cue to speak now.
    if (outcomeKnown && succeeded) return;
    void speak(text, options);
  }

  for (const event of FIRST_INTERACTION_EVENTS) {
    document.addEventListener(event, onFirstInteraction);
  }

  void speak(text, options).then((played) => {
    outcomeKnown = true;
    succeeded = played;
    if (played) removeListeners();
  });

  return removeListeners;
}

function stopActivePlayback(): void {
  reusableAudio?.pause();
  cancelCurrentAudioAttempt?.();
  cancelCurrentAudioAttempt = null;
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}

/** Stops any in-flight playback and synchronously releases its speaking state. */
export function cancelSpeech(): void {
  const owner = activeSpeechOwner;
  stopActivePlayback();
  // A cancelled line still earns the Handoff Gap if its audio had begun.
  // The owner-local flag lives in `speak`; expose it here through a marker on
  // the active call so cancellation can preserve the same invariant.
  if (owner) releaseSpeaking(owner, activePlaybackHasStarted);
}
