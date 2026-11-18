/**
 * 验收 6：命令面板 / command.run（v0.0.2 `command.structured`）。
 *
 * 真实 Hub 行为（勿与配置打架）：
 *  - /tier deep_reasoning 实际会因 minimax(anthropic 未接入) 降级到 default，
 *    所以这里用 /tier balanced（真实生效：meta.tier/model 变化）。
 *  - 未知命令由 Hub 回 `unsupported`，GUI 应渲染错误结果块且不崩。
 */
import { expect, test } from "@playwright/test";
import {
  getActiveId,
  getActiveMeta,
  openPalette,
  openWorkbench,
  renameActive,
  runPaletteCommand,
} from "./helpers";

test.describe("真实 Hub 联调 · 命令", () => {
  test("@hub 6a) /tier balanced 生效：命令结果块渲染 + 档位标识/会话 meta 变化", async ({
    page,
  }) => {
    await openWorkbench(page);
    const before = await getActiveMeta(page);
    expect(before?.tier).not.toBe("balanced");

    await runPaletteCommand(page, "/tier balanced");

    // 结构化结果块（.cmdresult）渲染在命令面板底部
    const card = page.locator(".palette__result .cmdresult");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).not.toHaveClass(/is-error/);
    await expect(card).toContainText("balanced");

    // 关闭面板 → 顶部档位标识切换成 balanced；会话 meta 同步
    await page.keyboard.press("Escape");
    await expect(page.locator(".palette")).toHaveCount(0);
    await expect
      .poll(async () => (await getActiveMeta(page))?.tier ?? null, { timeout: 15_000 })
      .toBe("balanced");
    await expect(page.locator(".seg.is-on")).toContainText(/平衡|Balanced/);

    // 再切回 fast：验证命令可重复生效（hub 侧 fast → deepseek-flash）
    await runPaletteCommand(page, "/tier fast");
    await expect(page.locator(".palette__result .cmdresult")).toContainText("fast");
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => (await getActiveMeta(page))?.tier ?? null, { timeout: 15_000 })
      .toBe("fast");
    await expect(page.locator(".seg.is-on")).toContainText(/快速|Fast/);

    await renameActive(page, `e2e-cmd-tier-${Date.now()}`);
  });

  test("@hub 6b) 未知命令 /nope：错误结果块 + 页面不崩（会话不变、仍在线）", async ({ page }) => {
    await openWorkbench(page);
    const sessionId = await getActiveId(page);

    await openPalette(page);
    await page.locator("#palette-input").fill("/nope");
    // 未知命令条目存在（回车提交，由 hub 判定）
    await expect(page.locator(".palette__item").first()).toContainText("/nope");
    await page.locator("#palette-input").press("Enter");

    const card = page.locator(".palette__result .cmdresult.is-error");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("不支持的命令");
    // Hub 回 error.code=unsupported；GUI 当前只渲染 message（不渲染 code），故不断言 code。

    // 关面板后页面完好：仍在线、同一会话、没有把异常抛到页面
    await page.keyboard.press("Escape");
    await expect(page.locator(".palette")).toHaveCount(0);
    await expect(page.locator("#app")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __neo: { store: { connection: { value: string } } };
              }
            ).__neo.store.connection.value,
        ),
      )
      .toBe("live");
    expect(await getActiveId(page)).toBe(sessionId);

    await renameActive(page, `e2e-cmd-unknown-${Date.now()}`);
  });
});
