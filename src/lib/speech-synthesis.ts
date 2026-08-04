/**
 * Speech-synthesis adapter (spec.md "三个适配层" > 语音合成).
 *
 * This ticket only wires the browser-synthesis path (`window.speechSynthesis`).
 * Pre-generated audio playback (ticket 13) will swap in behind this same
 * `speak()` seam without any caller changing — nothing outside this module
 * may touch `window.speechSynthesis` directly.
 */

export type SpeakOptions = {
  /** BCP-47 language tag. Defaults to en-US — all Explore expressions are English. */
  lang?: string;
  /** 0.1–10, browser-defined default is 1. */
  rate?: number;
};

/** True when the browser exposes a usable Web Speech synthesis API. */
export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/**
 * Speaks `text` aloud and resolves once playback ends (or immediately, as a
 * no-op, if speech synthesis isn't supported — callers don't need to feature
 * -detect first). Never rejects: a synthesis error resolves the same as a
 * normal end, since a failed pronunciation playback shouldn't surface as an
 * app error.
 *
 * Cancels any utterance already in flight before starting a new one, so
 * repeat clicks (including on a different card) always restart cleanly
 * instead of overlapping.
 */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!isSpeechSynthesisSupported()) {
    return Promise.resolve();
  }

  const synth = window.speechSynthesis;

  return new Promise((resolve) => {
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang ?? "en-US";
    if (options.rate) utterance.rate = options.rate;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    synth.speak(utterance);
  });
}

/** Stops any in-flight playback without waiting for it to end naturally. */
export function cancelSpeech(): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}
