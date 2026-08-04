import type { Metadata } from "next";
import { NoticePageContent } from "@/components/notice/notice-page-content";

export const metadata: Metadata = {
  title: "Notice — Greeting Somebody",
};

export default function NoticePage() {
  return <NoticePageContent />;
}
