/**
 * 验收 1/2/3/4/5/7：真实 Hub（neo-core-serve v0.0.2）+ 真实 LLM 的主链路。
 *
 * 注意：每个 Playwright context 都是干净 localStorage → GUI 启动时会自动新建
 * 一个会话（标题「新会话 HH:MM:SS」）。用例自建自用，不看 ~/.neo/sessions 里
 * 的历史条数；标题最后统一改名成 e2e- 前缀（便于识别测试产物）。
 */
import { expect, test } from "@playwright/test";
import {
  assistantTexts,
  fetchTranscriptViaAction,
  getActiveId,
  getActiveMeta,
  getCapabilities,
  getEndpointUrl,
  getSessionStatus,
  getSessions,
  openWorkbench,
  renameActive,
  requireActiveId,
  selectSessionViaUi,
  sendMessage,
  statsCount,
  userMessageTexts,
  waitActiveChange,
  waitActiveId,
  waitLive,
  waitTurnOrOutage,
  waitTurnStartedOrOutage,
  waitUserMessage,
} from "./helpers";

/** 真实 LLM 的一句话；只要求两个字的回复，便于断言「不重复/不缺字」。 */
const PING = "只回复两个字：收到";

/** 真实模型没接上时跳过，不把 ECONNREFUSED 算成 GUI 失败。 */
async function requireModel(page: Parameters<typeof waitTurnOrOutage>[0]): Promise<void> {
  const settled = await waitTurnOrOutage(page);
  if (settled.outage) {
    test.skip(
      true,
      `provider connection failure (environment, not a GUI failure): ${settled.outage}`,
    );
  }
}

