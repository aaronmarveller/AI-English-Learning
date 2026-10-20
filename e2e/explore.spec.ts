import { test, expect, type Page } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * E2E coverage for the Explore page (ticket 06, reworked by #82). Per
 * spec.md's testing philosophy, everything here asserts what a learner could
 * see or do — section expanded/collapsed state via each section's
 * `data-state` attribute, card tint via `data-tint`, and pronunciation
 * playback via PronunciationButton's own `data-state="idle" | "playing"` —
 * never internal React state.
 *
 * Reached via `?debug=1` (see src/lib/debug.ts / the learning layout's
 * guard) since Explore's normal prerequisite is completing Observe, which
 * isn't this ticket's concern to drive through.
 */

const EXPLORE_URL = "/explore?debug=1";

/**
 * A self-contained, controllable `window.speechSynthesis` stub, installed
 * only for the tests that need to observe the transient "playing" state
 * deterministically.
 *
 * This is intentionally NOT added to e2e/fixtures.ts's shared
 * `mockSpeechApis`: that helper's existing stub resolves `onend` on a
 * microtask (see e2e/fixtures.ts and the "mockSpeechApis installs a
 * controllable speechSynthesis stub" test in e2e/fixtures.spec.ts, which
 * asserts exactly that auto-resolve behavior) — fine for that fixture's own
 * purpose, but too fast for Playwright to reliably observe an intermediate
 * "playing" attribute before it flips back. Real browser speech synthesis
 * is equally unusable here: headless environments often have no system TTS
 * voices, so `speechSynthesis.speak()` can hang or error unpredictably.
 */
async function installControllableSpeechStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type FakeUtterance = { onstart?: () => void; onend?: () => void };
    let resolveCurrent: (() => void) | null = null;

    const fakeSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak(utterance: FakeUtterance) {
        utterance.onstart?.();
        resolveCurrent = () => utterance.onend?.();
      },
      cancel() {
        resolveCurrent?.();
        resolveCurrent = null;
      },
      pause() {},
      resume() {},
      getVoices() {
        return [];
      },
    };

    Object.defineProperty(window, "speechSynthesis", {
      value: fakeSynthesis,
      configurable: true,
      writable: true,
    });

    Object.assign(window, {
      __resolveSpeech: () => {
        resolveCurrent?.();
        resolveCurrent = null;
      },
    });
  });
}

declare global {
  interface Window {
    __resolveSpeech?: () => void;
  }
}

type Row = { id: string; en: string[]; zh: string; pill: string; tint: "green" | "blue" | "yellow" };

/** Main (non-Explore-More) expressions, word for word from issue #81's tables. */
const MAIN: Record<string, Row[]> = {
  greeting: [
    { id: "greeting-hi", en: ["Hi!"], zh: "嗨！", pill: "最常用", tint: "green" },
    { id: "greeting-hello", en: ["Hello."], zh: "你好。", pill: "稍正式", tint: "blue" },
    {
      id: "greeting-time-based",
      en: ["Good morning.", "Good afternoon.", "Good evening."],
      zh: "早上好 / 下午好 / 晚上好",
      pill: "根据时间",
      tint: "yellow",
    },
  ],
  checkin: [
    { id: "checkin-how-are-you", en: ["How are you?"], zh: "你怎么样？", pill: "常用问候", tint: "green" },
    { id: "checkin-hows-it-going", en: ["How's it going?"], zh: "最近怎么样？", pill: "更随意", tint: "blue" },
  ],
  response: [
    { id: "response-good-thanks", en: ["Good, thanks!"], zh: "挺好的，谢谢！", pill: "Respond · 回应", tint: "green" },
    {
      id: "response-little-busy-today",
      en: ["Just a little busy today."],
      zh: "就是今天有点忙。",
      pill: "Add More · 补充近况",
      tint: "blue",
    },
    { id: "response-how-about-you", en: ["How about you?"], zh: "你呢？", pill: "Ask Back · 回问", tint: "yellow" },
  ],
  closing: [
    { id: "closing-see-you", en: ["See you!"], zh: "回头见！", pill: "日常告别", tint: "green" },
    { id: "closing-have-a-nice-day", en: ["Have a nice day!"], zh: "祝你今天愉快！", pill: "礼貌结束", tint: "blue" },
  ],
};

