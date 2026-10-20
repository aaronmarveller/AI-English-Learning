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
    // Pre-generated mp3s must not take part: make <audio> playback fail at once
    // so speak() always falls through to the controllable synthesis stub below,
    // whether or not public/audio holds a file for the line.
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error("audio disabled in test"));

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

/** Explore More expressions, word for word from issue #81's tables. Tint restarts from green. */
const MORE: Record<string, Row[]> = {
  greeting: [
    { id: "greeting-hey", en: ["Hey!"], zh: "嗨！", pill: "更随意", tint: "green" },
    { id: "greeting-good-to-see-you", en: ["Good to see you!"], zh: "见到你真高兴！", pill: "再次见面", tint: "blue" },
  ],
  checkin: [
    { id: "checkin-how-are-you-doing", en: ["How are you doing?"], zh: "你怎么样？", pill: "日常口语", tint: "green" },
    {
      id: "checkin-hows-your-day-going",
      en: ["How's your day going?"],
      zh: "今天过得怎么样？",
      pill: "询问今天",
      tint: "blue",
    },
    { id: "checkin-how-have-you-been", en: ["How have you been?"], zh: "最近过得怎么样？", pill: "久别问候", tint: "yellow" },
  ],
  response: [
    { id: "response-pretty-good", en: ["Pretty good!"], zh: "挺不错的！", pill: "Respond · 回应", tint: "green" },
    { id: "response-not-bad", en: ["Not bad!"], zh: "还不错！", pill: "Respond · 回应", tint: "green" },
    {
      id: "response-enjoying-the-weather",
      en: ["Just enjoying the weather."],
      zh: "正享受这好天气呢。",
      pill: "Add More · 补充近况",
      tint: "blue",
    },
    {
      id: "response-busy-week",
      en: ["It's been a busy week."],
      zh: "这周一直挺忙的。",
      pill: "Add More · 补充近况",
      tint: "blue",
    },
    { id: "response-what-about-you", en: ["What about you?"], zh: "你呢？", pill: "Ask Back · 回问", tint: "yellow" },
  ],
  closing: [
    { id: "closing-take-care", en: ["Take care!"], zh: "保重！", pill: "表达关心", tint: "green" },
    { id: "closing-have-a-good-one", en: ["Have a good one!"], zh: "祝你今天愉快！", pill: "日常口语", tint: "blue" },
    { id: "closing-catch-you-later", en: ["Catch you later!"], zh: "回头见！", pill: "熟人之间", tint: "yellow" },
  ],
};

const MORE_SUBTITLES: Record<string, string> = {
  greeting: "想了解更多打招呼的表达",
  checkin: "想了解更多问候近况的表达",
  response: "想了解更多回应与继续交流的表达",
  closing: "想了解更多结束交流的表达",
};

const HEADERS: Record<string, string> = {
  greeting: "Greeting · 打招呼",
  checkin: "Check-in · 问候近况",
  response: "Response & Keep It Going · 回应与继续交流",
  closing: "Closing · 结束交流",
};

const SECTIONS = ["greeting", "checkin", "response", "closing"] as const;

