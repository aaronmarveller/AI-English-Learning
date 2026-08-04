import type { Metadata } from "next";
import { ReviewPageContent } from "@/components/review/review-page-content";

export const metadata: Metadata = {
  title: "Review — Greeting Somebody",
};

// The real Review page (ticket 11): Emily's Chinese recap, sequenced by this
// run's accumulated highlightKeys, plus Retry Lesson / Continue. Body lives
// in ReviewPageContent (a Client Component, for the practice store + the
// sequential-reveal timer) so this file can stay a Server Component and keep
// exporting `metadata` like every other learning page.
export default function ReviewPage() {
  return <ReviewPageContent />;
}
