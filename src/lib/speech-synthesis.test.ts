import { afterEach, describe, expect, it, vi } from "vitest";
import { pickBestVoiceFrom } from "@/lib/speech-synthesis";

describe("pickBestVoiceFrom", () => {
  it("prefers a known female voice over a higher-quality male voice in the same language", () => {
    const voices = [
      { name: "Microsoft David Online (Natural) - English (United States)", lang: "en-US" },
      { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US" },
    ];

    expect(pickBestVoiceFrom(voices, "en-US")?.name).toBe(
      "Microsoft Zira Desktop - English (United States)",
    );
  });

  it("prefers a Natural-labeled voice over a plain default in the same language", () => {
    const voices = [
      { name: "Microsoft David Desktop - English (United States)", lang: "en-US" },
      { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US" },
    ];

    expect(pickBestVoiceFrom(voices, "en-US")?.name).toBe(
      "Microsoft Aria Online (Natural) - English (United States)",
    );
  });

  it("falls through the preference list in priority order", () => {
    const voices = [
      { name: "Generic English Voice", lang: "en-US" },
      { name: "Some Enhanced English Voice", lang: "en-US" },
      { name: "Some Premium English Voice", lang: "en-US" },
    ];

    // Premium ranks above Enhanced in PREFERRED_VOICE_NAME_PATTERNS.
    expect(pickBestVoiceFrom(voices, "en-US")?.name).toBe("Some Premium English Voice");
  });

  it("only considers voices matching the requested language", () => {
    const voices = [
      { name: "Google Deutsch Natural", lang: "de-DE" },
      { name: "Plain English Voice", lang: "en-US" },
    ];

    expect(pickBestVoiceFrom(voices, "en-US")?.name).toBe("Plain English Voice");
  });

  it("matches on language prefix, ignoring region", () => {
    const voices = [{ name: "Some Natural Voice", lang: "en-GB" }];

    expect(pickBestVoiceFrom(voices, "en-US")?.name).toBe("Some Natural Voice");
  });

  it("falls back to any voice in the language when none match a preferred name pattern", () => {
    const voices = [{ name: "Plain English Voice", lang: "en-US" }];

    expect(pickBestVoiceFrom(voices, "en-US")?.name).toBe("Plain English Voice");
  });

  it("uses the existing quality ordering when no known female voice is available", () => {
    const voices = [
      { name: "Microsoft David Desktop - English (United States)", lang: "en-US" },
      { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US" },
    ];

    expect(pickBestVoiceFrom(voices, "en-US")?.name).toBe(
      "Microsoft Guy Online (Natural) - English (United States)",
    );
  });

  it("never selects a known female voice from another language", () => {
    const voices = [
      { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US" },
      { name: "Microsoft Stefan Online (Natural) - German (Germany)", lang: "de-DE" },
    ];

    expect(pickBestVoiceFrom(voices, "de-DE")?.name).toBe(
      "Microsoft Stefan Online (Natural) - German (Germany)",
    );
  });

  it("returns undefined when no voice matches the requested language at all", () => {
    const voices = [{ name: "Google Deutsch Natural", lang: "de-DE" }];

    expect(pickBestVoiceFrom(voices, "en-US")).toBeUndefined();
  });

  it("returns undefined for an empty voice list", () => {
    expect(pickBestVoiceFrom([], "en-US")).toBeUndefined();
  });
});

describe("speech playback", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reuses the audio element unlocked by the first gesture for later programmatic playback", async () => {
    class FakeAudio extends EventTarget {
      static instances: FakeAudio[] = [];
      src = "";
      muted = false;
      playbackRate = 1;
      readonly plays: Array<{ muted: boolean; src: string }> = [];

      constructor(src = "") {
        super();
        this.src = src;
        FakeAudio.instances.push(this);
      }

      pause(): void {}

      play(): Promise<void> {
        this.plays.push({ muted: this.muted, src: this.src });
        return Promise.resolve();
      }
    }

    const documentTarget = new EventTarget();
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { speak } = await import("@/lib/speech-synthesis");

    documentTarget.dispatchEvent(new Event("click"));
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].plays[0]).toMatchObject({ muted: true });

    const playback = speak("Hi!");
    await Promise.resolve();
    FakeAudio.instances[0].dispatchEvent(new Event("ended"));

    await expect(playback).resolves.toBe(true);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].plays.at(-1)).toEqual({ muted: false, src: "/audio/opening-1.mp3" });
  });

  it("lets a microphone gesture unlock audio without replaying the blocked line", async () => {
    let gestureActive = false;

    class FakeAudio extends EventTarget {
      static instances: FakeAudio[] = [];
      src = "";
      muted = false;
      playbackRate = 1;
      unlocked = false;
      readonly successfulPlays: Array<{ muted: boolean; src: string }> = [];

      constructor() {
        super();
        FakeAudio.instances.push(this);
      }

      pause(): void {}

      play(): Promise<void> {
        if (gestureActive) this.unlocked = true;
        if (!this.unlocked) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        this.successfulPlays.push({ muted: this.muted, src: this.src });
        return Promise.resolve();
      }
    }

    class FakeElement {
      closest(selector: string): FakeElement | null {
        return selector === "[data-audio-unlock-exempt]" ? this : null;
      }
    }

    const documentTarget = new EventTarget();
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("Element", FakeElement);
    vi.resetModules();

    const { speakAssertively } = await import("@/lib/speech-synthesis");
    const cleanUp = speakAssertively("Hi!");
    await Promise.resolve();

    const micClick = new Event("click");
    Object.defineProperty(micClick, "target", { value: new FakeElement() });
    gestureActive = true;
    documentTarget.dispatchEvent(micClick);
    gestureActive = false;

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].successfulPlays).toEqual([
      { muted: true, src: "/audio/opening-1.mp3" },
    ]);
    cleanUp();
  });

  it("keeps Emily suppressed until every microphone owner releases", async () => {
    class FakeAudio extends EventTarget {
      static instances: FakeAudio[] = [];
      src = "";
      muted = false;
      playbackRate = 1;
      constructor() {
        super();
        FakeAudio.instances.push(this);
      }
      pause(): void {}
      play(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { acquireMicListening, cancelSpeech, releaseMicListening, speak } = await import(
      "@/lib/speech-synthesis"
    );
    const practiceOwner = acquireMicListening();
    const helpOwner = acquireMicListening();

    releaseMicListening(helpOwner);
    await expect(speak("Hi!")).resolves.toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);

    releaseMicListening(practiceOwner);
    const playback = speak("Hi!");
    expect(FakeAudio.instances).toHaveLength(1);
    cancelSpeech();
    await expect(playback).resolves.toBe(false);
  });

  it("publishes speaking state until playback ends", async () => {
    class FakeAudio extends EventTarget {
      static instances: FakeAudio[] = [];
      src = "";
      muted = false;
      playbackRate = 1;
      constructor() {
        super();
        FakeAudio.instances.push(this);
      }
      pause(): void {}
      play(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { getSpeakingSnapshot, speak, subscribeToSpeaking } = await import("@/lib/speech-synthesis");
    const snapshots: boolean[] = [];
    const unsubscribe = subscribeToSpeaking(() => snapshots.push(getSpeakingSnapshot()));

    const playback = speak("Hi!");
    expect(getSpeakingSnapshot()).toBe(true);
    expect(snapshots).toEqual([true]);

    await Promise.resolve();
    FakeAudio.instances[0].dispatchEvent(new Event("ended"));
    await expect(playback).resolves.toBe(true);
    expect(getSpeakingSnapshot()).toBe(false);
    expect(snapshots).toEqual([true, false]);

    unsubscribe();
  });

  it("releases speaking state immediately when playback is cancelled", async () => {
    class FakeAudio extends EventTarget {
      src = "";
      muted = false;
      playbackRate = 1;
      pause(): void {}
      play(): Promise<void> {
        return new Promise(() => {});
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { cancelSpeech, getSpeakingSnapshot, speak } = await import("@/lib/speech-synthesis");
    const playback = speak("Hi!");
    expect(getSpeakingSnapshot()).toBe(true);

    cancelSpeech();

    expect(getSpeakingSnapshot()).toBe(false);
    await expect(playback).resolves.toBe(false);
  });

  it("does not let a cancelled playback release the newer playback owner", async () => {
    class FakeAudio extends EventTarget {
      static instance: FakeAudio;
      src = "";
      muted = false;
      playbackRate = 1;
      constructor() {
        super();
        FakeAudio.instance = this;
      }
      pause(): void {}
      play(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { getSpeakingSnapshot, speak } = await import("@/lib/speech-synthesis");
    const olderPlayback = speak("Hi!");
    const newerPlayback = speak("Hello!");

    await expect(olderPlayback).resolves.toBe(false);
    expect(getSpeakingSnapshot()).toBe(true);

    FakeAudio.instance.dispatchEvent(new Event("ended"));
    await expect(newerPlayback).resolves.toBe(true);
    expect(getSpeakingSnapshot()).toBe(false);
  });

  it("releases speaking state when playback fails", async () => {
    class FakeAudio extends EventTarget {
      static instance: FakeAudio;
      src = "";
      muted = false;
      playbackRate = 1;
      constructor() {
        super();
        FakeAudio.instance = this;
      }
      pause(): void {}
      play(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { getSpeakingSnapshot, speak } = await import("@/lib/speech-synthesis");
    const playback = speak("A newly generated line");
    await Promise.resolve();
    FakeAudio.instance.dispatchEvent(new Event("error"));

    await expect(playback).resolves.toBe(false);
    expect(getSpeakingSnapshot()).toBe(false);
  });

  it("times out stalled playback and releases speaking state", async () => {
    vi.useFakeTimers();

    class FakeAudio extends EventTarget {
      src = "";
      muted = false;
      playbackRate = 1;
      pause(): void {}
      play(): Promise<void> {
        return new Promise(() => {});
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { getSpeakingSnapshot, speak } = await import("@/lib/speech-synthesis");
    const playback = speak("A stalled generated line");
    expect(getSpeakingSnapshot()).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(getSpeakingSnapshot()).toBe(false);
    await expect(playback).resolves.toBe(false);
  });

  it("does not time out a long line after playback has started", async () => {
    vi.useFakeTimers();

    class FakeAudio extends EventTarget {
      static instance: FakeAudio;
      src = "";
      muted = false;
      playbackRate = 1;
      pauseCalls = 0;
      constructor() {
        super();
        FakeAudio.instance = this;
      }
      pause(): void {
        this.pauseCalls += 1;
      }
      play(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { getSpeakingSnapshot, speak } = await import("@/lib/speech-synthesis");
    const playback = speak("A legitimately long generated line");
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(getSpeakingSnapshot()).toBe(true);
    expect(FakeAudio.instance.pauseCalls).toBe(0);

    FakeAudio.instance.dispatchEvent(new Event("ended"));
    await expect(playback).resolves.toBe(true);
    expect(getSpeakingSnapshot()).toBe(false);
  });

  it("keeps slash-delimited text intact by default", async () => {
    class FakeAudio extends EventTarget {
      static instance: FakeAudio;
      src = "";
      muted = false;
      playbackRate = 1;
      readonly playedSources: string[] = [];
      constructor() {
        super();
        FakeAudio.instance = this;
      }
      pause(): void {}
      play(): Promise<void> {
        this.playedSources.push(this.src);
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { speak } = await import("@/lib/speech-synthesis");
    const playback = speak("上午/下午都可以说");
    await Promise.resolve();

    expect(FakeAudio.instance.playedSources).toEqual([
      "/api/practice/speak?text=%E4%B8%8A%E5%8D%88%2F%E4%B8%8B%E5%8D%88%E9%83%BD%E5%8F%AF%E4%BB%A5%E8%AF%B4",
    ]);
    FakeAudio.instance.dispatchEvent(new Event("ended"));
    await expect(playback).resolves.toBe(true);
  });

  it("splits slash-delimited text only when explicitly requested", async () => {
    vi.useFakeTimers();

    class FakeAudio extends EventTarget {
      static instance: FakeAudio;
      src = "";
      muted = false;
      playbackRate = 1;
      readonly playedSources: string[] = [];
      constructor() {
        super();
        FakeAudio.instance = this;
      }
      pause(): void {}
      play(): Promise<void> {
        this.playedSources.push(this.src);
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { speak } = await import("@/lib/speech-synthesis");
    const playback = speak("上午/下午", { splitOnSlash: true });
    await Promise.resolve();
    expect(FakeAudio.instance.playedSources).toEqual([
      "/api/practice/speak?text=%E4%B8%8A%E5%8D%88",
    ]);

    FakeAudio.instance.dispatchEvent(new Event("ended"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeAudio.instance.playedSources).toEqual([
      "/api/practice/speak?text=%E4%B8%8A%E5%8D%88",
      "/api/practice/speak?text=%E4%B8%8B%E5%8D%88",
    ]);

    FakeAudio.instance.dispatchEvent(new Event("ended"));
    await expect(playback).resolves.toBe(true);
  });
});