async function openAllMore(page: Page): Promise<void> {
  for (const key of SECTIONS) {
    await page.getByTestId(`explore-more-${key}-toggle`).click();
  }
}

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

  test("sections form an accordion: opening one closes the others", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await page.getByTestId("section-checkin-header").click();
    await expect(page.getByTestId("section-checkin")).toHaveAttribute("data-state", "expanded");
    for (const key of ["greeting", "response", "closing"]) {
      await expect(page.getByTestId(`section-${key}`)).toHaveAttribute("data-state", "collapsed");
    }

    // Clicking the open section collapses it, leaving all four closed.
    await page.getByTestId("section-checkin-header").click();
    for (const key of SECTIONS) {
      await expect(page.getByTestId(`section-${key}`)).toHaveAttribute("data-state", "collapsed");
    }
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
      // Explore More starts collapsed: only the main list appears.
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

  test("Response opens with the Conversation Formula above its cards, steps 1 → 2 → 3 word for word", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);
    await page.getByTestId("section-response-header").click();

    const panel = page.getByTestId("conversation-formula");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Conversation Formula 交流公式");

    const panelBox = await panel.boundingBox();
    const firstCardBox = await page.getByTestId("expression-card-response-good-thanks").boundingBox();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(firstCardBox!.y);

    const expected = [
      ["1", "Respond", "回应", "先回应"],
      ["2", "Add More", "补充近况", "想多说时"],
      ["3", "Ask Back", "回问", "想继续聊时"],
    ];
    const steps = panel.locator('[data-testid^="formula-step-"]');
    await expect(steps).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const step = steps.nth(i);
      await expect(step).toHaveAttribute("data-testid", `formula-step-${i + 1}`);
      const [num, en, zh, hint] = expected[i];
      await expect(step.getByTestId("formula-number")).toHaveText(num);
      await expect(step.getByTestId("formula-en")).toHaveText(en);
      await expect(step.getByTestId("formula-zh")).toHaveText(zh);
      await expect(step.getByTestId("formula-hint")).toHaveText(hint);
    }
    await expect(panel.locator("button, a")).toHaveCount(0);
  });

  test("at 375px the Conversation Formula fits with no horizontal scroll", async ({ page }) => {
    await resetStorage(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(EXPLORE_URL);
    await page.getByTestId("section-response-header").click();

    const panel = page.getByTestId("conversation-formula");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
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

  test("all four Explore More groups start collapsed, showing 更多表达 and their own subtitle", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);

    for (const key of SECTIONS) {
      const more = page.getByTestId(`explore-more-${key}`);
      await expect(more).toHaveAttribute("data-state", "collapsed");
      await expect(more).toContainText("更多表达");
      await expect(more).toContainText(MORE_SUBTITLES[key]);
      await expect(page.getByTestId(`explore-more-${key}-icon`)).toHaveText("+");
      await expect(page.getByTestId(`explore-more-${key}-chevron`)).toHaveText("⌄");
      await expect(page.getByTestId(`explore-more-${key}-chevron`)).toHaveCSS("color", "rgb(47, 174, 96)");
      await expect(page.getByTestId(`explore-more-${key}-body`)).toHaveCount(0);
    }
  });

  test("opening Greeting's Explore More shows Hey! and Good to see you! with translations and tags", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await page.getByTestId("explore-more-greeting-toggle").click();
    await expect(page.getByTestId("explore-more-greeting")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("explore-more-greeting-icon")).toHaveText("−");
    await expect(page.getByTestId("explore-more-greeting-chevron")).toHaveText("⌃");
    // Subtitle is unchanged while expanded.
    await expect(page.getByTestId("explore-more-greeting")).toContainText(MORE_SUBTITLES.greeting);
    const hey = page.getByTestId("expression-card-greeting-hey");
    const seeYou = page.getByTestId("expression-card-greeting-good-to-see-you");
    await expect(hey).toContainText("Hey!");
    await expect(hey).toContainText("嗨！");
    await expect(hey).toContainText("更随意");
    await expect(seeYou).toContainText("Good to see you!");
    await expect(seeYou).toContainText("见到你真高兴！");
    await expect(seeYou).toContainText("再次见面");
  });

  test("every Explore More expression shows word for word, with the right tint, under its section", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);
    await openAllMore(page);

    for (const key of SECTIONS) {
      const more = page.getByTestId(`explore-more-${key}-body`);
      await expect(more.locator('[data-testid^="expression-card-"]')).toHaveCount(MORE[key].length);
      for (const row of MORE[key]) {
        const card = more.getByTestId(`expression-card-${row.id}`);
        for (const line of row.en) await expect(card.getByText(line, { exact: true })).toBeVisible();
        await expect(card.getByText(row.zh, { exact: true })).toBeVisible();
        await expect(card.getByText(row.pill, { exact: true })).toBeVisible();
        await expect(card).toHaveAttribute("data-tint", row.tint);
      }
    }
  });

  test("collapsing and reopening a section keeps its Explore More state", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);

    await page.getByTestId("explore-more-greeting-toggle").click();
    await page.getByTestId("section-greeting-header").click();
    await expect(page.getByTestId("section-greeting")).toHaveAttribute("data-state", "collapsed");
    await page.getByTestId("section-greeting-header").click();
    await expect(page.getByTestId("explore-more-greeting")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("expression-card-greeting-hey")).toBeVisible();

    // A collapsed Explore More also stays collapsed across a section toggle.
    await page.getByTestId("explore-more-greeting-toggle").click();
    await page.getByTestId("section-greeting-header").click();
    await page.getByTestId("section-greeting-header").click();
    await expect(page.getByTestId("explore-more-greeting")).toHaveAttribute("data-state", "collapsed");
  });

  test("each Explore More opens and closes independently of the others", async ({ page }) => {
    await resetStorage(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);

    await page.getByTestId("explore-more-checkin-toggle").click();
    await expect(page.getByTestId("explore-more-checkin")).toHaveAttribute("data-state", "expanded");
    for (const key of ["greeting", "response", "closing"]) {
      await expect(page.getByTestId(`explore-more-${key}`)).toHaveAttribute("data-state", "collapsed");
    }

    await page.getByTestId("explore-more-closing-toggle").click();
    await page.getByTestId("explore-more-checkin-toggle").click();
    await expect(page.getByTestId("explore-more-checkin")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("explore-more-closing")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("explore-more-greeting")).toHaveAttribute("data-state", "collapsed");
  });

  test("every Explore More expression has a working pronunciation button", async ({ page }) => {
    await resetStorage(page);
    await installControllableSpeechStub(page);
    await page.goto(EXPLORE_URL);
    await openAll(page);
    await openAllMore(page);

    for (const key of SECTIONS) {
      for (const row of MORE[key]) {
        const card = page.getByTestId(`expression-card-${row.id}`);
        await expect(card.getByRole("button")).toHaveCount(row.en.length);
        await expect(card.getByRole("button", { name: `播放发音 Play pronunciation: ${row.en[0]}` })).toHaveCount(1);
      }
    }

    const first = page.getByTestId("pronounce-greeting-hey");
    const second = page.getByTestId("pronounce-closing-catch-you-later");
    await first.click();
    await expect(first).toHaveAttribute("data-state", "playing");
    await second.click();
    await expect(second).toHaveAttribute("data-state", "playing");
    await expect(first).toHaveAttribute("data-state", "idle");
    await page.evaluate(() => window.__resolveSpeech?.());
    await expect(second).toHaveAttribute("data-state", "idle");
  });

  test("at 375px with every section and Explore More open there is no horizontal scroll", async ({ page }) => {
    await resetStorage(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(EXPLORE_URL);
    await openAll(page);
    await openAllMore(page);

    for (const key of SECTIONS) {
      await expect(page.getByTestId(`explore-more-${key}-body`)).toBeVisible();
    }
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test("Continue reads\"Continue 继续学习 →\" and is reachable without opening anything", async ({ page }) => {
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
    await expect(dot("explore")).toHaveCSS("background-color", GREEN);

    for (const step of ["guided-practice", "practice", "review"]) {
      await expect(dot(step)).toHaveAttribute("data-state", "upcoming");
      await expect(dot(step)).toHaveCSS("background-color", WHITE);
      await expect(dot(step)).not.toHaveCSS("border-top-color", GREEN);
    }
  });
});
