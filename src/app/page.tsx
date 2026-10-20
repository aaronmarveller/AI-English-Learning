import { ClockIcon } from "@/components/icons";
import { DebugJumpBar } from "@/components/debug-jump-bar";
import { ComingNextList } from "@/components/home/coming-next-list";
import { GreetingBanner } from "@/components/home/greeting-banner";
import { MissionCard } from "@/components/home/mission-card";
import { StyleGuideLink } from "@/components/home/style-guide-link";
import { StartLessonButton } from "@/components/home/start-lesson-button";
import { HOME_CONTENT } from "@/content/home";

export default function Home() {
  return (
    <>
      <DebugJumpBar />
      <main className="relative flex flex-1 flex-col gap-6 overflow-x-clip px-5 py-6 [&>*:not([data-hero])]:relative">
        {/* Decorative backdrop: top-right, bleeding to the edges and running
            up behind the header. Its light left side sits under the hero text,
            and a left-to-right fade keeps that text readable. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative
            backdrop; next/image's layout machinery buys nothing here. */}
        <div data-hero className="pointer-events-none absolute top-0 right-0 h-[19rem] w-[85%] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_55%)]">
          {/* Zoomed in on the photo's top-left corner. */}
          <img
            src="/assets/home/hero.jpg"
            alt=""
            aria-hidden
            className="h-full w-full origin-top-left scale-[1.01] object-cover object-left-top"
          />
        </div>

        <div className="flex flex-col gap-3">
          <GreetingBanner />
          <h1
            className="text-display whitespace-nowrap text-foreground"
            style={{ fontSize: "clamp(calc(1.5rem - 3px), calc(8vw - 3px), calc(2rem - 3px))" }}
          >
            {HOME_CONTENT.tagline.headlineEn}
          </h1>
          {/* Product proposition + the "10 minutes a day" promise — both
              above the fold (spec.md user story 12). */}
          <div className="flex flex-col gap-0.5">
            <p className="text-body-lg text-foreground" style={{ fontSize: "calc(1rem - 3px)" }}>
              {HOME_CONTENT.tagline.zh}
            </p>
            <p className="text-body-lg text-foreground" style={{ fontSize: "calc(1rem - 3px)" }}>
              {HOME_CONTENT.tagline.promiseZh}
            </p>
          </div>
        </div>

        {/* Shared card shell (UI draft, 2026-08-07 review): header row +
            MissionCard's photo/text row + the Start button all live inside
            one bordered/shadowed card, rather than MissionCard carrying its
            own chrome and the button floating separately at page-bottom. */}
        <div className="-mx-3 flex flex-col gap-2.5 rounded-card border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold tracking-wide text-accent uppercase">
              Today&apos;s Mission
            </span>
            <span className="flex items-center gap-1 text-body-sm text-muted">
              <ClockIcon className="h-4 w-4" />
              {HOME_CONTENT.course.duration}
            </span>
          </div>

          <MissionCard />

          <StartLessonButton />
        </div>

        <ComingNextList />

        <div className="mt-auto flex flex-col gap-4 pt-6">
          <StyleGuideLink />
        </div>
      </main>
    </>
  );
}
