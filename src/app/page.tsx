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
        <TopNav
          left={
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-muted">
              <span aria-hidden>☀️</span>
              Good Morning
            </span>
          }
        />

        <div className="flex flex-col gap-3">
          <GreetingBanner />
          <h1 className="text-display text-foreground">{HOME_CONTENT.tagline.headlineEn}</h1>
          {/* Product tagline + the "every day just 5 minutes" promise —
              both above the fold (spec.md user story 12). */}
          <p className="text-body-lg text-foreground">{HOME_CONTENT.tagline.zh}</p>
          <p className="text-body text-muted">{HOME_CONTENT.tagline.promiseZh}</p>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-aspect
            decorative crop; next/image's layout machinery buys nothing here. */}
        <img
          src="/assets/home/hero.jpg"
          alt=""
          aria-hidden
          className="aspect-[16/9] w-full rounded-card object-cover"
        />

        <MissionCard />

        <ComingNextList />

        <div className="mt-auto flex flex-col gap-4 pt-6">
          <StartLessonButton />
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
