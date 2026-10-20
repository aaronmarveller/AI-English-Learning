import { describe, expect, it } from "vitest";
import {
  STEP_IDS,
  completionRoute,
  debugJumpLinks,
  entryRoute,
  completeStep,
  flowAt,
  restartFrom,
} from "@/lib/learning-flow";

describe("step order", () => {
  it("is observe, notice, explore, guided-practice, practice, review", () => {
    expect([...STEP_IDS]).toEqual([
      "observe",
      "notice",
      "explore",
      "guided-practice",
      "practice",
      "review",
    ]);
  });
});

describe("flowAt unlock rule", () => {
  it("always unlocks the first step, even with nothing completed", () => {
    expect(flowAt("observe", [], { debug: false }).unlocked).toBe(true);
  });

  it("unlocks a step once the step before it is complete", () => {
    expect(flowAt("notice", ["observe"], { debug: false }).unlocked).toBe(true);
    expect(flowAt("review", ["practice"], { debug: false }).unlocked).toBe(true);
  });

  it("keeps a step locked while the step before it is incomplete, even if later steps are complete", () => {
    expect(flowAt("notice", [], { debug: false }).unlocked).toBe(false);
    expect(flowAt("explore", ["observe"], { debug: false }).unlocked).toBe(false);
    expect(flowAt("explore", ["observe", "practice"], { debug: false }).unlocked).toBe(false);
  });

  it("unlocks every step under debug, with no progress", () => {
    for (const step of STEP_IDS) {
      expect(flowAt(step, [], { debug: true }).unlocked).toBe(true);
    }
  });

  it("treats a path outside the flow as unlocked with no neighbours", () => {
    expect(flowAt(null, [], { debug: false })).toEqual({
      step: null,
      prev: null,
      next: null,
      unlocked: true,
      dots: Array(6).fill("upcoming"),
    });
  });
});

describe("flowAt prev / next", () => {
  it("makes Home the previous destination of the first step", () => {
    expect(flowAt("observe", [], { debug: false }).prev).toBe("/");
  });

  it("links each step to its neighbours", () => {
    const at = (step: (typeof STEP_IDS)[number]) => flowAt(step, [], { debug: false });
    expect(at("observe").next).toBe("/notice");
    expect(at("notice")).toMatchObject({ prev: "/observe", next: "/explore" });
    expect(at("explore")).toMatchObject({ prev: "/notice", next: "/guided-practice" });
    expect(at("guided-practice")).toMatchObject({ prev: "/explore", next: "/practice" });
    expect(at("practice")).toMatchObject({ prev: "/guided-practice", next: "/review" });
    expect(at("review").prev).toBe("/practice");
  });

  it("exits to Coming Soon after the last step", () => {
    expect(flowAt("review", [], { debug: false }).next).toBe("/coming-soon");
  });
});

describe("flowAt dots", () => {
  it("marks steps before the current one done, the current one current, later ones upcoming", () => {
    const dotsAt = (step: (typeof STEP_IDS)[number]) => flowAt(step, [], { debug: false }).dots;
    expect(dotsAt("observe")).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(dotsAt("notice")).toEqual(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(dotsAt("explore")).toEqual(["done", "done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(dotsAt("guided-practice")).toEqual(["done", "done", "done", "current", "upcoming", "upcoming"]);
    expect(dotsAt("practice")).toEqual(["done", "done", "done", "done", "current", "upcoming"]);
    expect(dotsAt("review")).toEqual(["done", "done", "done", "done", "done", "current"]);
  });

  it("ignores what is completed and the debug flag", () => {
    const bare = flowAt("explore", [], { debug: false }).dots;
    expect(flowAt("explore", ["observe", "practice"], { debug: false }).dots).toEqual(bare);
    expect(flowAt("explore", [], { debug: true }).dots).toEqual(bare);
  });

  it("shows every dot upcoming outside the flow", () => {
    expect(flowAt(null, [], { debug: false }).dots).toEqual(Array(6).fill("upcoming"));
  });
});

describe("completionRoute", () => {
  it("returns the route that follows each step", () => {
    expect(
      STEP_IDS.map((step) => completionRoute(step)),
    ).toEqual(["/notice", "/explore", "/guided-practice", "/practice", "/review", "/coming-soon"]);
  });
});

describe("entryRoute", () => {
  it("is the first step", () => {
    expect(entryRoute()).toBe("/observe");
  });
});

describe("debugJumpLinks", () => {
  it("starts with Home and then lists every step in order, carrying the debug flag", () => {
    expect(debugJumpLinks()).toEqual([
      { label: "Home", href: "/" },
      { label: "Observe", href: "/observe?debug=1" },
      { label: "Notice", href: "/notice?debug=1" },
      { label: "Explore", href: "/explore?debug=1" },
      { label: "Guided Practice", href: "/guided-practice?debug=1" },
      { label: "Practice", href: "/practice?debug=1" },
      { label: "Learning Summary", href: "/review?debug=1" },
    ]);
  });
});

describe("restartFrom", () => {
  function completeAll() {
    restartFrom("observe");
    for (const step of STEP_IDS) completeStep(step);
  }

  it("clears that step and every later step, keeping the earlier ones complete", () => {
    completeAll();
    expect(restartFrom("practice")).toEqual(["observe", "notice", "explore", "guided-practice"]);
  });

  it("from the first step clears everything", () => {
    completeAll();
    expect(restartFrom("observe")).toEqual([]);
  });

  it("from the last step clears only that step", () => {
    completeAll();
    expect(restartFrom("review")).toEqual(["observe", "notice", "explore", "guided-practice", "practice"]);
  });

  it("makes the cleared steps locked again, so Review is not reachable until Practice is completed", () => {
    completeAll();
    const completed = restartFrom("practice");
    expect(flowAt("review", completed, { debug: false }).unlocked).toBe(false);
    expect(flowAt("practice", completed, { debug: false }).unlocked).toBe(true);
  });

  it("leaves steps that were not complete alone", () => {
    restartFrom("observe");
    completeStep("observe");
    completeStep("notice");
    expect(restartFrom("explore")).toEqual(["observe", "notice"]);
  });
});
