import { NextResponse } from "next/server";
import { ChineseExplanationError, explainInChinese } from "@/lib/chinese-explanation";
import { isChineseExplanationRequest, type ChineseExplanationResponse } from "@/lib/chinese-explanation-protocol";

/**
 * Chinese-explanation proxy (issue #19; docs/ai-configuration.md section 6
 * "Chinese Help Rules"; issue #12's "Chinese help becomes a mode, with its
 * own seam").
 *
 * A separate route from src/app/api/practice/turn/route.ts, deliberately —
 * see src/lib/chinese-explanation.ts's top doc comment for why this seam
 * shares no wire vocabulary with the Judge. This is the ONLY other place
 * (besides practice/turn/route.ts) that reads `ANTHROPIC_API_KEY`; same
 * server-only guarantee applies (Route Handlers never ship to the client
 * bundle).
 *
 * Request body: `ChineseExplanationRequest` — `{ state, question }` (see
 * src/lib/chinese-explanation-protocol.ts). Response body on success:
 * `ChineseExplanationResponse` — `{ answerZh: string }`.
 *
 * Unlike the Judge route, this one is a single blocking JSON response, not
 * an SSE stream — there is no "partial" concept for a short free-text
 * answer worth the extra transport complexity, and the client-side fallback
 * (src/lib/ask-chinese-question.ts / ask-in-chinese-sheet.tsx) already
 * treats any non-2xx status or malformed body as "fall back to the canned
 * text", so a plain JSON error body is all that's needed here.
 */

export const runtime = "nodejs";

function parseRequestBody(body: unknown) {
  if (!isChineseExplanationRequest(body)) return null;
  return body;
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

  // Server-only: never read from a Client Component, never in the client
  // bundle. No real key exists in this dev environment by default — that's
  // expected; live calls fail auth at runtime, which is fine since E2E
  // stubs this whole route (see e2e/fixtures.ts's `installScriptedChineseExplanationApi`).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("practice/explain: ANTHROPIC_API_KEY is not set");
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  try {
    const answerZh = await explainInChinese({ apiKey, state: parsed.state, question: parsed.question });
    const responseBody: ChineseExplanationResponse = { answerZh };
    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    if (error instanceof ChineseExplanationError) {
      console.error(error.message);
      return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
    }
    console.error("practice/explain: upstream Anthropic API error", error);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
