import { describe, expect, it } from "vitest";
import {
  ASSEMBLED_RESPONSES,
  assembleResponse,
  CORE_EXPRESSIONS,
  feedbackFor,
  selectionKey,
  SITUATIONS,
} from "@/content/guided-practice";

const [R, A, B] = CORE_EXPRESSIONS.map((expression) => expression.id);
const [coffeeShop, neighbor] = SITUATIONS;

describe("Guided Practice — core expressions", () => {
  it("are Explore's Respond, Add More and Ask Back lines, in formula order", () => {
    expect(CORE_EXPRESSIONS.map((e) => [e.role, e.lines[0]])).toEqual([
      ["respond", "Good, thanks!"],
      ["add-more", "Just a little busy today."],
      ["ask-back", "How about you?"],
    ]);
  });
});

describe("Guided Practice — response assembly", () => {
  it("is empty with nothing ticked", () => {
    expect(assembleResponse(new Set())).toBe("");
    expect(selectionKey(new Set())).toBeNull();
  });

  it("always reads Respond → Add More → Ask Back, whatever the tick order", () => {
    expect(assembleResponse(new Set([B, R, A]))).toBe("Good, thanks! Just a little busy today. How about you?");
    expect(assembleResponse(new Set([B, A]))).toBe("Just a little busy today. How about you?");
    expect(selectionKey(new Set([B, R]))).toBe("rb");
  });

  it("lists all 7 replies from the matrix", () => {
    expect(ASSEMBLED_RESPONSES.map((r) => r.text)).toEqual([
      "Good, thanks!",
      "Just a little busy today.",
      "How about you?",
      "Good, thanks! Just a little busy today.",
      "Good, thanks! How about you?",
      "Just a little busy today. How about you?",
      "Good, thanks! Just a little busy today. How about you?",
    ]);
  });
});

describe("Guided Practice — feedback", () => {
  it("shows nothing with nothing ticked", () => {
    expect(feedbackFor(coffeeShop, new Set())).toBeNull();
  });

  it("depends on the Situation for the same selection", () => {
    expect(feedbackFor(coffeeShop, new Set([R, A, B]))?.en).toBe("Nice way to keep chatting!");
    expect(feedbackFor(neighbor, new Set([R, A, B]))?.en).toBe("Sounds natural!");
    expect(feedbackFor(coffeeShop, new Set([R, B]))?.en).toBe("Nice choice!");
    expect(feedbackFor(neighbor, new Set([R, B]))?.en).toBe("Nice way to connect!");
  });

  it("never labels a reply correct or incorrect", () => {
    for (const situation of SITUATIONS) {
      for (const feedback of Object.values(situation.feedback)) {
        expect(`${feedback.en} ${feedback.zh}`).not.toMatch(/correct|incorrect|错误|正确/i);
      }
    }
  });
});
