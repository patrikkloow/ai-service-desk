import { spawnSync } from "node:child_process";
// Local secrets are read by Node, never printed or forwarded as command arguments.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Environment-only configuration is supported. */
}
if (!process.env.OPENAI_API_KEY) {
  console.log("live smoke not run: no provider key available");
} else if (!process.env.OPENAI_MODEL) {
  console.log("live smoke not run: configure OPENAI_MODEL server-side");
  process.exitCode = 1;
} else {
  const run = spawnSync(
    "npx",
    [
      "vitest",
      "run",
      "--config",
      "vitest.live.config.ts",
      "--reporter=verbose",
    ],
    { stdio: "inherit", env: { ...process.env, AI_LIVE_SMOKE: "1" } },
  );
  process.exitCode = run.status ?? 1;
}
