import type { Metadata } from "next";
import { GuidedPracticeContent } from "@/components/guided-practice/guided-practice-content";

export const metadata: Metadata = {
  title: "Guided Practice — Greeting Someone",
};

// Guided Practice: the Learning Flow step between Explore and Practice
// (CONTEXT.md "Guided Practice"). The body is a Client Component so this
// page can stay a Server Component and keep exporting `metadata`.
export default function GuidedPracticePage() {
  return <GuidedPracticeContent />;
}
