"use client";

import Link from "next/link";
import { useDebugFlag } from "@/lib/debug";

/** Developer-only link to the style guide; shown only in debug mode (`?debug=1`). */
export function StyleGuideLink() {
  const debug = useDebugFlag();
  if (!debug) return null;

  return (
    <Link
      href="/style-guide"
      className="text-center text-caption text-muted underline-offset-2 hover:underline"
    >
      查看样式基准页
    </Link>
  );
}
