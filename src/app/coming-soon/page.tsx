import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Coming Soon — Greeting Somebody",
};

// Standalone placeholder (not part of the (learning) route group — no
// back/course-name/dots header). Reached from "继续下一课" on Review, and
// will later be the destination for any locked future lesson.
export default function ComingSoonPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-display" aria-hidden>
        🚧
      </p>
      <h1 className="text-h1">Coming Soon</h1>
      <p className="text-body text-muted">这不是 bug——这部分内容还在开发中，敬请期待。</p>
      <Link href="/" className="btn-primary active:scale-[0.98] active:brightness-90">
        返回 Home
      </Link>
    </main>
  );
}
