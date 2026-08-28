import { defineConfig, devices } from "@playwright/test";

// Set by `npm run e2e:docker` — the suite runs against the real dockerized
// backend (with PLAYWRIGHT_SKIP_WEBSERVER + its own PLAYWRIGHT_BASE_URL)
// instead of page.route() stubs. See e2e/README.md.
const IS_REAL_API = process.env.E2E_REAL_API === "true";

// Override for a pre-running server (typically together with PLAYWRIGHT_SKIP_WEBSERVER).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const IS_CI = !!process.env.CI;
// Keep the webServer command authoritative for feature flags. Opt in only when
// the pre-running server was started with the same flags.
const REUSE_EXISTING_SERVER = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true";
const VIRTUAL_SERVER_TOOL_TRY_IT_FLAG =
  process.env.VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT === "true"
    ? " VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT=true"
    : "";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  // Real mode: the sqlite-backed test gateway chokes on too many concurrent real logins.
  workers: IS_REAL_API ? 2 : IS_CI ? 2 : undefined,

  reporter: IS_CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }], ["list"]]
    : [["list"], ["html", { open: "on-failure", outputFolder: "playwright-report" }]],

  outputDir: "./test-results",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    extraHTTPHeaders: {
      // Identify Playwright traffic in dev-server logs.
      "X-Playwright": "1",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // e2e:docker sets PLAYWRIGHT_SKIP_WEBSERVER — it points at the already-running docker stack instead.
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `VITE_ENABLE_TOOL_PREVIEW=true${VIRTUAL_SERVER_TOOL_TRY_IT_FLAG} npm run dev:e2e`,
        url: BASE_URL,
        reuseExistingServer: REUSE_EXISTING_SERVER,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
