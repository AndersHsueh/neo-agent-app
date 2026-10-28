import { expect, test } from "@playwright/test";
import { login, sendMessage } from "./helpers";

test.beforeEach(async ({ request }) => {
  // 每个用例一份干净的 dummy 世界（webServer 只起一次）
  await request.post("http://127.0.0.1:5292/api/dev/reset");
});

test("登录后按用户隔离会话", async ({ page }) => {
  await login(page, "neo@local", "neo");
  await expect(page.locator(".sidebar .session")).toHaveCount(3);

  await page.click(".account .panel__action");
  await expect(page.locator(".login")).toBeVisible();

  await page.fill(".login input[type=text]", "tom@local");
  await page.fill(".login input[type=password]", "tom");
  await page.click(".login__submit");
  await expect(page.locator(".sidebar .session")).toHaveCount(1);
  await expect(page.locator(".sidebar .session__title")).toContainText("tom");
});

test("一轮完整流程：提问 → 审批 → 升档 → 统计", async ({ page }) => {
  await login(page, "neo@local", "neo");
  await sendMessage(page, "先定位，别急着改。");

  const question = page.locator(".ask");
  await expect(question).toBeVisible({ timeout: 30_000 });
  await question.locator(".ask__opt").first().click();

  const approve = page.locator(".approve");
  await expect(approve).toBeVisible({ timeout: 30_000 });
  await approve.locator(".btn--primary").click();

  await expect(page.locator(".stats")).toBeVisible({ timeout: 40_000 });
  await expect(page.locator(".agent__name")).toHaveText("Mr. Andersson", { timeout: 10_000 });
  await expect(page.locator(".seg.is-on")).toHaveAttribute("class", /seg--deep/);
});

test("审批弹窗：焦点不逃出、Esc 关闭、背景 inert", async ({ page }) => {
  await login(page, "neo@local", "neo");
  await sendMessage(page, "先定位，别急着改。");
  await page.locator(".ask__opt").first().click();
  await expect(page.locator(".approve")).toBeVisible({ timeout: 30_000 });
  await page.locator(".approve__actions .btn--ghost").click();

  await expect(page.locator(".dialog")).toBeVisible();
  expect(await page.evaluate(() => document.getElementById("app")?.inert)).toBe(true);
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  const inDialog = await page.evaluate(() => Boolean(document.activeElement?.closest(".dialog")));
  const debug = await page.evaluate(
    () => document.activeElement?.outerHTML?.slice(0, 80) ?? "none",
  );
  expect(inDialog, debug).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator(".dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById("app")?.inert)).toBe(false);
});

test("断线重连后现场保留，且用户消息不重复", async ({ page }) => {
  await login(page, "neo@local", "neo");
  await sendMessage(page, "先定位，别急着改。");

  // dummy 在助手首段输出后主动断开（NEO_DUMMY_FAULTS=drop-ws）
  await expect(page.locator(".banner")).toContainText("连接中断", { timeout: 40_000 });
  await expect(page.locator(".connbar")).toHaveCount(0, { timeout: 30_000 });

  const userMessages = page.locator(".msg--user");
  await expect(userMessages).toHaveCount(2);
  await expect(page.locator(".ask")).toBeVisible();
});

test("命令面板可键盘操作，英文界面无中文残留", async ({ page }) => {
  await login(page, "neo@local", "neo");
  await page.keyboard.press("Meta+k");
  await expect(page.locator(".palette")).toBeVisible();
  await page.fill("#palette-input", "tier");
  await expect(page.locator(".palette__item").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".palette")).toHaveCount(0);

  await page.evaluate(() => {
    localStorage.setItem("neo.lang", "en");
    sessionStorage.clear();
  });
  await page.goto("/");
  await page.waitForSelector(".login", { timeout: 20_000 });
  await page.waitForSelector(".login", { timeout: 20_000 });
  await page.click(".login__submit");
  await expect(page.locator("#app")).toBeVisible();
  const cjk = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const out: string[] = [];
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = node.textContent?.trim() ?? "";
      const parent = node.parentElement;
      if (text && /[\u4e00-\u9fff]/.test(text) && !parent?.closest("pre,code,script,style"))
        out.push(text);
      node = walker.nextNode();
    }
    return out;
  });
  expect(cjk.filter((text) => text !== "文" && text !== "中文")).toEqual([]);
});
