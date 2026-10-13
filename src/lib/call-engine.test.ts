import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_SECONDS,
  CallEngine,
  HANDOFF_GAP_MS,
  WRAP_UP_SECONDS,
  type CallEngineHost,
  type CallLine,
} from "@/lib/call-engine";

function setup() {
  const mic: boolean[] = [];
  const sent: Array<Record<string, unknown>> = [];
  const countdown: number[] = [];
  let lines: readonly CallLine[] = [];
  let ended: readonly CallLine[] | null = null;
  let endCount = 0;
  const host: CallEngineHost = {
    setMicEnabled: (enabled) => mic.push(enabled),
    send: (event) => sent.push(event),
    onLines: (next) => {
      lines = next;
    },
    onCountdown: (seconds) => countdown.push(seconds),
    onFloorChange: () => {},
    onEnded: (final) => {
      ended = final;
      endCount += 1;
    },
  };
  const engine = new CallEngine(host);

  const emit = (type: string, extra: Record<string, unknown> = {}) => engine.handleEvent({ type, ...extra });
  /** One whole Emily line: response + audio start, transcript, response done, audio end. */
  const emilySays = (id: string, text: string) => {
    emit("response.created");
    emit("output_audio_buffer.started");
    emit("response.output_audio_transcript.delta", { item_id: id, delta: text });
    emit("response.done");
    emit("output_audio_buffer.stopped");
  };
  const learnerSays = (id: string, text: string) => {
    emit("input_audio_buffer.speech_started", { item_id: id });
    emit("input_audio_buffer.speech_stopped", { item_id: id });
    emit("input_audio_buffer.committed", { item_id: id });
    if (text) emit("conversation.item.input_audio_transcription.completed", { item_id: id, transcript: text });
  };
  return {
    engine,
    emit,
    emilySays,
    learnerSays,
    mic,
    lastMic: () => mic[mic.length - 1],
    sent,
    countdown,
    responseCreates: () => sent.filter((e) => e.type === "response.create"),
    get lines() {
      return lines;
    },
    get ended() {
      return ended as readonly CallLine[] | null;
    },
    get endCount() {
      return endCount;
    },
  };
}

/** A Call whose opening line is done and whose Handoff Gap has passed. */
function liveCall() {
  const t = setup();
  t.engine.begin();
  t.emilySays("e1", "Hi!");
  vi.advanceTimersByTime(HANDOFF_GAP_MS);
  return t;
}