const HEADERS: Record<string, string> = {
  greeting: "Greeting · 打招呼",
  checkin: "Check-in · 问候近况",
  response: "Response & Keep It Going · 回应与继续交流",
  closing: "Closing · 结束交流",
};

const SECTIONS = ["greeting", "checkin", "response", "closing"] as const;

/** Greeting starts open; this opens the other three. */
async function openAll(page: Page): Promise<void> {
  for (const key of SECTIONS.slice(1)) {
    await page.getByTestId(`section-${key}-header`).click();
  }
}

test.describe("Explore page", () => {
  test("shows the headline, subtitle and Today's Expressions heading", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await expect(page.getByRole("heading", { name: "Learn useful expressions." })).toBeVisible();
    await expect(page.getByText("学习常用表达，根据情境灵活组合。")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Today's Expressions/ })).toBeVisible();
  });

  test("section headers read English · 中文, with a green chevron that follows open state", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    for (const key of SECTIONS) {
      await expect(page.getByTestId(`section-${key}-header`)).toContainText(HEADERS[key]);
      await expect(page.getByTestId(`section-${key}-chevron`)).toHaveCSS("color", "rgb(47, 174, 96)");
    }

    await expect(page.getByTestId("section-greeting-chevron")).toHaveText("⌃");
    await expect(page.getByTestId("section-checkin-chevron")).toHaveText("⌄");
    await page.getByTestId("section-checkin-header").click();
    await expect(page.getByTestId("section-checkin-chevron")).toHaveText("⌃");
  });

  test("on arrival Greeting is expanded and the other three sections are collapsed", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await expect(page.getByTestId("section-greeting")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("section-greeting-body")).toBeVisible();
    for (const key of ["checkin", "response", "closing"]) {
      await expect(page.getByTestId(`section-${key}`)).toHaveAttribute("data-state", "collapsed");
      await expect(page.getByTestId(`section-${key}-body`)).not.toBeVisible();
    }
  });

  test("sections toggle independently: opening one never closes another", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await page.getByTestId("section-checkin-header").click();
    await page.getByTestId("section-closing-header").click();
    for (const key of ["greeting", "checkin", "closing"]) {
      await expect(page.getByTestId(`section-${key}`)).toHaveAttribute("data-state", "expanded");
    }
    await expect(page.getByTestId("section-response")).toHaveAttribute("data-state", "collapsed");

    // Collapsing Greeting leaves Check-in and Closing open.
    await page.getByTestId("section-greeting-header").click();
    await expect(page.getByTestId("section-greeting")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("section-checkin")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("section-closing")).toHaveAttribute("data-state", "expanded");
  });

  test("every main expression shows its English, Chinese and tag or role word for word", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);

    for (const key of SECTIONS) {
      for (const row of MAIN[key]) {
        const card = page.getByTestId(`expression-card-${row.id}`);
        for (const line of row.en) await expect(card.getByText(line, { exact: true })).toBeVisible();
        await expect(card.getByText(row.zh, { exact: true })).toBeVisible();
        await expect(card.getByText(row.pill, { exact: true })).toBeVisible();
      }
      // Explore More is not rendered yet: only the main list appears.
      await expect(page.getByTestId(`section-${key}-body`).locator('[data-testid^="expression-card-"]')).toHaveCount(
        MAIN[key].length,
      );
    }
  });

  test("the time-based Greeting card shows three lines with their own buttons and one translation", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    const card = page.getByTestId("expression-card-greeting-time-based");
    await expect(card.getByRole("button")).toHaveCount(3);
    await expect(card.getByText("早上好 / 下午好 / 晚上好")).toHaveCount(1);
    await expect(card.getByText("根据时间")).toHaveCount(1);
  });

  test("card tints cycle green, blue, yellow by position, and follow the role in Response", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);

    for (const key of SECTIONS) {
      for (const row of MAIN[key]) {
        await expect(page.getByTestId(`expression-card-${row.id}`)).toHaveAttribute("data-tint", row.tint);
      }
    }
  });

  test("no image carousel, scene photo or combo sentence remains", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);

    for (const key of SECTIONS) {
      await expect(page.getByTestId(`section-${key}-body`).locator("img")).toHaveCount(0);
    }
    await expect(page.getByText("I'm good. Thank you. How about you?")).toHaveCount(0);
    await expect(page.getByText("连起来说")).toHaveCount(0);
  });

  test("every spoken line has its own button; clicking a second stops the first", async ({ page }) => {
    await resetStorage(page);
    await installControllableSpeechStub(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);

    for (const key of SECTIONS) {
      for (const row of MAIN[key]) {
        const card = page.getByTestId(`expression-card-${row.id}`);
        await expect(card.getByRole("button")).toHaveCount(row.en.length);
        for (const line of row.en) {
          await expect(card.getByRole("button", { name: `播放发音 Play pronunciation: ${line}` })).toHaveCount(1);
        }
      }
    }

    const first = page.getByTestId("pronounce-greeting-hi");
    const second = page.getByTestId("pronounce-greeting-time-based-2");
    await expect(first).toHaveAttribute("data-state", "idle");

    await first.click();
    await expect(first).toHaveAttribute("data-state", "playing");

    await second.click();
    await expect(second).toHaveAttribute("data-state", "playing");
    await expect(first).toHaveAttribute("data-state", "idle");

    await page.evaluate(() => window.__resolveSpeech?.());
    await expect(second).toHaveAttribute("data-state", "idle");

    // Repeatable: clicking again re-triggers playback.
    await first.click();
    await expect(first).toHaveAttribute("data-state", "playing");
    await page.evaluate(() => window.__resolveSpeech?.());
    await expect(first).toHaveAttribute("data-state", "idle");
  });

  test("at 375px with every section open there is no horizontal scroll", async ({ page }) => {
    await resetStorage(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(EXPLORE_URL);
    await openAll(page);

    for (const key of SECTIONS) {
      await expect(page.getByTestId(`section-${key}-body`)).toBeVisible();
    }

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test("Continue reads \"Continue 继续学习 →\" and is reachable without opening anything", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    const continueButton = page.getByRole("button", { name: "Continue 继续学习 →" });
    await expect(continueButton).toBeVisible();
    await continueButton.click();
    await expect(page).toHaveURL(/\/guided-practice(\?|$)/);
  });

  test("progress dots: Observe and Notice are solid green, Explore is a green ring, later dots are white", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "greeting-somebody:progress",
        JSON.stringify({ completed: ["observe", "notice"] }),
      );
    });
    await page.goto(EXPLORE_URL);

    const dot = (step: string) => page.getByTestId(`progress-dot-${step}`);
    const GREEN = "rgb(47, 174, 96)";
    const WHITE = "rgb(255, 255, 255)";

    for (const step of ["observe", "notice"]) {
      await expect(dot(step)).toHaveAttribute("data-state", "completed");
      await expect(dot(step)).toHaveCSS("background-color", GREEN);
    }

    await expect(dot("explore")).toHaveAttribute("data-state", "current");
    await expect(dot("explore")).toHaveCSS("border-top-color", GREEN);
    await expect(dot("explore")).not.toHaveCSS("background-color", GREEN);

    for (const step of ["guided-practice", "practice", "review"]) {
      await expect(dot(step)).toHaveAttribute("data-state", "upcoming");
      await expect(dot(step)).toHaveCSS("background-color", WHITE);
      await expect(dot(step)).not.toHaveCSS("border-top-color", GREEN);
    }
  });
});
