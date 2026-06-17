import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    hookTimeout: 120000,
    testTimeout: 120000,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/auth/admin-auth.ts",
        "src/lib/db/migrations.ts",
        "src/lib/env.ts",
        "src/lib/ingest/gmail-query.ts",
        "src/lib/ingest/gmail.ts",
        "src/lib/ingest/google-auth.ts",
        "src/lib/ingest/juno-parser.ts",
        "src/lib/ingest/settings.ts",
        "src/lib/juno-live/delay.ts",
        "src/lib/juno-live/lookup-runner.ts",
        "src/lib/juno-live/parser.ts",
        "src/lib/juno-live/settings.ts",
        "src/lib/juno-live/url.ts",
        "src/lib/logging/logger.ts",
        "src/lib/setup/status.ts",
      ],
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
