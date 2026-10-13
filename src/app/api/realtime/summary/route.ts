import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { CHINESE_EXPLANATION_MODEL_ID } from "@/lib/chinese-explanation";

/**
 * Realtime voice demo — post-call summary (see src/app/realtime-demo).
 *
 * Takes the call transcript the browser collected from the Realtime data
 * channel and returns a short Chinese summary of what the learner said.
 * Same small Claude model and server-only `ANTHROPIC_API_KEY` as the
 * practice routes.
 */

export const runtime = "nodejs";

type Line = { role: "user" | "assistant"; text: string };

function isLines(body: unknown): body is { lines: Line[] } {
  if (typeof body !== "object" || body === null) return false;
  const lines = (body as { lines?: unknown }).lines;
  return (
    Array.isArray(lines) &&
    lines.every(
      (l) =>
        typeof l === "object" &&
        l !== null &&
        (l.role === "user" || l.role === "assistant") &&
        typeof l.text === "string",
    )
  );
}

const SYSTEM_PROMPT = `
You summarize a short English speaking practice between a Chinese-speaking beginner ("Learner") and their tutor Emily. The topic was greetings, "How are you today?", and goodbyes.

Write the summary in Chinese, focused on what the LEARNER said:
1. 一句话概括学习者在这次对话里说了什么。
2. 学习者说过的英文表达（逐条列出，保留原句；如有明显错误，在后面给出更自然的说法）。
3. 一句鼓励 + 一个下次可以练习的点。

Only English and Chinese are supported in this practice: ignore any learner line in another language (do not list, translate or comment on it). You only see a speech-to-text transcript, so never comment on pronunciation, accent or fluency. Keep it short and plain text (no Markdown headings, simple numbered lines are fine). If the learner said almost nothing, say so kindly.
`.trim();

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!isLines(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing_anthropic_api_key" }, { status: 500 });
  }

  const transcript = body.lines
    .filter((l) => l.text.trim())
    .map((l) => `${l.role === "user" ? "Learner" : "Emily"}: ${l.text.trim()}`)
    .join("\n");

  try {
    const response = await new Anthropic({ apiKey }).messages.create({
      model: CHINESE_EXPLANATION_MODEL_ID,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript || "(empty transcript)" }],
    });
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text.trim();
    if (!text) return NextResponse.json({ error: "empty_summary" }, { status: 502 });
    return NextResponse.json({ summary: text });
  } catch (e) {
    return NextResponse.json({ error: "upstream_error", detail: String(e) }, { status: 502 });
  }
}
