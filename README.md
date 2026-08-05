# AI English Learning — Greeting Somebody MVP

Mobile-first Next.js app for the `Greeting Somebody` lesson. See
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

## Judgment quality eval (manual only)

`npm run eval:judgment` runs a fixed table of learner utterances against the
Practice conversation judge (`src/lib/practice-judge.ts`) over the **real**
Anthropic API — the same code path `src/app/api/practice/turn/route.ts` uses
in production. It checks whether the model reliably accepts natural
phrasing outside each conversation state's whitelist (e.g. "Yeah, doing
alright" during Check-in), which the E2E suite can't verify since it stubs
the model entirely.

Requires `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`). It is
**never invoked automatically** — not by `test:e2e`, not by any CI (this
repo has none) — because each run makes real, non-deterministic, billed
model calls. Run it by hand, and re-run it whenever
`src/content/practice.ts`'s system-prompt copy changes.
