import Link from "next/link";
import { DebugJumpBar } from "@/components/debug-jump-bar";
import { ComingNextList } from "@/components/home/coming-next-list";
import { GreetingBanner } from "@/components/home/greeting-banner";
import { HomeTopBar } from "@/components/home/home-top-bar";
import { MissionCard } from "@/components/home/mission-card";
import { StartLessonButton } from "@/components/home/start-lesson-button";
import { HOME_CONTENT } from "@/content/home";

export default function Home() {
  return (
    <>
      <DebugJumpBar />
      <main className="flex flex-1 flex-col gap-6 px-5 py-6">
        <HomeTopBar />

        <div className="flex flex-col gap-3">
          <GreetingBanner />
          {/* Product tagline + the "every day just 5 minutes" promise —
              both above the fold (spec.md user story 12). */}
          <p className="text-body-lg text-foreground">{HOME_CONTENT.tagline.zh}</p>
          <span className="w-fit rounded-button bg-accent-soft px-3 py-1 text-body-sm font-medium text-accent">
            {HOME_CONTENT.tagline.promiseZh}
          </span>
        </div>

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