/** Runs a live Call until the goodbye is about to be due. */
function advanceToWrapUp(t: ReturnType<typeof setup>, extraMs = 0) {
  vi.advanceTimersByTime((CALL_SECONDS - WRAP_UP_SECONDS) * 1000 - HANDOFF_GAP_MS + extraMs);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("opening", () => {
  it("asks Emily to greet first and keeps the microphone closed meanwhile", () => {
    const t = setup();
    t.engine.begin();
    expect(t.sent).toEqual([{ type: "response.create" }]);
    expect(t.lastMic()).toBe(false);
  });

  it("starts the 45 s countdown only after her opening line has finished", () => {
    const t = setup();
    t.engine.begin();
    t.emit("response.created");
    t.emit("output_audio_buffer.started");
    t.emit("response.output_audio_transcript.delta", { item_id: "e1", delta: "Hi there!" });
    t.emit("response.done");

    // Her audio is still playing: no time has been charged to the learner.
    vi.advanceTimersByTime(20_000);
    expect(t.countdown).toEqual([]);

    t.emit("output_audio_buffer.stopped");
    expect(t.countdown).toEqual([CALL_SECONDS]);
    vi.advanceTimersByTime(3_000);
    expect(t.countdown[t.countdown.length - 1]).toBe(CALL_SECONDS - 3);
  });
});

describe("bubbles", () => {
  it("places the learner's Turn before Emily's reply even when its transcript arrives later", () => {
    const t = liveCall();

    t.emit("input_audio_buffer.speech_started", { item_id: "u1" });
    t.emit("input_audio_buffer.speech_stopped", { item_id: "u1" });
    t.emit("input_audio_buffer.committed", { item_id: "u1" });
    t.emit("response.created");
    t.emit("response.output_audio_transcript.delta", { item_id: "e2", delta: "Good, thanks." });
    t.emit("conversation.item.input_audio_transcription.completed", { item_id: "u1", transcript: "I'm good" });

    expect(t.lines.map((l) => [l.role, l.text])).toEqual([
      ["emily", "Hi!"],
      ["learner", "I'm good"],
      ["emily", "Good, thanks."],
    ]);
  });
});

describe("Turn-Taking", () => {
  it("closes the microphone while Emily speaks and for the Handoff Gap after, then reopens it", () => {
    const t = setup();
    t.engine.begin();
    t.emit("response.created");
    t.emit("output_audio_buffer.started");
    expect(t.lastMic()).toBe(false);
    t.emit("response.done");
    t.emit("output_audio_buffer.stopped");
    expect(t.lastMic()).toBe(false);

    vi.advanceTimersByTime(HANDOFF_GAP_MS - 1);
    expect(t.lastMic()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(t.lastMic()).toBe(true);
  });

  it("does not make a Turn or a bubble out of speech heard during her line or the Handoff Gap", () => {
    const t = setup();
    t.engine.begin();
    t.emit("response.created");
    t.emit("output_audio_buffer.started");
    t.learnerSays("u-during", "Excuse me");
    t.emit("response.done");
    t.emit("output_audio_buffer.stopped");
    t.learnerSays("u-gap", "Hello");

    expect(t.lines.filter((l) => l.role === "learner")).toEqual([]);
  });

  it("hears the learner normally once the Handoff Gap is over", () => {
    const t = liveCall();
    t.learnerSays("u1", "Hello");
    expect(t.lines.filter((l) => l.role === "learner").map((l) => l.text)).toEqual(["Hello"]);
  });

  it("closes the microphone again as soon as a reply is under way", () => {
    const t = liveCall();
    expect(t.lastMic()).toBe(true);
    t.emit("input_audio_buffer.committed", { item_id: "u1" });
    t.emit("response.created");
    expect(t.lastMic()).toBe(false);
  });
});

describe("winding down", () => {
  it("has Emily say goodbye with about eight seconds left", () => {
    const t = liveCall();
    t.sent.length = 0;
    advanceToWrapUp(t, -1_000);
    expect(t.sent).toEqual([]);
    vi.advanceTimersByTime(1_500);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ type: "response.create" });
    expect(JSON.stringify(t.sent[0])).toMatch(/goodbye/i);
  });

  it("says goodbye only once", () => {
    const t = liveCall();
    t.sent.length = 0;
    advanceToWrapUp(t, 1_000);
    t.emilySays("e2", "Bye!");
    vi.advanceTimersByTime(HANDOFF_GAP_MS + 3_000);
    expect(t.responseCreates()).toHaveLength(1);
  });

  it("holds the goodbye while the learner is speaking, then says it", () => {
    const t = liveCall();
    t.sent.length = 0;
    advanceToWrapUp(t, -1_000);
    t.emit("input_audio_buffer.speech_started", { item_id: "u1" });
    vi.advanceTimersByTime(3_000);
    expect(t.sent).toEqual([]);
    t.emit("input_audio_buffer.speech_stopped", { item_id: "u1" });
    t.emit("input_audio_buffer.committed", { item_id: "u1" });
    // The server answers the learner first; no second response is started on top of it.
    vi.advanceTimersByTime(500);
    t.emit("response.created");
    expect(t.sent).toEqual([]);
    t.emit("response.done");
    t.emit("output_audio_buffer.stopped");
    expect(t.responseCreates()).toHaveLength(1);
  });

  it("ends right away at zero when Emily is silent", () => {
    const t = liveCall();
    advanceToWrapUp(t, 1_000);
    t.emilySays("e2", "Bye!");
    expect(t.ended).toBeNull();
    vi.advanceTimersByTime(CALL_SECONDS * 1000);
    expect(t.ended).not.toBeNull();
    expect(t.endCount).toBe(1);
  });

  it("waits for Emily's current line at zero and never shows a negative countdown", () => {
    const t = liveCall();
    advanceToWrapUp(t, 1_000);
    // Her goodbye is still playing when time runs out.
    t.emit("response.created");
    t.emit("output_audio_buffer.started");
    vi.advanceTimersByTime(15_000);
    expect(t.ended).toBeNull();
    expect(t.countdown[t.countdown.length - 1]).toBe(0);
    expect(Math.min(...t.countdown)).toBe(0);

    t.emit("response.done");
    t.emit("output_audio_buffer.stopped");
    expect(t.ended).not.toBeNull();
  });

  it("ends immediately when the learner hangs up", () => {
    const t = liveCall();
    t.engine.hangUp();
    expect(t.lastMic()).toBe(false);
    expect(t.ended).not.toBeNull();
  });

  it("waits briefly for a learner transcript still in flight, then drops empty bubbles", () => {
    const t = liveCall();
    t.emit("input_audio_buffer.committed", { item_id: "u1" });
    t.engine.hangUp();
    expect(t.ended).toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(t.ended?.map((l) => l.role)).toEqual(["emily"]);
  });

  it("ends only once", () => {
    const t = liveCall();
    t.engine.hangUp();
    t.engine.hangUp();
    vi.advanceTimersByTime(60_000);
    expect(t.endCount).toBe(1);
  });
});
