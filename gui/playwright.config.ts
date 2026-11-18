import { defineConfig, devices } from "@playwright/test";

/**
 * 默认只跑 `@gui`：布局、文案、离线兜底。不连 Hub，也不连模型。
 *
 * 真实 Hub / LLM 是显式集成组，不在默认命令里：
 *   NEO_E2E_HUB=1 bun x playwright test --project=hub
 *   NEO_E2E_FAKE_LLM=1 bun x playwright test --project=fake-llm
 *   NEO_E2E_LLM=1 bun x playwright test --project=llm
 *
 * fake-llm 跑的是同一批 @llm 用例，但提供方必须是本机假 OpenAI，不花外部 token。
 * llm 才是外部真提供方，默认不跑。
 * 打开之后如果 Hub 或提供方不在，用例失败，不会把 ECONNREFUSED 记成跳过或通过。
 * Hub 组前置：已在跑的 hub，且 Vite 进程的 HOME 能读到那份 core.json。
 */
const enableHub = process.env.NEO_E2E_HUB === "1";
const enableFakeLlm = process.env.NEO_E2E_FAKE_LLM === "1";
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
    ...(enableFakeLlm
      ? [
          {
            name: "fake-llm",
            grep: /@llm/,
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
