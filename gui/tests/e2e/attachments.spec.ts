/**
 * 验收 8：图片附件（v0.0.2 `attachments.image`）。
 *
 * 契约（gui-integration-v0.0.2.md §6）：
 *  - 每轮 ≤5 张、单张 ≤5MB；GUI 先在本地校验（超限 → warn toast），
 *    协议层超限由 Hub 回 `too_large`（error → danger toast）；
 *  - 协议不回传附件元数据 → 图片只在**本轮回显**（img.chatimg），刷新/历史不显示；
 *  - 历史/刷新后图片消失是 v0.0.2 已知限制，不作为失败。
 */
import { expect, test } from "@playwright/test";
import {
  attachImages,
  expectDangerToast,
  expectToast,
  getActiveId,
  getCapabilities,
  getConn,
  openWorkbench,
  pngPayload,
  renameActive,
  sendAttachmentsViaAction,
  sendMessage,
  waitTurnDone,
} from "./helpers";

test.describe("真实 Hub 联调 · 附件", () => {
  test("@llm 8a) 选择 1 张 PNG → 预览 → 发送后本轮回显 img.chatimg + 正常收口", async ({
    page,
  }) => {
    await openWorkbench(page);
    expect(await getCapabilities(page)).toContain("attachments.image");

    const attachButton = page.locator('[data-action="attach-image"]');
    await expect(attachButton).toBeVisible();
    await expect(attachButton).toBeEnabled();

    await attachImages(page, [pngPayload("e2e-1x1.png")]);

    // 发送前预览
    await expect(page.locator('.composer [data-role="attach-preview"] .attach')).toHaveCount(1);
    await expect(
      page.locator('.composer [data-role="attach-preview"] img.attach__thumb'),
    ).toBeVisible();
    await expect(page.locator(".composer .attachrow__count")).toContainText("1/5");

    // 发送（真实 LLM 会收到 image_url）
    await sendMessage(page, "只回复两个字：收到");
    // 本轮用户消息里本地回显图片
    await expect(page.locator(".stream .msg--user img.chatimg")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".stream .msg--user img.chatimg")).toHaveCount(1);
    // 预览被清空
    await expect(page.locator('.composer [data-role="attach-preview"]')).toHaveCount(0);

    await waitTurnDone(page);
    await expect(page.locator(".stream .stats")).toHaveCount(1);

    await renameActive(page, `e2e-attach-one-${Date.now()}`);
  });

  test("@hub 8b) 附件超限：>5 张 / >5MB 被拦截提示；协议层 too_large 回传为 danger toast", async ({
    page,
  }) => {
    await openWorkbench(page);

    // 1) 单张 >5MB：本地校验直接拒绝（不进 WS）
    const big = {
      name: "e2e-big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1024, 1),
    };
    await attachImages(page, [big]);
    await expectToast(page, /5MB/);
    await expect(page.locator('.composer [data-role="attach-preview"] .attach')).toHaveCount(0);

    // 2) 6 张：最多收 5 张（第 6 张起提示）
    await attachImages(
      page,
      Array.from({ length: 6 }, (_, index) => pngPayload(`e2e-${index}.png`)),
    );
    await expectToast(page, /最多 5 张|at most 5/i);
    await expect(page.locator('.composer [data-role="attach-preview"] .attach')).toHaveCount(5);

    // 预览可移除（[data-remove]）
    await page.locator(".composer .attach [data-remove]").first().click();
    await expect(page.locator('.composer [data-role="attach-preview"] .attach')).toHaveCount(4);

    // 3) 协议层 too_large：绕过 Composer 本地校验，验证 Hub 错误码 → GUI danger toast
    await sendAttachmentsViaAction(page, "附件超限用例", 6);
    await expectDangerToast(page, /内容太大|Too large|最多 5 张/);

    // 会话状态没有被打倒：仍在当前会话、仍在线、没有进入新 turn 的 stats
    expect(await getActiveId(page)).toBeTruthy();
    expect(await getConn(page)).toBe("live");
    await expect(page.locator(".stream .stats")).toHaveCount(0);

    await renameActive(page, `e2e-attach-limits-${Date.now()}`);
  });
});
