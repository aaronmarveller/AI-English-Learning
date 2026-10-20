import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIO_MANIFEST } from "@/lib/audio-manifest";
import {
  CHECKIN_EXPRESSIONS,
  CLOSING_EXPRESSIONS,
  GREETING_EXPRESSIONS,
  RESPONSE_COMBO,
  RESPONSE_STEPS,
} from "@/content/explore";

const CONTAINS_CHINESE = /[㐀-鿿]/u;

describe("Audio manifest — every pronounceable Explore text has an entry", () => {
  const manifestTexts = new Set(AUDIO_MANIFEST.map((entry) => entry.text));

  const exploreTexts = [
    ...GREETING_EXPRESSIONS.flatMap((e) => [e.expression, ...(e.pronunciationTexts ?? [])]),
    ...CHECKIN_EXPRESSIONS.map((e) => e.expression),
    ...CLOSING_EXPRESSIONS.map((e) => e.expression),
    ...RESPONSE_STEPS.map((step) => step.expression),
    RESPONSE_COMBO.expression,
  ];

  for (const text of exploreTexts) {
    it(`"${text}" has a pre-generated-audio manifest entry`, () => {
      expect(manifestTexts.has(text)).toBe(true);
    });
  }

  it("keeps Chinese out of the manifest (English-only, matched by exact text)", () => {
    for (const entry of AUDIO_MANIFEST) {
      expect(entry.text, `a manifest entry is not English: ${entry.text}`).not.toMatch(CONTAINS_CHINESE);
    }
  });
});

describe("Audio manifest — generated file integrity", () => {
  const manifestFileNames = AUDIO_MANIFEST.map((entry) => `${entry.id}.mp3`).sort();
  const generatedFileNames = readdirSync(resolve(process.cwd(), "public/audio"))
    .filter((fileName) => fileName.endsWith(".mp3"))
    .sort();
  const manifestFileNameSet = new Set(manifestFileNames);
  const generatedFileNameSet = new Set(generatedFileNames);

  it("has a generated MP3 for every manifest entry", () => {
    expect(manifestFileNames.filter((fileName) => !generatedFileNameSet.has(fileName))).toEqual([]);
  });

  it("has no orphan MP3 outside the manifest", () => {
    expect(generatedFileNames.filter((fileName) => !manifestFileNameSet.has(fileName))).toEqual([]);
  });
});
