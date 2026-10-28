import { defineConfig, devices } from "@playwright/test";

/**
 * e2e：Playwright 自起 dummy（带故障注入）+ Vite。
 * 浏览器用本机 Chrome（channel: chrome），不额外下载 Chromium。
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5296",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: [
    {
      command: "bun run ../dummy-serv/src/index.ts",
      port: 5292,
      reuseExistingServer: false,
      env: { NEO_DUMMY_FAULTS: "drop-ws" },
      timeout: 20_000,
    },
    {
      command: "bun x vite --port 5296 --strictPort",
      port: 5296,
      reuseExistingServer: false,
      timeout: 40_000,
    },
  ],
});
