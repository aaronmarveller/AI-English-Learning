import { describe, expect, it } from "vitest";
import { pickBestVoiceFrom } from "@/lib/speech-synthesis";

describe("pickBestVoiceFrom", () => {
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

  it("returns undefined when no voice matches the requested language at all", () => {
    const voices = [{ name: "Google Deutsch Natural", lang: "de-DE" }];

    expect(pickBestVoiceFrom(voices, "en-US")).toBeUndefined();
  });

  it("returns undefined for an empty voice list", () => {
    expect(pickBestVoiceFrom([], "en-US")).toBeUndefined();
  });
});
