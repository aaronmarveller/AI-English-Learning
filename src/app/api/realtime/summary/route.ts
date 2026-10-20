import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  buildSummaryTranscript,
  isSummaryRequest,
  parseLearningSummary,
  summarySystemPrompt,
} from "@/lib/learning-summary";

/**
 * Learning Summary (CONTEXT.md): turns what the learner said across all of
 * their Calls into a Praise, 2-3 Highlights, a Suggestion and a Closing, in
 * Chinese. The Anthropic API key is read here only and never reaches the
 * browser.
 */

export const runtime = "nodejs";

const SUMMARY_MODEL_ID = "claude-haiku-4-5-20251001";

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
      system: summarySystemPrompt(),
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
