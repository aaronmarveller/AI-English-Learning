/**
 * One-off, manually run voice-selection tool for Emily (issue #24).
 *
 * Every run can make eight billed TTS calls. The generated comparison files
 * live in the git-ignored `tts-voice-samples/` directory and are never part of
 * the app's pre-generated-audio manifest or its runtime fallback chain.
 *
 * Run with `npm run sample:voices`. Provider, credentials, and model come from
 * `TTS_PROVIDER`, `OPENAI_API_KEY`, and `OPENAI_TTS_SAMPLE_MODEL` respectively.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { loadEnvLocal } from "./env";

const SAMPLE_DIR = resolve(process.cwd(), "tts-voice-samples");
const SAMPLE_VOICES = ["nova", "coral", "sage", "shimmer"] as const;

type SampleVoice = (typeof SAMPLE_VOICES)[number];

interface TtsSampleProvider {
  name: string;
  ensureConfigured(): void;
  synthesize(text: string, voice: SampleVoice): Promise<ArrayBuffer>;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local (see .env.example) and re-run.`);
  }
  return value;
}

const openaiProvider: TtsSampleProvider = {
  name: "openai",
  ensureConfigured() {
    requireEnv("OPENAI_API_KEY");
  },
  async synthesize(text, voice) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_SAMPLE_MODEL?.trim() || "gpt-4o-mini-tts",
        voice,
        input: text,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI TTS request failed: ${response.status} ${response.statusText} ${detail}`);
    }

    return response.arrayBuffer();
  },
};

const PROVIDERS: Record<string, TtsSampleProvider> = {
  openai: openaiProvider,
};

function selectProvider(): TtsSampleProvider {
  const name = process.env.TTS_PROVIDER?.trim() || "openai";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown TTS_PROVIDER "${name}". Supported: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return provider;
}

async function main(): Promise<void> {
  loadEnvLocal();

  let provider: TtsSampleProvider;
  try {
    provider = selectProvider();
    // Validate credentials before creating the directory, so a missing key
    // cannot leave an output folder or half-finished sample set behind.
    provider.ensureConfigured();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const samples = {
    en: GREETING_SOMEBODY_LESSON.checkinLines[0].en,
    zh: GREETING_SOMEBODY_LESSON.chineseHelp.checkin.meaning,
  };

  mkdirSync(SAMPLE_DIR, { recursive: true });
  console.log(`Generating 8 billed bilingual samples via "${provider.name}" into tts-voice-samples/`);

  for (const voice of SAMPLE_VOICES) {
    for (const [language, text] of Object.entries(samples) as Array<[keyof typeof samples, string]>) {
      process.stdout.write(`  [generate] ${voice}-${language}.mp3 ... `);
      try {
        const audio = await provider.synthesize(text, voice);
        writeFileSync(resolve(SAMPLE_DIR, `${voice}-${language}.mp3`), Buffer.from(audio));
        console.log("done");
      } catch (error) {
        console.log("FAILED");
        console.error(`             ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
        return;
      }
    }
  }
}

void main();
