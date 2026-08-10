import type { Metadata } from "next";
import { ReviewPageContent } from "@/components/review/review-page-content";

export const metadata: Metadata = {
  title: "Learning Summary — Greeting Somebody",
};

// The internal Review route presents the learner-facing Learning Summary,
// sequenced by this run's accumulated turnRecords, plus Retry Lesson / Continue. Body lives
// in ReviewPageContent (a Client Component, for the practice store + the
// sequential-reveal timer) so this file can stay a Server Component and keep
// exporting `metadata` like every other learning page.
export default function ReviewPage() {
  return <ReviewPageContent />;
}
