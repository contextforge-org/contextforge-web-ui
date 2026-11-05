/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />
/// <reference types="node" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { versionDefines } from "./build-constants";

const IS_CI = !!process.env.CI;

export default defineConfig({
  plugins: [react()] as any,
  // Mirrors vite.config.ts's version constants for code under test.
  define: versionDefines,
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    testTimeout: 15000,
    // Console output only for failing tests.
    silent: "passed-only",
    // CI logs list only failures; explicit reporters drop the auto github-actions one, so re-add it.
    reporters: IS_CI
      ? ["minimal", ...(process.env.GITHUB_ACTIONS ? ["github-actions"] : [])]
      : ["default"],
    // Vitest runs Testing-Library specs under src/; Playwright specs live
    // under e2e/ and must not be picked up here (they use @playwright/test).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "e2e", "playwright-report", "test-results"],
    typecheck: {
      include: ["src/**/*.test.{ts,tsx}"],
    },
    coverage: {
      provider: "v8",
      // Per-file table lives in coverage/index.html; CI uploads nothing, so it skips the files.
      reporter: IS_CI ? ["text-summary"] : ["text-summary", "json", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/",
        "e2e/",
        "src/test/",
        "src/types/",
        "**/types.ts",
        "src/main.tsx",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
