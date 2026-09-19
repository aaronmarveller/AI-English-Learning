import { expect, test, type Page } from "@playwright/test";
import {
  installScriptedPracticeApi,
  persistedPracticeSnapshot,
  PRACTICE_URL,
  resetStorage,
  submitReply,
  type PersistedTurnRecord,
} from "./fixtures";
import {
  GENERIC_GROWTH_SUGGESTION_TEMPLATES,
  HIGHLIGHT_TEMPLATES,
  NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES,
} from "@/content/review";

/**
 * Issue #51 (ADR-0012's Consequences on `StateTurnRecord`'s grain;
 * docs/ai-configuration.md section 5 "Learning Summary Rules") — the Learning
 * Summary stays truthful when Goals arrive several at a time or out of order.
 *
 * The ticket example, end to end: one Turn achieves Greeting, Check-in and
 * Response ("Hi Emily! I'm good, thanks. How are you?"), a later one achieves
 * Closing ("Bye!"), and Review shows a Praise, 2-3 Highlights drawn from those
 * Goals' pools, and a Suggestion taken from the all-first-try pool. The second
 * test runs the same conversation with a Check-in that needed a retry and
 * asserts the Suggestion switches to the needed-retry pool, exactly as it did
 * before this ticket.
 *
 * Same seam as e2e/practice-multi-goal.spec.ts (whose style this mirrors): the
 * Judge is a scripted Goal Report via e2e/fixtures.ts's
 * `installScriptedPracticeApi`, while Verdict derivation, Goal Progress, the
 * Turn records, feedback selection, the reveal and the store all run real code
 * against a real `next build && next start` server. Which Highlights come out
 * of a run is random by design (src/lib/feedback-selector.ts), so the
 * assertions here are the ones that hold for every draw — the count, the pools
 * each line can come from, and the Suggestion's pool — exactly as
 * src/lib/feedback-selector.test.ts pins the deterministic rules with an
 * injected random source.
 */

/**
 * The practice store's Turn records, in the order they accumulated — the
 * Learning Summary's own input (e2e/fixtures.ts's `persistedPracticeSnapshot`).
 */
async function persistedTurnRecords(page: Page): Promise<PersistedTurnRecord[]> {
  return (await persistedPracticeSnapshot(page)).turnRecords ?? [];
}

/**
 * Every Learning Summary line, in order, once the reveal has finished. Review
 * reveals its lines one at a time with a typing indicator between each
 * (500-900ms per line, src/components/review/review-page-content.tsx), so
 * counting `review-line`s before that indicator is gone would count a partial
 * reveal — the repo's existing specs wait for it the same way
 * (e2e/review.spec.ts's `waitForFeedbackComplete`). The generous timeout here
 * covers a six-line worst case rather than that spec's default-scale one.
 */
async function revealedFeedbackLines(page: Page): Promise<{ kind: string; text: string }[]> {
  await expect(page.getByTestId("review-typing-indicator")).toHaveCount(0, { timeout: 15_000 });
  return page.getByTestId("review-line").evaluateAll((nodes) =>
    nodes.map((node) => ({ kind: node.getAttribute("data-kind") ?? "", text: node.textContent ?? "" })),
  );
}

/** Every string a Highlight can be: the four Goal-group pools. */
const HIGHLIGHT_GROUP_POOLS = Object.values(HIGHLIGHT_TEMPLATES);

/** Clicks through to Review once Practice is complete. */
async function openReview(page: Page): Promise<void> {
  await expect(page.getByTestId("view-summary-button")).toBeEnabled();
  await page.getByTestId("view-summary-button").click();
  await expect(page).toHaveURL(/\/review(\?|$)/);
}

