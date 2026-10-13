/**
 * The rules of a live Call with Emily, independent of any transport.
 *
 * The browser glue (src/lib/realtime-call.ts) feeds this engine the
 * Realtime API's server events and carries out what it asks for through
 * {@link CallEngineHost}: opening or closing the microphone, sending client
 * events, and reporting the bubbles, the countdown and the end of the Call.
 * Keeping the rules here makes Turn-Taking, the Handoff Gap, the 45-second
 * limit and the wind-down testable with fake timers and no network.
 *
 * Vocabulary is CONTEXT.md's: Call, Turn, Turn-Taking, Handoff Gap.
 */

export const CALL_SECONDS = 45;
/** With this many seconds left Emily wraps up and says goodbye. */
export const WRAP_UP_SECONDS = 8;
/** The beat after Emily's line in which the floor belongs to neither side. */
export const HANDOFF_GAP_MS = 500;
/** How long a hang-up waits for a learner transcript that is still in flight. */
export const TRANSCRIPT_GRACE_MS = 1500;
/** Safety net: a Call whose time is up never waits longer than this for Emily to finish. */
const FINISH_LINE_TIMEOUT_MS = 20_000;
const TICK_MS = 250;

const GOODBYE_INSTRUCTIONS =
  "The call is about to end. Say a very short, warm goodbye to the learner (one sentence) that fits this greeting practice, then stop. Do not ask a question.";

export type CallLine = { id: string; role: "learner" | "emily"; text: string };

/** Who holds the floor: Emily, nobody (the Handoff Gap), or the learner. */
export type Floor = "emily" | "handoff" | "learner";

export type CallEngineHost = {
  /** Open or close the learner's microphone. Only called when the state changes. */
  setMicEnabled(enabled: boolean): void;
  /** Send a client event to the Realtime API. */
  send(event: Record<string, unknown>): void;
  /** The Call's bubbles, in order; called on every change. */
  onLines(lines: readonly CallLine[]): void;
  /** Seconds left, 45 down to 0; called when the displayed value changes. */
  onCountdown(seconds: number): void;
  onFloorChange(floor: Floor): void;
  /** The Call is over. Called exactly once, with the final bubbles. */
  onEnded(lines: readonly CallLine[]): void;
};

export type ServerEvent = { type: string; [key: string]: unknown };

export class CallEngine {
  private lines: CallLine[] = [];
  /** Items the learner "said" while Emily held the floor: no bubble, no Turn. */
  private ignoredItems = new Set<string>();

  /** A response was requested or is being generated. */
  private responseActive = false;
  /** Emily's audio is audibly playing. */
  private audioPlaying = false;
  private inHandoff = false;
  private learnerSpeaking = false;
  /** The learner's Turn is committed but the server has not started answering yet. */
  private turnPending = false;

  private handoffTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private finishLineTimer: ReturnType<typeof setTimeout> | null = null;

  private endsAt: number | null = null;
  private lastRemaining: number | null = null;
  private timeUp = false;
  private goodbyeSent = false;
  private ending = false;
  private ended = false;

  private micEnabled: boolean | null = null;
  private floor: Floor | null = null;

  constructor(private readonly host: CallEngineHost) {}

  /** The data channel is open: Emily opens the Call with a greeting. */
  begin(): void {
    this.requestResponse();
  }

  /** The learner hung up. Ends the Call immediately. */
  hangUp(): void {
    this.finish();
  }

  /** Release timers without reporting an end (the page went away). */
  dispose(): void {
    this.ended = true;
    this.clearTimers();
  }

