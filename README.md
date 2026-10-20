# AI English Learning — Greeting Someone MVP

Mobile-first Next.js app for the `Greeting Someone` lesson. See
[.scratch/greeting-somebody-mvp/spec.md](.scratch/greeting-somebody-mvp/spec.md)
for the product spec and [.scratch/greeting-somebody-mvp/issues/](.scratch/greeting-somebody-mvp/issues/)
for the per-page implementation tickets.

## Getting started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The design tokens (colors, type
scale, radii) are documented and visualized on
[/style-guide](http://localhost:3000/style-guide).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit
- `npm run test:e2e` — Playwright E2E suite (builds and serves the app first)

## Live Calls

Practice is a live voice Call with Emily: the browser connects to OpenAI's
Realtime API over WebRTC, using a short-lived client secret minted by
`src/app/api/realtime/session/route.ts` (`OPENAI_API_KEY` never reaches the
client). The rules of a Call — Turn-Taking, the Handoff Gap, the 45-second
limit and the wind-down — live in `src/lib/call-engine.ts`. The Learning
Summary is written by Claude from everything the learner said
(`src/app/api/realtime/summary/route.ts`, `ANTHROPIC_API_KEY` server-only).

Browsers only expose the microphone on HTTPS or localhost. To try Practice from
a phone on your LAN, run `npm run dev:https` (see `scripts/gen-dev-cert.sh`).
The E2E suite fakes the Realtime connection and the summary, so it never calls
OpenAI or Anthropic.

## Pre-generated audio (manual only)

`npm run generate:audio` pre-generates `public/audio/*.mp3` for Explore's
English expressions (all 25 spoken lines), listed in `src/lib/audio-manifest.ts`,
via a real TTS provider (OpenAI's `gpt-4o-mini-tts` by default).
`src/lib/speech-synthesis.ts` plays the pre-generated file that matches,
falling back to browser speech synthesis otherwise.

Requires `OPENAI_API_KEY` in `.env.local` (see `.env.example`; `TTS_PROVIDER`
picks the provider — only `openai` is implemented so far). Not required to
run or demo the app: with no `public/audio/*.mp3` files at all, every line
just falls back to browser synthesis. Already-generated files are skipped
on re-run, so this only costs money for genuinely new/changed manifest
entries. Manual only, because every run is billed API usage.
