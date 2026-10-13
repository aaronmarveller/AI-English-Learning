import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { buildSummaryTranscript, isSummaryRequest, parseLearningSummary } from "@/lib/learning-summary";

/**
 * Learning Summary (CONTEXT.md): turns what the learner said across all of
 * their Calls into a Praise, 2-3 Highlights, a Suggestion and a Closing, in
 * Chinese. The Anthropic API key is read here only and never reaches the
 * browser.
 */

export const runtime = "nodejs";

const SUMMARY_MODEL_ID = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `
You write the Learning Summary for a Chinese-speaking beginner who just practiced spoken English with their tutor Emily over up to three short phone calls. The topic was greetings, "How are you today?", and goodbyes.

You only see a speech-to-text transcript of what the Learner and Emily said. Write the summary in Chinese, grounded in the Learner's own lines (quote their English expressions where useful), as one JSON object with exactly these keys and nothing else:
{
  "praise": one warm sentence of praise for something the learner actually did,
  "highlights": an array of 2 or 3 strings, each pointing at something specific the learner said (keep their English wording; if a line had a clear mistake, add a more natural way to say it),
  "suggestion": one concrete, kind suggestion for what to practice next,
  "closing": one short encouraging closing sentence
}

Rules:
- Chinese is the language of the summary; English appears only as the learner's own expressions and short better alternatives.
- Only English and Chinese are supported in this practice: ignore any learner line in another language (do not quote, translate or comment on it).
- NEVER comment on pronunciation, accent or fluency — you only see a transcript, not their voice.
- If the learner said very little, still give 2 honest highlights from what they did say or do (e.g. that they picked up the call), and keep the tone kind.
- Output the JSON object only: no Markdown, no code fence.
`.trim();

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!isSummaryRequest(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing_anthropic_api_key" }, { status: 500 });
  }

  const transcript = buildSummaryTranscript(body.calls);

  try {
    const response = await new Anthropic({ apiKey }).messages.create({
      model: SUMMARY_MODEL_ID,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript || "(the learner said nothing)" }],
    });
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const summary = parseLearningSummary(text);
    if (!summary) return NextResponse.json({ error: "invalid_summary" }, { status: 502 });
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
