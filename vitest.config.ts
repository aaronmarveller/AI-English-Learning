import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Minimal vitest config for the repo's `test:unit` script. Only the `@/*`
 * path alias needs wiring up here (mirroring tsconfig.json's own `paths`)
 * so test files can import source modules the same way app code does — a
 * hand-written `resolve.alias` is enough for that single alias, so this
 * skips adding a `vite-tsconfig-paths` dependency just to read the same
 * mapping out of tsconfig.json.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Scoped to this repo's own unit-test convention (flat *.test.ts files
    // under src/, no __tests__ directory) so vitest's default glob doesn't
    // also try to collect e2e/**/*.spec.ts — those are Playwright specs
    // (test:e2e), built on `@playwright/test`'s own `test.describe`, and
    // fail immediately if loaded under vitest's runner instead.
    include: ["src/**/*.test.ts"],
  },
});
