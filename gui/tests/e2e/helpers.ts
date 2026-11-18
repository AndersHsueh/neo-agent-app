/**
 * e2e helpers —— 真实 Hub（neo-core-serve v0.0.2）+ 真实 LLM。
 *
 * 环境事实（见 neo-core-serve/docs/gui-integration-v0.0.2.md §4/§5/§8）：
 *  - GUI 通过 `GET /__neo/endpoint` 发现 Hub 并自动登录（无登录页）；
 *  - session.create 必须带 title，否则会话不落盘、立刻 attach 会 not_found；
 *  - v0.0.2 同一 session 同时只允许一个客户端 attach（第二个 → conflict）；
 *  - 换会话要先 detach（GUI 的 selectSession 已处理）；attach 总是完整快照；
 *  - session.list 的 title 是**占位值**（由 id 派生），选中后以 snapshot.meta 为准
 *    → 用例不按标题找会话，一律按 sessionId（下面是 DOM 索引点击 + store 断言）；
 *  - 服务端会合批 delta，不断言分片数量/连续 seq；
 *  - 会话文件持久化在 ~/.neo/sessions（已有 94+ 条历史）→ 断言不依赖总数，
 *    每个用例自建自用，标题统一改名为 `e2e-` 前缀便于清理。
 */
import { expect, type Page } from "@playwright/test";

/** 发现+握手+首次 attach：真实 Hub 冷启动 worker 可能 1–3s。 */
export const HUB_LIVE_TIMEOUT = 45_000;
/** 一轮真实 LLM turn（约 3–8s）给足。 */
export const TURN_TIMEOUT = 100_000;

/** 1×1 透明 PNG（合法、极小，能被 Hub 的图片校验接受）。 */
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* ------------------------------------------------------------------ */
/* 页面内可读的调试桥（main.tsx 在 DEV 下挂的 window.__neo）           */
/* ------------------------------------------------------------------ */

interface Signal<T> {
  value: T;
}

interface SessionMetaLite {
  id: string;
  title: string;
  status: string;
  tier: string;
  model: string;
  mode: string;
}

/** 给用例的摘要：blocks 是数量、turnActive 已摊平（store 里在 streaming 子对象） */
interface SessionStateLite {
  seq: number;
  blocks: number;
  turnActive: boolean;
}

/** window.__neo.store.states 里的原始 SessionState（只声明用到的字段） */
interface RawSessionState {
  seq: number;
  blocks: { kind: string }[];
  streaming?: { turnActive?: boolean };
}

interface FetchedEvent {
  seq: number;
  event: { type: string };
}

interface NeoBridge {
  store: {
    connection: Signal<string>;
    boot: Signal<string>;
    bootError: Signal<string | null>;
    activeId: Signal<string | null>;
    sessions: Signal<SessionMetaLite[]>;
    states: Signal<Record<string, RawSessionState>>;
    capabilities: Signal<string[]>;
    endpoint: Signal<{ url: string; token: string } | null>;
    user: Signal<{ id: string } | null>;
    toasts: Signal<{ text: string; sub?: string; kind: string }[]>;
  };
  actions: {
    createSession: (opts?: { silent?: boolean }) => Promise<boolean>;
    selectSession: (id: string, opts?: { reattach?: boolean }) => Promise<boolean>;
    closeSession: (id?: string) => Promise<void>;
    renameSession: (id: string, title: string) => Promise<void>;
    runCommand: (name: string, args?: string[]) => Promise<unknown>;
    fetchTranscript: (
      fromSeq?: number,
      limit?: number,
    ) => Promise<{ events: FetchedEvent[]; nextSeq?: number } | null>;
    sendMessage: (text: string, refs?: unknown, attachments?: unknown[]) => void;
  };
}

const bridge = (page: Page) =>
  page.evaluate(() => (window as unknown as { __neo: NeoBridge }).__neo);

/* ------------------------------------------------------------------ */
/* 启动                                                               */
/* ------------------------------------------------------------------ */

/** 只做准备（不开页面）：关掉 2.5s 开机动画，让 Boot 立即 onDone。 */
export async function preparePage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("neo.motion", "reduced");
    } catch {
      /* about:blank 等无 origin 场景 */
    }
  });
}

