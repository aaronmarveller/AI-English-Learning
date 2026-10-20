import type { Metadata } from "next";
import { ExplorePageContent } from "@/components/explore/explore-page-content";

export const metadata: Metadata = {
  title: "Explore — Greeting Someone",
};

// The real Explore page: four expandable sections of text expression cards
// (each with an Explore More group), the Conversation Formula, and the
// pronunciation buttons. Body lives in
// ExplorePageContent (a Client Component, for its open/closed section
// state) so this file can stay a Server Component and keep exporting
// `metadata` like every other learning page.
export default function ExplorePage() {
  return <ExplorePageContent />;
}
