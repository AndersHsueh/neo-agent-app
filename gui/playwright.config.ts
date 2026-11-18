import { defineConfig, devices } from "@playwright/test";

/**
 * 默认只跑 `@gui`：布局、文案、离线兜底。不连 Hub，也不连模型。
 *
 * 真实 Hub / LLM 是显式集成组，不在默认命令里：
 *   NEO_E2E_HUB=1 bun x playwright test --project=hub
 *   NEO_E2E_LLM=1 bun x playwright test --project=llm
 *
 * 打开之后如果 Hub 或提供方不在，用例失败，不会把 ECONNREFUSED 记成跳过或通过。
 * Hub 组前置：`matrix-core hub --dev-auth`，发现文件 ~/.neo/run/core.json。
 * LLM 组还要 ~/.neo/settings.json 里的 provider 真能回文。
 */
const enableHub = process.env.NEO_E2E_HUB === "1";
const enableLlm = process.env.NEO_E2E_LLM === "1";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5296",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "gui",
      grep: /@gui/,
      grepInvert: /@hub|@llm/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    ...(enableHub
      ? [
          {
            name: "hub",
            grep: /@hub/,
            grepInvert: /@llm/,
            use: { ...devices["Desktop Chrome"], channel: "chrome" },
          },
        ]
      : []),
    ...(enableLlm
      ? [
          {
            name: "llm",
            grep: /@llm/,
            use: { ...devices["Desktop Chrome"], channel: "chrome" },
          },
        ]
      : []),
  ],
  webServer: {
    // 只起 Vite；Hub 由外部提供（测试只读 ~/.neo/run/core.json）。
    command: "bun x vite --port 5296 --strictPort",
    port: 5296,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
