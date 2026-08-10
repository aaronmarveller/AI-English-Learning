import {
  isChineseExplanationResponse,
  type ChineseExplanationRequest,
} from "@/lib/chinese-explanation-protocol";

/**
 * Client-side deep module for the Chinese-explanation seam (issue #19) —
 * the symmetric counterpart to `explainInChinese`
 * (src/lib/chinese-explanation.ts, server-only, imports `@anthropic-ai/sdk`).
 * Only `@/lib/chinese-explanation-protocol` (zero-dependency, shared with
 * neither `@/lib/practice-turn-protocol` nor `@/lib/practice-judge`) is
 * imported here — same seam-isolation shape as
 * src/lib/submit-practice-turn.ts, deliberately kept a wholly separate
 * module rather than added to that file, so the two seams never grow
 * accidental coupling.
 *
 * Unlike `submitPracticeTurn`, this module throws on any failure (network
 * failure, non-2xx status, malformed JSON, a body that doesn't match
 * `ChineseExplanationResponse`) rather than resolving a discriminated
 * result. That's deliberate: the parent epic's acceptance criteria ("A
 * failed explanation call degrades to the canned four-part text rather than
 * surfacing an error") puts the fallback decision at the UI call site
 * (ask-in-chinese-sheet.tsx), which already owns the canned four-part text
 * to fall back to — this module doesn't know about that text and shouldn't
 * have to. The call site wraps every call in try/catch and falls back to
 * `GREETING_SOMEBODY_LESSON.chineseHelp[state]` on any rejection.
 */

const CHINESE_EXPLANATION_ENDPOINT = "/api/practice/explain";

export type AskChineseQuestionOptions = {
  /** Aborts the in-flight request (e.g. help mode closes mid-request). */
  signal?: AbortSignal;
};

/**
 * Asks the model to answer one Chinese follow-up question about the given
 * Conversation State, and resolves with the free-text Chinese answer.
 * Rejects (never resolves an error shape) on any failure — see this file's
 * top doc comment for why the fallback lives at the call site instead.
 */
export async function askChineseQuestion(
  input: ChineseExplanationRequest,
  options?: AskChineseQuestionOptions,
): Promise<string> {
  const response = await fetch(CHINESE_EXPLANATION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`chinese explanation request failed with status ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("chinese explanation response was not valid JSON");
  }

  if (!isChineseExplanationResponse(data)) {
    throw new Error("chinese explanation response did not match the expected shape");
  }

  return data.answerZh;
}
