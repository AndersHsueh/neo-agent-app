/**
 * 验收 9：错误路径（Hub 不可达）。
 *
 * 注入方式（与 Lead 约定）：Playwright page.route 拦截 `GET /__neo/endpoint`，
 * 不改 gui 源码、不起停真实 Hub。
 *  a) 503 {ok:false} → 离线兜底页 `.login[data-role="hub-offline"]` + 重试按钮可恢复；
 *  b) 200 但 url 指向不可达端口 → 不进登录页，工作台显示 `.connbar` 离线条并持续退避重试。
 */
import { expect, test } from "@playwright/test";
import { getBoot, getBootError, getConn, preparePage, waitLive } from "./helpers";

test.describe("错误路径", () => {
  test("@gui 9a) 发现失败（503）→ 离线兜底页", async ({ page }) => {
    await page.route("**/__neo/endpoint", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "hub down" }),
      });
    });

    await preparePage(page);
    await page.goto("/?lang=zh");

    // 离线兜底：登录页 + 明确原因 + 重试按钮
    const offline = page.locator('.login[data-role="hub-offline"]');
    await expect(offline).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-role="hub-error"]')).toContainText("hub down");
    await expect(page.locator('[data-action="retry-discovery"]')).toBeVisible();
    await expect.poll(() => getBoot(page)).toBe("offline");
    expect(await getBootError(page)).toBe("hub down");
  });

  test("@hub 9a) 离线后重试可发现并登录", async ({ page }) => {
    let down = true;
    await page.route("**/__neo/endpoint", async (route) => {
      if (down) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, reason: "hub down" }),
        });
        return;
      }
      await route.continue();
    });

    await preparePage(page);
    await page.goto("/?lang=zh");
    await expect(page.locator('.login[data-role="hub-offline"]')).toBeVisible({ timeout: 20_000 });

    down = false;
    await page.locator('[data-action="retry-discovery"]').click();
    await expect(page.locator("#app")).toBeVisible({ timeout: 45_000 });
    await waitLive(page);
    await expect(page.locator(".login")).toHaveCount(0);
  });

  test("@gui 9b) 发现成功但 Hub 不可达（坏 url）→ .connbar 离线提示 + 持续退避重试，不进登录页", async ({
    page,
  }) => {
    let hits = 0;
    await page.route("**/__neo/endpoint", async (route) => {
      hits += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          url: "ws://127.0.0.1:1/ws",
          token: "0".repeat(64),
          user: { id: "local", email: "local@localhost", displayName: "Local", role: "owner" },
          coreVersion: "0.0.2",
          protocolVersion: "1.2",
        }),
      });
    });

    await preparePage(page);
    await page.goto("/?lang=zh");

    // §8 口径：不回到登录页，工作台显示连接中断（离线/重连中）
    await expect(page.locator("#app")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".connbar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".connbar")).toContainText(/连接断开|Disconnected/);
    await expect(page.locator('.login[data-role="hub-offline"]')).toHaveCount(0);
    await expect.poll(() => getConn(page)).not.toBe("live");

    // 持续退避重试（每次重连前重新发现端点）：>1 次端点请求
    await expect
      .poll(() => hits, { timeout: 30_000, intervals: [250, 500, 1_000] })
      .toBeGreaterThanOrEqual(2);

    // 不退化成崩溃/白屏：工作台骨架仍在
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator("#input")).toBeVisible();
  });
});
