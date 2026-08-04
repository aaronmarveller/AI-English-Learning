import type { Metadata } from "next";
import { Poppins, Noto_Sans_SC } from "next/font/google";
import { PhoneShell } from "@/components/phone-shell";
import "./globals.css";

// Geometric sans-serif for English copy.
const fontEn = Poppins({
  variable: "--font-en",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Source Han Sans (distributed by Google as Noto Sans SC) for Chinese copy.
// Weight set mirrors fontEn's so every --text-*--font-weight step in globals.css
// has a matching real cut in both scripts (no browser-synthesized bold).
const fontZh = Noto_Sans_SC({
  variable: "--font-zh",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Greeting Somebody — AI English Learning",
  description: "手机端优先的英语口语练习课程",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={`${fontEn.variable} ${fontZh.variable} h-full antialiased`}>
      <body className="min-h-full">
        <PhoneShell>{children}</PhoneShell>
      </body>
    </html>
  );
}
