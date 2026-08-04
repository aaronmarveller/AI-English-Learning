import type { ReactNode } from "react";

/**
 * App-wide layout shell: full width on mobile, a fixed-width centered
 * "phone" column on wider viewports. `overflow-x-hidden` on the outer
 * element is a defense-in-depth guard against any child accidentally
 * introducing horizontal scroll.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full justify-center overflow-x-hidden bg-page">
      <div className="flex w-full max-w-[430px] flex-1 flex-col bg-page">
        {children}
      </div>
    </div>
  );
}
