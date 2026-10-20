import {
  fallbackLines,
  summaryToLines,
  toLearningSummary,
  type SummaryLine,
} from "@/lib/learning-summary";
import { learnerLinesOf, type CallRecord } from "@/lib/practice";

/**
 * Asks the summary route for the Learning Summary and returns the lines to
 * show. Never rejects: if the learner said nothing in English or Chinese, or
 * generating the summary fails for any reason, it resolves the fallback — the
 * learner's own lines — instead of an error.
 */
export async function loadSummaryLines(
  calls: readonly CallRecord[],
  signal?: AbortSignal,
): Promise<SummaryLine[]> {
  const learnerLines = learnerLinesOf(calls);
  if (learnerLines.length === 0) return fallbackLines([]);

  try {
    const response = await fetch("/api/realtime/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calls: calls.map((call) => ({ lines: call.lines.map(({ role, text }) => ({ role, text })) })),
      }),
      signal,
    });
    if (!response.ok) return fallbackLines(learnerLines);
    const summary = toLearningSummary(((await response.json()) as { summary?: unknown }).summary);
    return summary ? summaryToLines(summary) : fallbackLines(learnerLines);
  } catch {
    return fallbackLines(learnerLines);
  }
}
