import { NextResponse } from "next/server";

/**
 * Live text-to-speech proxy for Emily's English and Chinese lines that do
 * not have an available pre-generated asset.
 *
 * Practice replies come from the Lesson's fixed Conversation Script and are
 * normally pre-generated. This route synthesizes a fixed line on demand if
 * its asset is missing, and handles dynamic Chinese help follow-ups that
 * cannot be pre-generated. Both use the same OpenAI TTS voice used for
 * pre-generation (OPENAI_TTS_MODEL/OPENAI_TTS_VOICE, defaulting to the same
 * gpt-4o-mini-tts/coral pair scripts/generate-audio.ts defaults to), so a
 * synthesized line sounds like the same speaker as the pregenerated assets
 * instead of falling straight to the browser's own (often noticeably more
 * robotic) speech synthesis.
 *
 * GET, with `text` as a query param, not POST-with-body: the client
 * (src/lib/speech-synthesis.ts's playLiveGeneratedAudio) points an
 * `<audio src>` straight at this URL instead of doing its own
 * fetch()+blob()+createObjectURL() dance. That used to matter only for
 * simplicity; on iOS/iPadOS Safari it turned out to matter for correctness —
 * WebKit's `<audio>` element reliably refused to play a `blob:` (and even a
 * `data:`) URL built from an in-JS fetch of this exact same audio, with a
 * `NotSupportedError`, even though the identical bytes played fine from a
 * plain http(s) URL. A GET endpoint lets the browser fetch the audio itself,
 * the same way the pregenerated-file tier already does — which real devices
 * have never had trouble with.
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

/** Allows short Chinese explanations while still bounding provider cost and latency. */
const MAX_TEXT_LENGTH = 1000;

/**
 * Repeat requests for the exact same reply text happen for real: the 🔊
 * replay button (message-bubble-pair.tsx) re-speaks a line the learner's
 * already heard. A day is generous enough to cover replays within the same
 * practice session (this app has no accounts/history beyond that) without
 * pretending the text→audio mapping is permanent — OpenAI's TTS output for
 * identical input isn't guaranteed byte-for-byte stable long-term, so this
 * deliberately isn't `immutable`.
 */
const CACHE_CONTROL = "public, max-age=86400";

function parseText(raw: string | null): string | null {
  if (raw === null) return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) return null;
  return text;
}

export async function GET(request: Request): Promise<Response> {
  const text = parseText(new URL(request.url).searchParams.get("text"));
  if (!text) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Not an error worth logging on every turn — an unconfigured key is the
    // expected, supported "TTS not set up" state (see this file's doc
    // comment), and the client silently falls back to browser synthesis.
    return NextResponse.json({ error: "tts_not_configured" }, { status: 500 });
  }

  const model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
  // Must match scripts/generate-audio.ts's own fallback — on-demand and
  // pregenerated lines are meant to sound like the same speaker
  // (see this file's top doc comment). "coral" was selected after comparing
  // the candidate voices with both English and Chinese samples (issue #24).
  const voice = process.env.OPENAI_TTS_VOICE ?? "coral";

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, voice, input: text, response_format: "mp3" }),
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
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": CACHE_CONTROL },
  });
}
