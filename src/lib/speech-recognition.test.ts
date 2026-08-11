import { afterEach, describe, expect, it, vi } from "vitest";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = ""; continuous = false; interimResults = false; maxAlternatives = 0;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  ended = false;
  stopCalls = 0;
  constructor() { FakeRecognition.instances.push(this); }
  start() {}
  /** Real WebKit builds reject stop() once a session has already ended. */
  stop() { this.stopCalls += 1; if (this.ended) throw new Error("recognition has already ended"); this.end(); }
  abort() { this.stop(); }
  end() { this.ended = true; this.onend?.(); }
  result(text: string, isFinal = true) { this.onresult?.({ resultIndex: 0, results: Object.assign([Object.assign([{ transcript: text }], { isFinal })], { length: 1 }) as unknown as SpeechRecognitionResultList }); }
  error(error: string) { this.onerror?.({ error }); }
}

const noopCallbacks = { onResult: () => {}, onError: () => {}, onEnd: () => {} };

/** Passing `null` models a browser with no Web Speech recognition at all. */
async function importWithRecognition(constructor: unknown = FakeRecognition) {
  vi.stubGlobal("window", constructor ? { SpeechRecognition: constructor } : {});
  return import("@/lib/speech-recognition");
}

describe("startListening", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); FakeRecognition.instances = []; });

  it("closes the recognizer itself once a final result lands", async () => {
    const { startListening } = await importWithRecognition();
    startListening(noopCallbacks);
    const recognition = FakeRecognition.instances[0];
    recognition.result("Hi there");
    expect(recognition.ended).toBe(false); // deferred, not reentrant to the result dispatch
    await Promise.resolve();
    expect(recognition.ended).toBe(true);
  });

  it("never forwards stop() to a recognizer that already ended", async () => {
    // The iOS failure this guards: a learner tapping the mic for their next
    // turn used to stop a session the browser had already closed, which some
    // WebKit builds throw on.
    const { startListening } = await importWithRecognition();
    const controller = startListening(noopCallbacks);
    const recognition = FakeRecognition.instances[0];
    recognition.end();
    expect(() => controller.stop()).not.toThrow();
    expect(recognition.stopCalls).toBe(0);
  });

  it("stops a live recognizer exactly once however often the caller asks", async () => {
    const { startListening } = await importWithRecognition();
    const controller = startListening(noopCallbacks);
    controller.stop();
    controller.stop();
    expect(FakeRecognition.instances[0].stopCalls).toBe(1);
  });

  it("listens in English by default and in the language the caller asks for", async () => {
    const { startListening, CHINESE_RECOGNITION_LANG, ENGLISH_RECOGNITION_LANG } = await importWithRecognition();
    startListening(noopCallbacks);
    expect(FakeRecognition.instances[0].lang).toBe(ENGLISH_RECOGNITION_LANG);
    startListening(noopCallbacks, { lang: CHINESE_RECOGNITION_LANG });
    expect(FakeRecognition.instances[1].lang).toBe(CHINESE_RECOGNITION_LANG);
  });

  it("reports an unsupported browser as an error instead of throwing", async () => {
    const { startListening, isSpeechRecognitionSupported } = await importWithRecognition(null);
    expect(isSpeechRecognitionSupported()).toBe(false);
    const reasons: string[] = [];
    expect(() => startListening({ ...noopCallbacks, onError: (reason) => reasons.push(reason) })).not.toThrow();
    await Promise.resolve();
    expect(reasons).toEqual(["other"]);
  });
});
