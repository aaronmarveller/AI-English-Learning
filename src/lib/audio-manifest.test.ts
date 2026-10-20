import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIO_MANIFEST, EXPLORE_AUDIO_ENTRIES, GUIDED_PRACTICE_AUDIO_ENTRIES } from "@/lib/audio-manifest";
import { EXPLORE_SECTIONS, EXPLORE_SECTION_ORDER } from "@/content/explore";
import { ASSEMBLED_RESPONSES, SITUATIONS } from "@/content/guided-practice";

const CONTAINS_CHINESE = /[㐀-鿿]/u;

const EXPLORE_LINES = EXPLORE_SECTION_ORDER.flatMap((key) =>
  [...EXPLORE_SECTIONS[key].main, ...EXPLORE_SECTIONS[key].more].flatMap((expression) =>
    expression.lines.map((text) => ({ expressionId: expression.id, text })),
  ),
);

describe("Audio manifest — Explore coverage", () => {
  it("has exactly 25 Explore entries", () => {
    expect(EXPLORE_AUDIO_ENTRIES).toHaveLength(25);
    expect(EXPLORE_LINES).toHaveLength(25);
  });

  it("has an entry for every Explore line, matched by exact text, and nothing else", () => {
    const manifestTexts = new Set(EXPLORE_AUDIO_ENTRIES.map((e) => e.text));
    expect(EXPLORE_LINES.filter((line) => !manifestTexts.has(line.text))).toEqual([]);
    expect(manifestTexts).toEqual(new Set(EXPLORE_LINES.map((l) => l.text)));
  });

  it("uses the expression id, splitting the time-based card into three greeting ids", () => {
    const ids = AUDIO_MANIFEST.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["greeting-good-morning", "greeting-good-afternoon", "greeting-good-evening"]));
    expect(ids).not.toContain("greeting-time-based");
    for (const expressionId of new Set(EXPLORE_LINES.map((l) => l.expressionId))) {
      if (expressionId === "greeting-time-based") continue;
      expect(ids).toContain(expressionId);
    }
  });
});

describe("Audio manifest — Guided Practice coverage", () => {
  it("covers both Situation greetings and every assembled reply", () => {
    const manifestTexts = new Set(AUDIO_MANIFEST.map((e) => e.text));
    const spoken = [...SITUATIONS.map((s) => s.greeting), ...ASSEMBLED_RESPONSES.map((r) => r.text)];
    expect(spoken.filter((text) => !manifestTexts.has(text))).toEqual([]);
  });

  it("adds only the 2 greetings and 4 multi-expression replies", () => {
    expect(GUIDED_PRACTICE_AUDIO_ENTRIES.map((e) => e.id)).toEqual([
      "guided-greeting-coffee-shop",
      "guided-greeting-neighbor",
      "guided-response-ra",
      "guided-response-rb",
      "guided-response-ab",
      "guided-response-rab",
    ]);
  });
});

describe("Audio manifest — entries", () => {
  it("has unique ids and unique texts", () => {
    expect(new Set(AUDIO_MANIFEST.map((e) => e.id)).size).toBe(AUDIO_MANIFEST.length);
    expect(new Set(AUDIO_MANIFEST.map((e) => e.text)).size).toBe(AUDIO_MANIFEST.length);
  });

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
