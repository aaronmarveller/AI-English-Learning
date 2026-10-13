import type { Metadata } from "next";
import { PracticePageContent } from "@/components/practice/practice-page-content";

export const metadata: Metadata = {
  title: "Practice — Greeting Somebody",
};

// Practice: a live voice Call with Emily. Body lives in PracticePageContent (a
// Client Component, for the Practice store and the Realtime connection) so this
// file can stay a Server Component and keep exporting `metadata` like every
// other learning page.
export default function PracticePage() {
  return <PracticePageContent />;
}
