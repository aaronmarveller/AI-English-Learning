import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIO_MANIFEST } from "@/lib/audio-manifest";

const CONTAINS_CHINESE = /[㐀-鿿]/u;

// TODO(#85): once the manifest is rebuilt from src/content/explore.ts, assert
// there that every spoken Explore line has a manifest entry (25 in total).
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
