import { defineConfig, devices } from "@playwright/test";

/**
 * e2e：**真实 neo-core-serve v0.0.2 Hub**（不是 dummy-serv）。
 *
 * 前置（测试不负责启动 Hub，也不杀/重启它）：
 *   1. `matrix-core hub --dev-auth` 已在跑，发现文件 ~/.neo/run/core.json 存在；
 *   2. ~/.neo/settings.json 里的 provider 可用（真实 LLM，一轮约 3–8s）。
 *
 * Playwright 只负责起 Vite dev server（5296）。GUI 启动时通过 Vite 插件
 * `GET /__neo/endpoint` 发现 Hub 并自动登录，因此不再有 dummy 的登录流程，
 * 也不再需要 NEO_DUMMY_FAULTS 故障注入（错误路径用 page.route 拦端点）。
 *
 * 真实链路慢：单用例 120s、断言给足；worker 串行（v0.0.2 同一 session 只允许
 * 一个客户端 attach，串行能避免用例间抢同一会话）。
 */
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
  projects: [{ name: "chrome-hub", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    // 只起 Vite；Hub 由外部提供（测试只读 ~/.neo/run/core.json）。
    command: "bun x vite --port 5296 --strictPort",
    port: 5296,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
