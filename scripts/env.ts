import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads `.env.local` into `process.env` for standalone scripts run via
 * `tsx` (Next's own automatic `.env.local` loading only applies to the
 * `next` CLI, not scripts run outside it). Shared by scripts/eval-judgment.ts
 * (ticket 12) and scripts/generate-audio.ts (ticket 13) — both need
 * server-only API keys that live in `.env.local`, never in the repo.
 *
 * No-op if `.env.local` doesn't exist. Existing `process.env` values win
 * over the file, matching dotenv's usual precedence.
 */
export function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
