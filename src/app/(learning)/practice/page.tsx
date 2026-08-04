import type { Metadata } from "next";
import { PracticePageContent } from "@/components/practice/practice-page-content";

export const metadata: Metadata = {
  title: "Practice — Greeting Somebody",
};

// The real Practice page (ticket 08): a text-driven conversation with Emily
// that walks the learner through the 4-state Conversation State Machine.
// Body lives in PracticePageContent (a Client Component, for its practice
// store + in-flight request state) so this file can stay a Server
// Component and keep exporting `metadata` like every other learning page.
// Voice input (ticket 09) and the full-transcript drawer (ticket 10) build
// on top of this without changing this file.
export default function PracticePage() {
  return <PracticePageContent />;
}