/** 打开 GUI 并等到「发现即登录」完成：.app + connection=live + 会话已 attach。 */
export async function openWorkbench(page: Page, lang: "zh" | "en" = "zh"): Promise<void> {
  await preparePage(page);
  await page.goto(`/?lang=${lang}`);
  await expect(page.locator("#app")).toBeVisible({ timeout: HUB_LIVE_TIMEOUT });
  await waitLive(page);
  await waitAttached(page);
}

export async function waitLive(page: Page, timeout = HUB_LIVE_TIMEOUT): Promise<void> {
  await expect
    .poll(() => getConn(page), { timeout, intervals: [100, 250, 500, 1_000] })
    .toBe("live");
  await expect(page.locator(".connbar")).toHaveCount(0);
}

export async function waitAttached(page: Page, timeout = HUB_LIVE_TIMEOUT): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const neo = (window as unknown as { __neo: NeoBridge }).__neo;
          const id = neo.store.activeId.value;
          return Boolean(id && neo.store.states.value[id]);
        }),
      { timeout, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true);
}

/* ------------------------------------------------------------------ */
/* store 读取（只读；UI 断言优先，这里的值只做定位/清理）               */
/* ------------------------------------------------------------------ */

export async function getConn(page: Page): Promise<string> {
  return page.evaluate(
    () => (window as unknown as { __neo: NeoBridge }).__neo.store.connection.value,
  );
}

export async function getBoot(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __neo: NeoBridge }).__neo.store.boot.value);
}

export async function getBootError(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as unknown as { __neo: NeoBridge }).__neo.store.bootError.value,
  );
}

export async function getActiveId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as unknown as { __neo: NeoBridge }).__neo.store.activeId.value,
  );
}

/** 同上，但用例里要拿它当 string 用（拿不到直接失败，避免 null 静默传播）。 */
export async function requireActiveId(page: Page): Promise<string> {
  const id = await getActiveId(page);
  if (!id) throw new Error("requireActiveId: 没有 active session（未 attach？）");
  return id;
}

export async function getCapabilities(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __neo: NeoBridge }).__neo.store.capabilities.value,
  );
}

export async function getEndpointUrl(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as unknown as { __neo: NeoBridge }).__neo.store.endpoint.value?.url ?? null,
  );
}

export async function getSessions(page: Page): Promise<SessionMetaLite[]> {
  return page.evaluate(() =>
    (window as unknown as { __neo: NeoBridge }).__neo.store.sessions.value.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      tier: s.tier,
      model: s.model,
      mode: s.mode,
    })),
  );
}

export async function getActiveMeta(page: Page): Promise<SessionMetaLite | null> {
  return page.evaluate(() => {
    const neo = (window as unknown as { __neo: NeoBridge }).__neo;
    const id = neo.store.activeId.value;
    if (!id) return null;
    const meta = neo.store.sessions.value.find((s) => s.id === id);
    return meta
      ? {
          id: meta.id,
          title: meta.title,
          status: meta.status,
          tier: meta.tier,
          model: meta.model,
          mode: meta.mode,
        }
      : null;
  });
}

export async function getActiveState(page: Page): Promise<SessionStateLite> {
  return page.evaluate(() => {
    const neo = (window as unknown as { __neo: NeoBridge }).__neo;
    const id = neo.store.activeId.value;
    const state = id ? neo.store.states.value[id] : undefined;
    return {
      seq: state?.seq ?? 0,
      blocks: state?.blocks?.length ?? 0,
      // 注意：turnActive 在 streaming 子对象里（SessionState.streaming.turnActive）
      turnActive: state?.streaming?.turnActive ?? false,
    };
  });
}

export async function getSessionStatus(page: Page, id: string): Promise<string | null> {
  const sessions = await getSessions(page);
  return sessions.find((s) => s.id === id)?.status ?? null;
}

/* ------------------------------------------------------------------ */
/* 会话操作                                                            */
/* ------------------------------------------------------------------ */

export async function waitActiveId(page: Page, id: string, timeout = 30_000): Promise<void> {
  await expect.poll(() => getActiveId(page), { timeout, intervals: [100, 250, 500] }).toBe(id);
}

