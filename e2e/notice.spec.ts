import { test, expect } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * E2E coverage for the Notice page (#78). Asserts only what a learner can
 * see or do: a card's `data-state`, which bodies are visible, the copy shown
 * once a card is open, and where Continue lands.
 *
 * Reached via `?debug=1` so the test doesn't have to complete Observe first.
 */

const NOTICE_URL = "/notice?debug=1";

const CARD_IDS = ["greeting-intention", "conversation-length", "conversation-cues"] as const;

// Word-for-word from #78's Notice Content table.
const CARD_COPY: Record<(typeof CARD_IDS)[number], { question: string; texts: string[] }> = {
  "greeting-intention": {
    question: "“How are you?” 真的是在问近况吗？",
    texts: [
      "Friendly Greeting",
      "礼貌寒暄",
      "表达友好，不一定期待详细回答。",
      "Genuine Check-in",
      "真正关心",
      "想了解你的近况，可以多分享一些。",
      "就像中文的“吃了吗？”，有时只是打个招呼，有时是真的关心你。",
    ],
  },
  "conversation-length": {
    question: "为什么有的对话短，有的会多聊？",
    texts: [
      "Quick Greeting",
      "简短问候",
      "简单回应，然后继续当前的事。",
      "咖啡店",
      "餐厅",
      "商店",
      "Small Talk",
      "日常寒暄",
      "可以分享近况，再多聊几句。",
      "同事",
      "邻居",
      "朋友",
      "这只是常见例子。聊多久，还要看彼此的关系、当下的情况和对方的反应。",
    ],
  },
  "conversation-cues": {
    question: "怎么判断继续聊还是结束？",
    texts: [
      "Keep Talking",
      "可能想继续聊",
      "对方继续提问",
      "主动分享近况",
      "愿意停下来聊",
      "Move On",
      "可能准备结束",
      "准备离开",
      "忙于其他事",
      "表示要结束",
      "看看对方的反应，不是每次都需要多聊。",
    ],
  },
};

test.describe("Notice page", () => {
  test("shows the headline and subtitle, all cards collapsed, and no hero image", async ({ page }) => {
    await resetStorage(page);
    await page.goto(NOTICE_URL);

    await expect(page.getByRole("heading", { name: "Notice" })).toBeVisible();
    await expect(page.getByText("Discover What Greetings Mean.")).toBeVisible();
    await expect(page.getByText("点击卡片，发现对话背后的含义。")).toBeVisible();
    await expect(page.locator('img[src*="hero-street-greeting"]')).toHaveCount(0);

    for (const id of CARD_IDS) {
      await expect(page.getByTestId(id)).toHaveAttribute("data-state", "collapsed");
      await expect(page.getByTestId(`${id}-body`)).not.toBeVisible();
      await expect(page.getByTestId(`${id}-header`)).toContainText(CARD_COPY[id].question);
    }
  });

  test("cards open independently and any number can be open at once", async ({ page }) => {
    await resetStorage(page);
    await page.goto(NOTICE_URL);

    await page.getByTestId("greeting-intention-header").click();
    await page.getByTestId("conversation-length-header").click();
    await expect(page.getByTestId("greeting-intention")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("conversation-length")).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("conversation-cues")).toHaveAttribute("data-state", "collapsed");

    await page.getByTestId("greeting-intention-header").click();
    await expect(page.getByTestId("greeting-intention")).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("conversation-length")).toHaveAttribute("data-state", "expanded");
  });

  test("each header is a button that announces and controls its expanded state", async ({ page }) => {
    await resetStorage(page);
    await page.goto(NOTICE_URL);

    const header = page.getByTestId("conversation-cues-header");
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(header).toHaveAttribute("aria-controls", "conversation-cues-body");
    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "true");
  });

  for (const id of CARD_IDS) {
    test(`expanding ${id} shows both panels and the tip word for word`, async ({ page }) => {
      await resetStorage(page);
      await page.goto(NOTICE_URL);

      await page.getByTestId(`${id}-header`).click();
      const body = page.getByTestId(`${id}-body`);
      await expect(body).toBeVisible();
      for (const text of CARD_COPY[id].texts) {
        await expect(body.getByText(text, { exact: true })).toBeVisible();
      }
    });
  }

  test("Continue is reachable with nothing opened and lands on /explore", async ({ page }) => {
    await resetStorage(page);
    await page.goto(NOTICE_URL);

    const continueButton = page.getByRole("button", { name: /Continue/ });
    await expect(continueButton).toHaveText(/Continue 继续学习/);
    await continueButton.click();
    await expect(page).toHaveURL(/\/explore(\?|$)/);
  });

  test("at 375px with every card open there is no horizontal scroll", async ({ page }) => {
    await resetStorage(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(NOTICE_URL);

    for (const id of CARD_IDS) await page.getByTestId(`${id}-header`).click();
    for (const id of CARD_IDS) await expect(page.getByTestId(`${id}-body`)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