  handleEvent(event: ServerEvent): void {
    if (this.ended) return;
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        if (!this.emilyHasFloor()) this.learnerSpeaking = true;
        break;
      case "input_audio_buffer.speech_stopped":
        this.learnerSpeaking = false;
        break;
      case "input_audio_buffer.committed": {
        const id = String(event.item_id);
        if (this.emilyHasFloor() || this.inHandoff || this.ending) {
          this.ignoredItems.add(id);
          break;
        }
        this.turnPending = true;
        // Reserve the learner's bubble now so it sits before Emily's reply,
        // even though its transcript arrives later.
        this.upsertLine(id, "learner", (text) => text);
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const id = String(event.item_id);
        if (this.ignoredItems.has(id)) break;
        this.upsertLine(id, "learner", () => String(event.transcript ?? "").trim());
        if (this.ending) this.maybeFinalize();
        break;
      }
      case "response.created":
        this.turnPending = false;
        this.responseActive = true;
        this.cancelHandoff();
        this.refresh();
        break;
      case "response.output_audio_transcript.delta":
        this.upsertLine(String(event.item_id), "emily", (text) => text + String(event.delta ?? ""));
        break;
      case "response.output_audio_transcript.done":
        if (typeof event.transcript === "string") {
          this.upsertLine(String(event.item_id), "emily", () => String(event.transcript));
        }
        break;
      case "output_audio_buffer.started":
        this.audioPlaying = true;
        this.cancelHandoff();
        this.refresh();
        break;
      case "response.done":
        this.responseActive = false;
        if (!this.audioPlaying) this.emilyFinishedLine();
        else this.refresh();
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.audioPlaying = false;
        if (!this.responseActive) this.emilyFinishedLine();
        else this.refresh();
        break;
      case "error":
        // A response we asked for may never come; don't hold the floor forever.
        if (this.responseActive && !this.audioPlaying) {
          this.responseActive = false;
          this.emilyFinishedLine();
        }
        break;
    }
  }

  // --- Turn-Taking ------------------------------------------------------

  private emilyHasFloor(): boolean {
    return this.responseActive || this.audioPlaying;
  }

  private requestResponse(instructions?: string): void {
    this.responseActive = true;
    this.refresh();
    this.host.send(
      instructions ? { type: "response.create", response: { instructions } } : { type: "response.create" },
    );
  }

  /** Emily's line (and its audio) is over: the Handoff Gap begins. */
  private emilyFinishedLine(): void {
    if (this.ending) {
      this.refresh();
      this.maybeFinalize();
      return;
    }
    if (this.endsAt === null) this.startCountdown();
    if (this.timeUp) {
      this.finish();
      return;
    }
    this.cancelHandoff();
    this.inHandoff = true;
    this.refresh();
    this.handoffTimer = setTimeout(() => {
      this.handoffTimer = null;
      this.inHandoff = false;
      this.refresh();
    }, HANDOFF_GAP_MS);
    this.maybeSayGoodbye();
  }

  private cancelHandoff(): void {
    if (this.handoffTimer) clearTimeout(this.handoffTimer);
    this.handoffTimer = null;
    this.inHandoff = false;
  }

  /** Recomputes who holds the floor and tells the host what changed. */
  private refresh(): void {
    const floor: Floor = this.emilyHasFloor() ? "emily" : this.inHandoff ? "handoff" : "learner";
    const micEnabled = floor === "learner" && !this.ending;
    if (micEnabled !== this.micEnabled) {
      this.micEnabled = micEnabled;
      this.host.setMicEnabled(micEnabled);
    }
    if (floor !== this.floor) {
      this.floor = floor;
      this.host.onFloorChange(floor);
    }
  }

  // --- The 45-second limit ----------------------------------------------

  private startCountdown(): void {
    this.endsAt = Date.now() + CALL_SECONDS * 1000;
    this.tick();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    if (this.endsAt === null || this.ending) return;
    const remaining = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    if (remaining !== this.lastRemaining) {
      this.lastRemaining = remaining;
      this.host.onCountdown(remaining);
    }
    if (remaining <= WRAP_UP_SECONDS) this.maybeSayGoodbye();
    if (remaining === 0 && !this.timeUp) {
      this.timeUp = true;
      if (this.emilyHasFloor() || this.turnPending) {
        // Never cut her off mid-line, nor end before she has answered a Turn
        // the learner just finished: end once she has finished.
        this.finishLineTimer = setTimeout(() => this.finish(), FINISH_LINE_TIMEOUT_MS);
      } else {
        this.finish();
      }
    }
  }

  /** Emily wraps up — but never while the learner is speaking or a reply is already under way. */
  private maybeSayGoodbye(): void {
    if (this.goodbyeSent || this.ending || this.endsAt === null) return;
    if (this.lastRemaining === null || this.lastRemaining > WRAP_UP_SECONDS) return;
    if (this.emilyHasFloor() || this.learnerSpeaking || this.turnPending) return;
    this.goodbyeSent = true;
    this.cancelHandoff();
    this.requestResponse(GOODBYE_INSTRUCTIONS);
  }

  // --- Ending -----------------------------------------------------------

  private finish(): void {
    if (this.ending || this.ended) return;
    this.ending = true;
    this.clearTimers();
    this.refresh();
    if (this.hasPendingTranscript()) {
      this.graceTimer = setTimeout(() => this.finalize(), TRANSCRIPT_GRACE_MS);
    } else {
      this.finalize();
    }
  }

  private hasPendingTranscript(): boolean {
    return this.lines.some((l) => l.role === "learner" && l.text === "" && !this.ignoredItems.has(l.id));
  }

  private maybeFinalize(): void {
    if (this.ending && !this.hasPendingTranscript()) this.finalize();
  }

  private finalize(): void {
    if (this.ended) return;
    this.ended = true;
    this.clearTimers();
    this.lines = this.lines.filter((l) => l.text !== "");
    this.host.onLines(this.lines);
    this.host.onEnded(this.lines);
  }

  private clearTimers(): void {
    for (const timer of [this.handoffTimer, this.graceTimer, this.finishLineTimer]) {
      if (timer) clearTimeout(timer);
    }
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.handoffTimer = this.graceTimer = this.finishLineTimer = null;
    this.tickTimer = null;
  }

  // --- Bubbles ----------------------------------------------------------

  private upsertLine(id: string, role: CallLine["role"], update: (previous: string) => string): void {
    const index = this.lines.findIndex((l) => l.id === id);
    if (index === -1) {
      this.lines = [...this.lines, { id, role, text: update("") }];
    } else {
      const next = [...this.lines];
      next[index] = { ...next[index], text: update(next[index].text) };
      this.lines = next;
    }
    this.host.onLines(this.lines);
  }
}