export async function waitActiveChange(
  page: Page,
  previous: string | null,
  timeout = 30_000,
): Promise<string> {
  await expect
    .poll(() => getActiveId(page), { timeout, intervals: [100, 250, 500] })
    .not.toBe(previous);
  const next = await getActiveId(page);
  if (!next) throw new Error("activeId became null after session switch");
  return next;
}

/** 名称统一改成 e2e- 前缀（会话文件落在 ~/.neo/sessions，便于后续清理）。 */
export async function renameActive(page: Page, title: string): Promise<void> {
  await page.evaluate((nextTitle) => {
    const neo = (window as unknown as { __neo: NeoBridge }).__neo;
    const id = neo.store.activeId.value;
    if (!id) throw new Error("renameActive: no active session");
    return neo.actions.renameSession(id, nextTitle);
  }, title);
  await expect
    .poll(async () => (await getActiveMeta(page))?.title ?? null, { timeout: 15_000 })
    .toBe(title);
}

/** 点 Sidebar 里的会话按钮（列表标题是 Hub 占位值，只能按 store 索引定位）。 */
export async function selectSessionViaUi(page: Page, id: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const index = await page.evaluate((sessionId) => {
      const neo = (window as unknown as { __neo: NeoBridge }).__neo;
      return neo.store.sessions.value.findIndex((s) => s.id === sessionId);
    }, id);
    if (index < 0) throw new Error(`selectSessionViaUi: ${id} 不在 session.list 里`);
    await page.locator(".sidebar .session").nth(index).click();
    try {
      await waitActiveId(page, id, attempt === 2 ? 30_000 : 6_000);
      return;
    } catch {
      // 列表刷新导致顺序变化：重读索引再点一次
    }
  }
  throw new Error(`selectSessionViaUi: 点击后 activeId 未切到 ${id}`);
}

/* ------------------------------------------------------------------ */
/* 消息 / turn                                                         */
/* ------------------------------------------------------------------ */

export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator("#input");
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
}

export async function waitUserMessage(page: Page, text: string, timeout = 20_000): Promise<void> {
  await expect(page.locator(".stream .msg--user").filter({ hasText: text }).first()).toBeVisible({
    timeout,
  });
}

/** 等这一轮真正开始（turnActive=true），用于证明「流式正文在收口前出现」。 */
export async function waitTurnActive(page: Page, timeout = 15_000): Promise<void> {
  await expect
    .poll(async () => (await getActiveState(page)).turnActive, {
      timeout,
      intervals: [50, 100, 200],
    })
    .toBe(true);
}

/** 等一轮收口：.stats 出现（stats 或 turn.aborted 是终态；这里要求 stats）+ turnActive=false。 */
export async function waitTurnDone(page: Page, timeout = TURN_TIMEOUT): Promise<void> {
  await expect(page.locator(".stats").last()).toBeVisible({ timeout });
  await expect
    .poll(async () => (await getActiveState(page)).turnActive, { timeout: 30_000 })
    .toBe(false);
}

/**
 * 视觉夹具，不是 Hub 验收。发现返回一个不可达的 ws，再在 store 里放一条空会话，
 * 用来量顶栏折行和对比度。真实发现 / 重连不走这里。
 */
