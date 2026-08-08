import { NextResponse } from "next/server";

/**
 * Live text-to-speech proxy for Emily's per-turn conversation replies.
 *
 * Practice's live replies come from the LLM fresh on every turn (see
 * src/lib/practice-judge.ts), so there's no fixed pool to pre-generate audio
 * for the way src/lib/audio-manifest.ts's fixed lines get via
 * scripts/generate-audio.ts. This route is the same idea applied on demand:
 * synthesize the exact reply text through the same OpenAI TTS voice used for
 * pre-generation (OPENAI_TTS_MODEL/OPENAI_TTS_VOICE, defaulting to the same
 * tts-1/alloy scripts/generate-audio.ts defaults to), so a live reply sounds
 * like the same speaker as the pregenerated opening line instead of falling
 * straight to the browser's own (often noticeably more robotic) speech
 * synthesis.
 *
 * This is the ONLY server-side place `OPENAI_API_KEY` is read for runtime
 * traffic (scripts/generate-audio.ts reads its own copy separately, for the
 * one-off pre-generation script) — Route Handlers run server-side only in
 * Next.js, so the key never reaches the browser. src/lib/speech-synthesis.ts
 * is the ONLY client-side caller, and only as one rung of its existing
 * pregenerated-audio → live-generated-audio → browser-synthesis fallback
 * ladder: any failure here (missing key, upstream error) degrades straight
 * to browser synthesis exactly like a missing pregenerated file already did,
 * so an unconfigured key never blocks using or demoing the app.
 */

export const runtime = "nodejs";

/** Generous but not unbounded — Emily's live replies are always short conversational sentences. */
const MAX_TEXT_LENGTH = 500;

function parseRequestBody(body: unknown): { text: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.text !== "string") return null;
  const text = b.text.trim();
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) return null;
  return { text };
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseRequestBody(rawBody);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Not an error worth logging on every turn — an unconfigured key is the
    // expected, supported "TTS not set up" state (see this file's doc
    // comment), and the client silently falls back to browser synthesis.
    return NextResponse.json({ error: "tts_not_configured" }, { status: 500 });
  }

  const model = process.env.OPENAI_TTS_MODEL ?? "tts-1";
  const voice = process.env.OPENAI_TTS_VOICE ?? "alloy";

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, voice, input: parsed.text, response_format: "mp3" }),
    });
  } catch (error) {
    console.error("practice/speak: network error calling OpenAI TTS", error);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }

  if (!upstream.ok) {
    console.error("practice/speak: OpenAI TTS request failed", upstream.status, upstream.statusText);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}