test.describe("Learning Summary on flexible Goal Progress (issue #51)", () => {
  test("the ticket example: one Turn's three Goals and a goodbye give four first-try records and the all-first-try Suggestion", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      {
        goalReport: { greeting: "achieved", checkin: "achieved", response: "achieved" },
        learner_asked_back: true,
      },
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi Emily! I'm good, thanks. How are you?");
    await expect(page.getByTestId("practice-step-response")).toHaveAttribute(
      "data-state",
      "completed",
    );

    // One record per Goal achieved in that Turn, in canonical order: all three
    // first-try, none of them a verbatim Accepted Response match (the learner
    // composed one sentence), and "asked back" on the Response record only.
    expect(await persistedTurnRecords(page)).toEqual([
      { state: "greeting", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      { state: "checkin", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: false },
      { state: "response", passedFirstTry: true, matchedAcceptedResponse: false, learnerAskedBack: true },
    ]);

    await submitReply(page, "Bye!");
    await expect(page.getByTestId("practice-step-closing")).toHaveAttribute(
      "data-state",
      "completed",
    );

    const records = await persistedTurnRecords(page);
    expect(records.map((record) => record.state)).toEqual([
      "greeting",
      "checkin",
      "response",
      "closing",
    ]);
    // `closing` was the Focus Goal of its own Turn, so it is first-try too, and
    // "Bye!" asks nothing back — the asked-back flag stays on Response alone.
    expect(records[3]).toMatchObject({
      state: "closing",
      passedFirstTry: true,
      learnerAskedBack: false,
    });

    await openReview(page);

    const lines = await revealedFeedbackLines(page);
    expect(lines[0].kind).toBe("praise");
    expect(lines[lines.length - 1].kind).toBe("closing");
    expect(lines[lines.length - 2].kind).toBe("suggestion");

    // 2-3 Highlights, every one of them from one of the four Goals' pools —
    // with all four Goals in Goal Progress there are always more eligible
    // groups than slots, so the generic top-up pool is never reached.
    const highlights = lines.filter((line) => line.kind === "highlight");
    expect(highlights.length).toBeGreaterThanOrEqual(2);
    expect(highlights.length).toBeLessThanOrEqual(3);
    for (const highlight of highlights) {
      expect(HIGHLIGHT_GROUP_POOLS.some((pool) => pool.includes(highlight.text))).toBe(true);
    }
    // Completing all four Goals always contributes the Overall highlight.
    expect(highlights.some((highlight) => HIGHLIGHT_TEMPLATES.overall.includes(highlight.text))).toBe(
      true,
    );

    // Nothing needed a retry, so the Suggestion is the generic growth one.
    const suggestion = lines.find((line) => line.kind === "suggestion");
    expect(GENERIC_GROWTH_SUGGESTION_TEMPLATES).toContain(suggestion?.text);
  });

  test("a run in which Check-in needed a retry records it as not first-try and switches the Suggestion to the needed-retry pool", async ({
    page,
  }) => {
    await resetStorage(page);
    await installScriptedPracticeApi(page, [
      { goalReport: { greeting: "achieved" } },
      // Off-topic chatter touches no open Goal, so this Turn is `needs_retry`:
      // nothing is saved and Check-in stays the Focus Goal of the next Turn,
      // which is what makes that Turn its second attempt.
      { goalReport: {} },
      { goalReport: { checkin: "achieved" } },
      // ADR-0013: `response` is achieved by asking Emily back, never by
      // thanking her, so the Turn that clears it asks her how she is — and the
      // Judge's `learner_asked_back` is what makes that Turn's Response record
      // carry the flag below.
      { goalReport: { response: "achieved" }, learner_asked_back: true },
      { goalReport: { closing: "achieved" } },
    ]);
    await page.goto(PRACTICE_URL);

    await submitReply(page, "Hi there!");
    await submitReply(page, "I really like pizza.");
    await submitReply(page, "I'm good, thanks!");
    await submitReply(page, "How about you?");
    await submitReply(page, "See you!");

    await openReview(page);

    // One record per Goal, still canonical, with Check-in's reflecting the
    // attempt the retried Turn counted against it.
    const records = await persistedTurnRecords(page);
    expect(records.map((record) => record.state)).toEqual([
      "greeting",
      "checkin",
      "response",
      "closing",
    ]);
    expect(records[1]).toMatchObject({ state: "checkin", passedFirstTry: false });
    // The ask-back is what the `response` record remembers (ADR-0013).
    expect(records[2]).toMatchObject({ state: "response", learnerAskedBack: true });

    const lines = await revealedFeedbackLines(page);
    const suggestion = lines.find((line) => line.kind === "suggestion");
    expect(NEEDS_MORE_PRACTICE_SUGGESTION_TEMPLATES).toContain(suggestion?.text);
  });
});
