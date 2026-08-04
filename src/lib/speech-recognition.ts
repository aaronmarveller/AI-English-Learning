/**
 * Speech-recognition adapter (spec.md "三个适配层" > 语音识别; ticket 09 — "语音
 * 识别被封装在适配层后，页面不直接依赖具体浏览器接口；适配层对外暴露能力探测").
 *
 * This ticket only wires the browser Web Speech API (`window.SpeechRecognition`
 * / `window.webkitSpeechRecognition`). The planned replacement — cloud
 * realtime ASR over WebSocket (spec.md's "三个适配层" table) — swaps in behind
 * this same `startListening()` seam without any caller changing: nothing
 * outside this module may touch `SpeechRecognition`, `webkitSpeechRecognition`,
 * `onresult`, `onerror`, or `onend` directly.
 *
 * TypeScript's bundled `lib.dom.d.ts` ships the result-shape interfaces
 * (`SpeechRecognitionAlternative`, `SpeechRecognitionResult`,
 * `SpeechRecognitionResultList`) but not the recognizer interface itself, its
 * events, or the `window.SpeechRecognition`/`webkitSpeechRecognition`
 * constructors — the Web Speech API spec is still unofficial — so this module
 * declares the minimal shapes it needs locally instead of assuming a global
 * type exists.
 */

/** The subset of the SpeechRecognition instance interface this adapter drives. */
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  /**
   * The Web Speech API's own error vocabulary (e.g. "not-allowed",
   * "no-speech", "network", "aborted") — see
   * https://developer.mozilla.org/docs/Web/API/SpeechRecognitionErrorEvent/error.
   * Permission denial is reported here, not as a separate event type, so
   * `startListening`'s error path is the one and only place that checks it.
   */
  error: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** Recognition language: fixed at en-US since all Practice conversation input is English. */
const RECOGNITION_LANG = "en-US";

/**
 * Distinct failure reasons a caller may want to branch on. "not-allowed"
 * covers both the API's "not-allowed" and "service-not-allowed" codes — both
 * mean the learner (or an OS-level policy) denied microphone access, which is
 * the one case the ticket requires a caller to explain differently ("麦克风
 * 权限被拒绝...自动切换到文字输入并说明原因"). Everything else collapses to
 * "other" since no other reason needs distinct handling today.
 */
export type SpeechRecognitionErrorReason = "not-allowed" | "no-speech" | "network" | "aborted" | "other";

export type StartListeningCallbacks = {
  /** Fired for both interim and final results; `isFinal` tells the caller which. */
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (reason: SpeechRecognitionErrorReason, rawError: string) => void;
  onEnd: () => void;
};

export type ListeningController = {
  /** Stops listening early; safe to call even after recognition has already ended. */
  stop: () => void;
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/** True when the browser exposes a usable Web Speech recognition API. */
export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== undefined;
}

function toErrorReason(rawError: string): SpeechRecognitionErrorReason {
  switch (rawError) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "other";
  }
}

/**
 * Starts listening for English speech and streams results/errors/end to
 * `callbacks` — the caller never touches the raw recognizer. Returns a
 * controller whose `stop()` ends listening early (e.g. the learner switches
 * to text mode mid-listen).
 *
 * Callers should feature-detect first via `isSpeechRecognitionSupported()`;
 * calling this when unsupported reports an "other" error on the next
 * microtask instead of throwing, so a caller that forgets the check still
 * fails soft.
 */
export function startListening(callbacks: StartListeningCallbacks): ListeningController {
  const Recognition = getRecognitionConstructor();
  if (!Recognition) {
    queueMicrotask(() => callbacks.onError("other", "unsupported"));
    return { stop: () => {} };
  }

  const recognition = new Recognition();
  recognition.lang = RECOGNITION_LANG;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const result = event.results[event.resultIndex];
    if (!result) return;
    const transcript = result[0]?.transcript ?? "";
    callbacks.onResult(transcript, result.isFinal);
  };

  recognition.onerror = (event) => {
    callbacks.onError(toErrorReason(event.error), event.error);
  };

  recognition.onend = () => {
    callbacks.onEnd();
  };

  recognition.start();

  return {
    stop: () => recognition.stop(),
  };
}
