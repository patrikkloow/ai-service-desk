import { defineConfig } from "vitest/config";

// Only the explicit live-smoke command loads this configuration.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/live-smoke.test.ts"],
    env: { AI_LIVE_SMOKE: "1" },
  },
});
