import type { Metadata } from "next";
import { NoticePageContent } from "@/components/notice/notice-page-content";

export const metadata: Metadata = {
  title: "Notice — Greeting Someone",
};

export default function NoticePage() {
  return <NoticePageContent />;
}
