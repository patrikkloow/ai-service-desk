import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "edge-runtime",
    // A real key or live mode inherited from a developer shell cannot enable CI network calls.
    env: {
      AI_MODEL_MODE: "fake",
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "",
      AI_LIVE_SMOKE: "",
    },
    exclude: ["convex/live-smoke.test.ts"],
    include: ["convex/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    deps: {
      optimizer: {
        ssr: {
          include: ["convex-test"],
        },
      },
    },
  },
});
