import Link from "next/link";
import { DebugJumpBar } from "@/components/debug-jump-bar";
import { ComingNextList } from "@/components/home/coming-next-list";
import { GreetingBanner } from "@/components/home/greeting-banner";
import { MissionCard } from "@/components/home/mission-card";
import { StartLessonButton } from "@/components/home/start-lesson-button";
import { TopNav } from "@/components/top-nav";
import { HOME_CONTENT } from "@/content/home";

export default function Home() {
  return (
    <>
      <DebugJumpBar />
      <main className="flex flex-1 flex-col gap-6 px-5 py-6">
        <TopNav />

        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-muted">
              <span aria-hidden>☀️</span>
              Good Morning
            </span>
            <GreetingBanner />
            <h1 className="text-display text-foreground">{HOME_CONTENT.tagline.headlineEn}</h1>
            {/* Product tagline + the "every day just 5 minutes" promise —
                both above the fold (spec.md user story 12). */}
            <p className="text-body-lg text-foreground">{HOME_CONTENT.tagline.zh}</p>
            <p className="text-body text-muted">{HOME_CONTENT.tagline.promiseZh}</p>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-aspect
              decorative crop; next/image's layout machinery buys nothing here.
              aspect-[3/2] matches hero.jpg's native 349x230 (~1.52) ratio —
              a portrait crop (previously 3/4) was cutting off most of the
              photo (UI draft review 2026-08-07 feedback). */}
          <img
            src="/assets/home/hero.jpg"
            alt=""
            aria-hidden
            className="aspect-[3/2] w-2/5 shrink-0 rounded-card object-cover"
          />
        </div>

        {/* Shared card shell (UI draft, 2026-08-07 review): header row +
            MissionCard's photo/text row + the Start button all live inside
            one bordered/shadowed card, rather than MissionCard carrying its
            own chrome and the button floating separately at page-bottom. */}
        <div className="flex flex-col gap-4 rounded-card border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold tracking-wide text-accent uppercase">
              Today&apos;s Mission
            </span>
            <span className="flex items-center gap-1 text-body-sm text-muted">
              <span aria-hidden>🕐</span>
              {HOME_CONTENT.course.duration}
            </span>
          </div>

          <MissionCard />

          <StartLessonButton />
        </div>

        <ComingNextList />

        <div className="mt-auto flex flex-col gap-4 pt-6">
          <Link
            href="/style-guide"
            className="text-center text-caption text-muted underline-offset-2 hover:underline"
          >
            查看样式基准页
          </Link>
        </div>
      </main>
    </>
  );
}
