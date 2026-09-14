import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    deps: {
      optimizer: {
        ssr: {
          include: ["convex-test"],
        },
      },
    },
  },
});
