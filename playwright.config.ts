import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // Mobile-first default: this app is a phone-only experience (see
      // spec.md "平台与形态"), so E2E runs at the same 390x844 viewport
      // ticket 01's style guide was checked against unless a test opts
      // into a different size via page.setViewportSize() (see
      // e2e/scaffold.spec.ts's desktop-viewport checks). A plain viewport
      // override is enough here — no touch/mobile UA emulation needed,
      // since nothing under test branches on touch vs. mouse input.
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
