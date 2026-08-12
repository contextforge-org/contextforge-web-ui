import { defineConfig } from "vitest/config";

// Standalone config so this package isn't swept up by client/vitest.config.ts
// (React/jsdom setup for the SPA) when vitest searches up the directory tree.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    // REDIS_URL defaults to memory://, and config.ts fails closed when that's
    // paired with COOKIE_SECURE's own default of "true" — opt out for tests.
    env: { COOKIE_SECURE: "false" },
  },
});