export async function openVisualFixture(page: Page, lang: "zh" | "en"): Promise<void> {
  await preparePage(page);
  await page.route("**/__neo/endpoint", async (route) => {
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
  await page.goto(`/?lang=${lang}&anim=off`);
  await expect(page.locator("#app")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(
    (sessionTitle) => {
      const neo = (window as unknown as { __neo: { store: Record<string, { value: unknown }> } })
        .__neo;
      const write = (key: string, value: unknown) => {
        const signal = neo.store[key];
        if (!signal) throw new Error(`missing store.${key}`);
        signal.value = value;
      };
      const id = "visual-fixture";
      const now = Date.now();
      const meta = {
        id,
        title: sessionTitle,
        ownerId: "local",
        status: "idle" as const,
        tier: "default" as const,
        provider: "",
        model: "auto",
        cwd: "~/neo",
        createdAt: now,
        updatedAt: now,
        unread: 0,
        mode: "ask" as const,
      };
      write("user", {
        id: "local",
        email: "local@localhost",
        displayName: "Local",
        role: "owner",
      });
      write("sessions", [meta]);
      write("activeId", id);
      write("states", {
        [id]: {
          meta,
          seq: 0,
          blocks: [],
          context: { used: 1200, limit: 100_000, compactAt: 0.75 },
          streaming: { turnActive: false },
        },
      });
      write("peers", []);
      write("boot", "ready");
      write("connection", "live");
      write("sidebar", "sessions");
      write("asideOpen", true);
    },
    lang === "zh" ? "新会话" : "New session",
  );
  await expect(page.locator(".empty__sub")).toBeVisible();
}

/** 用户消息文本（DOM，含 assistant 回复）；用于「不串流/不重影」断言。 */
export async function userMessageTexts(page: Page): Promise<string[]> {
  return page.locator(".stream .msg--user").allInnerTexts();
}

/** assistant 正文文本：排除 thinking 块（ReasoningMessage 也是 .msg--assistant）。 */
export async function assistantTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const node of document.querySelectorAll(".stream .msg--assistant")) {
      if (node.querySelector(".think")) continue; // 思维链块
      out.push((node as HTMLElement).innerText.trim());
    }
    return out;
  });
}

export async function statsCount(page: Page): Promise<number> {
  return page.locator(".stream .stats").count();
}

/* ------------------------------------------------------------------ */
/* 命令面板                                                            */
/* ------------------------------------------------------------------ */

export async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press("Meta+k");
  await expect(page.locator("#palette-input")).toBeVisible();
}

export async function runPaletteCommand(page: Page, line: string): Promise<void> {
  await openPalette(page);
  await page.locator("#palette-input").fill(line);
  await page.locator("#palette-input").press("Enter");
}

/* ------------------------------------------------------------------ */
/* 附件                                                               */
/* ------------------------------------------------------------------ */

export function pngPayload(name = "e2e-1x1.png"): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  return { name, mimeType: "image/png", buffer: PNG_1X1 };
}

export async function attachImages(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<void> {
  await page.locator('input[data-role="image-input"]').setInputFiles(files);
}

/** 等出现匹配文案的 toast（.toast 会自动消失，用 poll 合并所有 toast 文本）。 */
export async function expectToast(page: Page, pattern: RegExp, timeout = 15_000): Promise<void> {
  await expect
    .poll(async () => (await page.locator(".toast").allInnerTexts()).join(" | "), {
      timeout,
      intervals: [100, 250, 500],
    })
    .toMatch(pattern);
}

export async function expectDangerToast(
  page: Page,
  pattern: RegExp,
  timeout = 15_000,
): Promise<void> {
  await expect
    .poll(async () => (await page.locator(".toast--danger").allInnerTexts()).join(" | "), {
      timeout,
      intervals: [100, 250, 500],
    })
    .toMatch(pattern);
}

/* ------------------------------------------------------------------ */
/* 协议旁路（无 UI 入口的能力，Lead 已在 DEV 下暴露 actions）           */
/* ------------------------------------------------------------------ */

export async function fetchTranscriptViaAction(
  page: Page,
  fromSeq = 1,
  limit = 200,
): Promise<{ events: FetchedEvent[]; nextSeq?: number } | null> {
  return page.evaluate(
    ([from, count]) => {
      const neo = (window as unknown as { __neo: NeoBridge }).__neo;
      return neo.actions.fetchTranscript(from, count);
    },
    [fromSeq, limit] as [number, number],
  );
}

/** 绕过 Composer 的本地校验直接发（用来验证 Hub 的 too_large 错误码回传）。 */
export async function sendAttachmentsViaAction(
  page: Page,
  text: string,
  count: number,
): Promise<void> {
  await page.evaluate(
    ([body, n, base64]) => {
      const neo = (window as unknown as { __neo: NeoBridge }).__neo;
      const attachments = Array.from({ length: n }, () => ({
        kind: "image",
        mime: "image/png",
        dataBase64: base64,
      }));
      neo.actions.sendMessage(body, undefined, attachments);
    },
    [text, count, PNG_1X1_BASE64] as [string, number, string],
  );
}
