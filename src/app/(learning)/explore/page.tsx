import type { Metadata } from "next";
import { ExplorePageContent } from "@/components/explore/explore-page-content";

export const metadata: Metadata = {
  title: "Explore — Greeting Somebody",
};

// The real Explore page (ticket 06): 4 Conversation Chunk Sections holding
// the lesson's 12 Key Expressions, a vertical 回应 ladder, and the speech
// -synthesis-backed pronunciation buttons. Body lives in
// ExplorePageContent (a Client Component, for its open/closed section
// state) so this file can stay a Server Component and keep exporting
// `metadata` like every other learning page.
export default function ExplorePage() {
  return <ExplorePageContent />;
}
