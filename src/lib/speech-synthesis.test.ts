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


describe("speak", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

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

  it("plays the pre-generated file when the text is in the audio manifest", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { AUDIO_MANIFEST } = await import("@/lib/audio-manifest");
    const { speak } = await import("@/lib/speech-synthesis");
    const entry = AUDIO_MANIFEST[0];
    const playback = speak(entry.text);
    await Promise.resolve();

    expect(FakeAudio.instance.playedSources).toEqual([`/audio/${entry.id}.mp3`]);
    FakeAudio.instance.dispatchEvent(new Event("ended"));
    await expect(playback).resolves.toBe(true);
  });

  it("resolves false, without throwing, when there is no pre-generated file and no browser synthesis", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { speak } = await import("@/lib/speech-synthesis");
    await expect(speak("A sentence that has no recording.")).resolves.toBe(false);
  });

  it("keeps slash-delimited text intact by default", async () => {
    const spoken: string[] = [];
    class FakeUtterance {
      lang = "";
      voice: unknown = null;
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    vi.stubGlobal("window", {
      speechSynthesis: {
        getVoices: () => [{ name: "Test", lang: "zh-CN" }],
        cancel: () => {},
        speak: (utterance: FakeUtterance) => {
          spoken.push(utterance.text);
          utterance.onend?.();
        },
      },
      SpeechSynthesisUtterance: FakeUtterance,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { speak } = await import("@/lib/speech-synthesis");
    await speak("上午/下午都可以说", { lang: "zh-CN" });
    expect(spoken).toEqual(["上午/下午都可以说"]);
  });

  it("splits slash-delimited text only when explicitly requested", async () => {
    vi.useFakeTimers();
    const spoken: string[] = [];
    class FakeUtterance {
      lang = "";
      voice: unknown = null;
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    vi.stubGlobal("window", {
      speechSynthesis: {
        getVoices: () => [{ name: "Test", lang: "zh-CN" }],
        cancel: () => {},
        speak: (utterance: FakeUtterance) => {
          spoken.push(utterance.text);
          utterance.onend?.();
        },
      },
      SpeechSynthesisUtterance: FakeUtterance,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("Audio", FakeAudio);
    vi.resetModules();

    const { speak } = await import("@/lib/speech-synthesis");
    const playback = speak("上午/下午", { lang: "zh-CN", splitOnSlash: true });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(playback).resolves.toBe(true);
    expect(spoken).toEqual(["上午", "下午"]);
  });
});
