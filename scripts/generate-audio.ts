/**
 * Pre-generated audio for Emily's fixed lines and Explore's expressions
 * (ticket 13; spec.md user story 85: "Emily 的固定台词能预生成成音频文件").
 *
 * Iterates src/lib/audio-manifest.ts (the single source of truth for what
 * counts as "fixed" text — see that file's doc comment for why Practice's
 * live-generated conversation replies are deliberately NOT in scope here)
 * and writes `public/audio/<id>.mp3` for each entry via a TTS provider.
 * Already-generated files are skipped, so re-running only fills in gaps
 * (new manifest entries, or files deleted to force a re-generate) instead
 * of re-paying for unchanged audio.
 *
 * Vendor-agnostic by design (ticket 13 DoD: "生成脚本厂商无关，通过环境变量
 * 选择供应商与密钥"): providers implement the narrow `TtsProvider` interface
 * below; `TTS_PROVIDER` picks which one runs. Only "openai" is implemented
 * for this phase (spec.md "三个适配层" pattern: one concrete choice now,
 * swappable later by adding another provider here — the runtime consumer,
 * src/lib/speech-synthesis.ts, never knows which provider produced a file).
 *
 * This script itself always needs a real provider key to do anything useful
 * — that's expected, distinct from the *runtime* requirement (ticket 13 DoD:
 * "未配置供应商密钥时全程降级") that the APP must still work with zero
 * pre-generated files. That degradation lives in speech-synthesis.ts, not
 * here.
 *
 * Manual only, like ticket 12's eval:judgment — not wired into any
 * automated pipeline, since every run is billed API usage. Run by hand:
 *
 *   npm run generate:audio
 *
 * Requires OPENAI_API_KEY (and optionally TTS_PROVIDER, OPENAI_TTS_MODEL,
 * OPENAI_TTS_VOICE), read from .env.local (see .env.example) or the
 * environment.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUDIO_MANIFEST } from "@/lib/audio-manifest";
import { loadEnvLocal } from "./env";

const AUDIO_DIR = resolve(process.cwd(), "public/audio");

interface TtsProvider {
  name: string;
  /** Throws if required env vars (e.g. the API key) aren't set. Called once
   * before the generation loop starts, so a missing key fails fast with one
   * message instead of once per manifest entry. */
  ensureConfigured(): void;
  /** Synthesizes `text` to MP3 bytes, or throws with a message safe to print (never includes the API key). */
  synthesize(text: string): Promise<ArrayBuffer>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local (see .env.example) and re-run.`);
  }
  return value;
}

const openaiProvider: TtsProvider = {
  name: "openai",
  ensureConfigured() {
    requireEnv("OPENAI_API_KEY");
  },
  async synthesize(text) {
    const apiKey = requireEnv("OPENAI_API_KEY");
    const model = process.env.OPENAI_TTS_MODEL ?? "tts-1";
    const voice = process.env.OPENAI_TTS_VOICE ?? "alloy";

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, voice, input: text, response_format: "mp3" }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI TTS request failed: ${response.status} ${response.statusText} ${detail}`);
    }

    return response.arrayBuffer();
  },
};

const PROVIDERS: Record<string, TtsProvider> = {
  openai: openaiProvider,
};

function selectProvider(): TtsProvider {
  const name = process.env.TTS_PROVIDER ?? "openai";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `Unknown TTS_PROVIDER "${name}". Supported: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return provider;
}

async function main(): Promise<void> {
  loadEnvLocal();

  let provider: TtsProvider;
  try {
    provider = selectProvider();
    provider.ensureConfigured();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  mkdirSync(AUDIO_DIR, { recursive: true });

  console.log(
    `Generating up to ${AUDIO_MANIFEST.length} audio file(s) via "${provider.name}" into public/audio/\n`,
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of AUDIO_MANIFEST) {
    const filePath = resolve(AUDIO_DIR, `${entry.id}.mp3`);
    if (existsSync(filePath)) {
      console.log(`  [skip]     ${entry.id} (already exists)`);
      skipped++;
      continue;
    }

    process.stdout.write(`  [generate] ${entry.id} ... `);
    try {
      const audio = await provider.synthesize(entry.text);
      writeFileSync(filePath, Buffer.from(audio));
      console.log("done");
      generated++;
    } catch (error) {
      console.log("FAILED");
      console.error(`             ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  console.log(`\n${generated} generated, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main();