test.describe("真实 Hub 联调 · 主链路", () => {
  test("1) 启动：/__neo/endpoint 发现即登录（无登录页），hub 在线 + 会话列表", async ({ page }) => {
    await openWorkbench(page);

    // 无登录页（LoginView 只在发现失败时兜底）
    await expect(page.locator(".login")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".sidebar .session").first()).toBeVisible();

    // 自动 attach 了一个会话（真实 Hub ready.capabilities 含 sessions）
    const activeId = await getActiveId(page);
    expect(activeId).toBeTruthy();
    expect((await getSessions(page)).length).toBeGreaterThan(0);
    // 侧栏计数与 session.list 一致
    const listed = await getSessions(page);
    await expect(page.locator(".sidebar__headline .count")).toHaveText(String(listed.length));
    const caps = await getCapabilities(page);
    expect(caps).toEqual(
      expect.arrayContaining(["sessions", "transcript.replay", "attachments.image"]),
    );

    // hub 标签 + connection=live（不是 dummy 5292；不显示离线条）
    await expect(page.locator(".hubmeta")).toContainText("HUB");
    await expect(page.locator(".hubmeta")).toContainText(/在线|Live/);
    await expect(page.locator(".connbar")).toHaveCount(0);
    const endpoint = await getEndpointUrl(page);
    expect(endpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/ws$/);
    expect(endpoint).not.toContain("5292");

    // 会话头显示真实 id + model（Hub snapshot.meta，不是 session.list 的占位值）
    await expect(page.locator(".sessionhead__title")).toBeVisible();
    await expect(page.locator(".sessionhead__meta .mono")).toContainText(activeId ?? "");
    expect((await getActiveMeta(page))?.model).toBeTruthy();

    await renameActive(page, `e2e-startup-${Date.now()}`);
  });

  test("2) @llm 新建会话 → 出现在列表且被选中；一轮 turn 流式正文 + .stats + 文本不重复", async ({
    page,
  }) => {
    await openWorkbench(page);
    const previousId = await getActiveId(page);

    await page.locator('[data-action="new-session"]').click();
    const sessionId = await waitActiveChange(page, previousId);
    await waitLive(page);

    // 被选中：唯一 .is-active，会话头标题是新建标题，且已 attach 出空快照
    await expect(page.locator(".sidebar .session.is-active")).toHaveCount(1);
    const activeMeta = await getActiveMeta(page);
    expect(activeMeta?.id).toBe(sessionId);
    await expect(page.locator(".sidebar .session.is-active")).toHaveAttribute(
      "aria-label",
      activeMeta?.title ?? "",
    );
    await expect(page.locator(".sessionhead__title")).toContainText(/新会话|New session/);
    expect((await getSessions(page)).some((s) => s.id === sessionId)).toBe(true);

    // 发一句真实 prompt：正文/思维链是流式的（先 turnActive=true，再收口 stats）
    await sendMessage(page, PING);
    await waitUserMessage(page, PING);
    const settled = await waitTurnOrOutage(page);
    if (settled.outage) {
      test.skip(
        true,
        `provider connection failure (environment, not a GUI failure): ${settled.outage}`,
      );
    }
    expect(settled.sawActive).toBe(true);

    // assistant.end.text 是权威全文：出现且不重复/不缺字（合批下仍正确）
    const replies = await assistantTexts(page);
    expect(replies.length).toBeGreaterThan(0);
    const joined = replies.join("\n");
    expect(joined).toContain("收到");
    expect(joined).not.toContain("收到收到");
    expect((joined.match(/收到/g) ?? []).length).toBeLessThanOrEqual(2);

    // 用户消息只出现一次（乐观消息被 turn.start 对账掉，不重影）
    const users = await userMessageTexts(page);
    expect(users.filter((text) => text.includes(PING))).toHaveLength(1);

    // .stats 恰好一份（本会话唯一一轮）
    expect(await statsCount(page)).toBe(1);

    await renameActive(page, `e2e-new-session-${Date.now()}`);
  });

  test("3) @llm 两会话并行：A 跑 turn 时切 B 发消息互不串流；切回 A 历史仍在", async ({ page }) => {
    await openWorkbench(page);
    const sessionA = await requireActiveId(page);
    const textA = "只回复两个字：收到A";
    const textB = "只回复两个字：收到B";

    // A 起一轮（不等待收口就切走 —— A 的 worker 继续在后台跑）
    await sendMessage(page, textA);
    await waitUserMessage(page, textA);
    const startedOutage = await waitTurnStartedOrOutage(page);
    if (startedOutage) {
      test.skip(
        true,
        `provider connection failure (environment, not a GUI failure): ${startedOutage}`,
      );
    }

    await page.locator('[data-action="new-session"]').click();
    const sessionB = await waitActiveChange(page, sessionA);
    await waitLive(page);
    expect(sessionB).not.toBe(sessionA);

    // B 是新会话：transcript 不含 A 的任何内容
    const beforeB = (await userMessageTexts(page)).join("\n");
    expect(beforeB).not.toContain("收到A");

    await sendMessage(page, textB);
    await waitUserMessage(page, textB);
    await requireModel(page);

    // 互不串流：B 的用户消息/回复都不含 A 的文本
    const bAll = `${(await userMessageTexts(page)).join("\n")}\n${(await assistantTexts(page)).join("\n")}`;
    expect(bAll).not.toContain("收到A");
    expect(bAll).toContain("收到B");

    // 切回 A：attach 完整快照，A 的历史（用户消息 + 已完成的回复 + stats）都在
    await selectSessionViaUi(page, sessionA);
    await waitActiveId(page, sessionA);
    await waitLive(page);
    await waitUserMessage(page, textA);
    await requireModel(page);
    const aAll = `${(await userMessageTexts(page)).join("\n")}\n${(await assistantTexts(page)).join("\n")}`;
    expect(aAll).toContain("收到A");
    expect(aAll).not.toContain("收到B");

    await renameActive(page, `e2e-parallel-${Date.now()}`);
  });

  test("4) @llm session.close → worker 退出（列表状态 idle/dead），再次 attach 恢复历史", async ({
    page,
  }) => {
    await openWorkbench(page);
    const sessionId = await requireActiveId(page);
    await sendMessage(page, PING);
    await requireModel(page);
    await renameActive(page, `e2e-close-${Date.now()}`);

    await page.locator('[data-action="close-session"]').click();
    // GUI close 语义：close 当前会话后自动 attach 下一条 / 新建一条
    await expect.poll(() => getActiveId(page), { timeout: 30_000 }).not.toBe(sessionId);
    await waitLive(page);

    // Hub 侧：worker 已退出（session.list 状态不再是 working）
    await expect
      .poll(() => getSessionStatus(page, sessionId), {
        timeout: 20_000,
        intervals: [200, 500, 1_000],
      })
      .toMatch(/^(idle|dead)$/);

    // DOM：关闭后的会话条目状态 chip 显示 空闲/已断开（不是 运行中）
    const closedIndex = (await getSessions(page)).findIndex((session) => session.id === sessionId);
    if (closedIndex >= 0) {
      await expect(
        page.locator(".sidebar .session").nth(closedIndex).locator(".session__state"),
      ).toContainText(/空闲|已断开|Idle|Detached/);
    }

    // 再次 attach（会话文件保留在磁盘 → Hub 拉起 --resume）：历史完整恢复
    const listed = (await getSessions(page)).some((s) => s.id === sessionId);
    if (listed) {
      await selectSessionViaUi(page, sessionId);
    } else {
      // 磁盘摘要暂未进入列表时，走控制器 attach（等价于点列表；协议能力本身仍需覆盖）
      await page.evaluate((id) => {
        const neo = (
          window as unknown as {
            __neo: { actions: { selectSession: (x: string) => Promise<boolean> } };
          }
        ).__neo;
        return neo.actions.selectSession(id);
      }, sessionId);
    }
    await waitActiveId(page, sessionId);
    await waitLive(page);
    await waitUserMessage(page, PING);
    await expect(page.locator(".stream .stats").last()).toBeVisible({ timeout: 60_000 });
    expect((await assistantTexts(page)).join("\n")).toContain("收到");
  });

  test("5) @llm 刷新重连：自动重连并 attach 完整快照，历史不重影", async ({ page }) => {
    await openWorkbench(page);
    const sessionId = await requireActiveId(page);
    await sendMessage(page, PING);
    await requireModel(page);
    await renameActive(page, `e2e-reload-${Date.now()}`);

    await expect(page.locator(".stream .msg--user")).toHaveCount(1);
    await expect(page.locator(".stream .stats")).toHaveCount(1);

    // 刷新：localStorage["neo.activeSession"] 让 GUI 重连后 attach 同一会话
    await page.reload();
    await expect(page.locator("#app")).toBeVisible({ timeout: 45_000 });
    await waitLive(page);
    await waitActiveId(page, sessionId);
    await expect(page.locator(".stream .msg--user")).toHaveCount(1);
    await expect(page.locator(".stream .stats")).toHaveCount(1);

    // 同一用户消息只出现一次（快照重建不重影）；assistant 正文也只有一份
    const users = await userMessageTexts(page);
    expect(users.filter((text) => text.includes(PING))).toHaveLength(1);
    const replies = await assistantTexts(page);
    expect(replies.filter((text) => text.includes("收到"))).toHaveLength(1);
  });

  test("7) @llm transcript 历史：切到有历史的会话块渲染完整 + transcript.fetch 翻页", async ({
    page,
  }) => {
    await openWorkbench(page);
    const firstId = await requireActiveId(page);
    await sendMessage(page, PING);
    await requireModel(page);
    await renameActive(page, `e2e-history-${Date.now()}`);
    await expect(page.locator(".stream .stats")).toHaveCount(1);

    // 新建第二个会话（切走），确认新会话快照为空
    await page.locator('[data-action="new-session"]').click();
    const secondId = await waitActiveChange(page, firstId);
    await waitLive(page);
    expect(secondId).not.toBe(firstId);
    await expect(page.locator(".stream .msg--user")).toHaveCount(0);

    // 切回第一个会话：历史块从磁盘快照重建
    await selectSessionViaUi(page, firstId);
    await waitActiveId(page, firstId);
    await waitLive(page);
    await waitUserMessage(page, PING);
    await expect(page.locator(".stream .stats")).toHaveCount(1);
    expect((await assistantTexts(page)).join("\n")).toContain("收到");

    // 协议能力 transcript.fetch{fromSeq,limit}：分页拉历史事件（含 stats 终态）
    const fetched = await fetchTranscriptViaAction(page, 1, 200);
    expect(fetched).not.toBeNull();
    const events = fetched?.events ?? [];
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((event) => event.event.type)).toEqual(
      expect.arrayContaining(["turn.start", "assistant.end", "stats"]),
    );
    expect(events[0]?.seq).toBeGreaterThanOrEqual(1);
  });
});
