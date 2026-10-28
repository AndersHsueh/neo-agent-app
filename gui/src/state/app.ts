/**
 * state/app.ts — 控制器：唯一允许“改 store / 发命令”的地方。
 *
 * 流程：discovery(HTTP) → hub(WS) → message routing → store → Preact 重渲染。
 * 组件只读 store 并调用这里的动作，不自己拼协议。
 *
 * v0.0.2 Hub 语义（见 neo-core-serve/docs/gui-integration-v0.0.2.md）：
 *  - 一条连接同一时刻只绑定一个会话：换会话必须先 detach；
 *  - 会话命令必须已 attach（显式 sessionId 不能绕过）；settings.get 例外；
 *  - attach 总是返回完整 snapshot，断线重连以 snapshot 重建；
 *  - session.create 必须带 title，否则会话文件不会落盘、立刻 attach 会 not_found。
 */

import { type I18nKey, type Lang, lang, setLang, t } from "@/i18n";
import { type Endpoint, endpointLabel } from "@/lib/endpoints.ts";
import type {
  ClientCommand,
  CommandChanges,
  HubErrorCode,
  ImageAttachmentInput,
  PermissionMode,
  ServerMessage,
  SessionEvent,
  SessionMeta,
  SessionState,
  SettingsPatch,
  SettingsView,
  Usage,
  UsageRecord,
  ViewBlock,
} from "@/protocol";
import {
  appendOptimisticUser,
  applyEvent,
  hydrate,
  removeUserByClientId,
} from "@/state/session.ts";
import { pushToast, setStateFor, store } from "@/state/store.ts";
import { HubClient } from "@/transport/hub.ts";

const ACTIVE_KEY = "neo.activeSession";

let hub: HubClient | null = null;
/** 当前连接绑定的会话（与服务端一致；null = 未 attach） */
let attachedId: string | null = null;
/** session → epoch（断线重连时回传给 attach） */
const epochs = new Map<string, string>();

const ERROR_KEYS: Record<HubErrorCode, I18nKey> = {
  unauthorized: "errors.unauthorized",
  forbidden: "errors.forbidden",
  not_found: "errors.not_found",
  conflict: "errors.conflict",
  rate_limited: "errors.rate_limited",
  timeout: "errors.timeout",
  approval_expired: "errors.approval_expired",
  question_expired: "errors.question_expired",
  session_gone: "errors.session_gone",
  slow_consumer: "errors.slow_consumer",
  unsupported: "errors.unsupported",
  too_large: "errors.too_large",
  protocol: "errors.protocol",
  internal: "errors.internal",
};

/* ------------------------------ 启动 / 发现 ------------------------------ */

/** 启动链：建立连接（内部做发现）。发现失败 → 登录页兜底 + 自动退避重试。 */
export function bootstrap(): void {
  hub?.disconnect();
  hub = null;
  attachedId = null;
  store.boot.value = "booting";
  store.bootError.value = null;
  store.connection.value = "connecting";
  connect();
}

/** 用户点「重新检测」：立即重来一轮发现+连接 */
export function retryDiscovery(): void {
  if (hub) {
    store.bootError.value = null;
    store.boot.value = "booting";
    hub.reconnectNow();
    return;
  }
  bootstrap();
}

function connect(): void {
  hub = new HubClient({
    onStatus: (status) => {
      store.connection.value = status;
      if (status === "live" || status === "attaching") store.boot.value = "ready";
    },
    onDiscoveryError: (reason) => {
      store.boot.value = "offline";
      store.bootError.value = reason;
      store.user.value = null;
      store.connection.value = "error";
    },
    onEndpoint: (endpoint) => {
      // 发现成功但 WS 可能还没通：先把端点/用户填上，UI 进工作台并用 connbar 显示离线，
      // 而不是卡在登录页（登录页只负责「发现失败」）。
      store.endpoint.value = endpoint;
      store.user.value = endpoint.user;
      if (store.boot.value !== "ready") store.boot.value = "connecting";
    },
    onAuthError: () => {
      // 4401：token 轮换。transport 会重新发现（拿到新 token）后重连。
      pushToast(t("errors.unauthorized"), { kind: "warn" });
    },
    onProtocolError: (message) => pushToast(t("errors.protocol"), { sub: message, kind: "danger" }),
    onReady: (ready, endpoint, isReconnect) => {
      void onReady(ready, endpoint, isReconnect);
    },
    onMessage,
  });
  hub.start();
}

async function onReady(
  ready: Extract<ServerMessage, { kind: "ready" }>,
  endpoint: Endpoint,
  isReconnect: boolean,
): Promise<void> {
  store.endpoint.value = endpoint;
  store.user.value = ready.user;
  store.capabilities.value = ready.capabilities ?? [];
  store.versions.value = {
    core: ready.coreVersion ?? endpoint.coreVersion ?? null,
    protocol: ready.protocolVersion ?? endpoint.protocolVersion ?? null,
  };
  store.boot.value = "ready";
  store.bootError.value = null;
  store.reconnecting.value = isReconnect;

  await refreshSessions();
  await refreshSettings();

  // 只恢复上次打开的会话；没有就新建一个，不去 attach 别人的/随机的历史会话
  // （v0.0.2 单客户端 attach：抢别人的会话会 conflict，且会白拉一个 worker）。
  const persisted = localStorage.getItem(ACTIVE_KEY);
  const candidate =
    persisted && store.sessions.value.some((s) => s.id === persisted) ? persisted : null;

  let attached = candidate ? await selectSession(candidate, { reattach: isReconnect }) : false;
  if (!attached) attached = await createSession({ silent: true });
  if (!attached) {
    store.connection.value = "live";
    return;
  }

  await refreshUsage("session");
  store.connection.value = "live";
  if (isReconnect) pushToast(t("toast.reconnected"));
}

/* ------------------------------ 消息路由 ------------------------------ */

function onMessage(msg: ServerMessage): void {
  switch (msg.kind) {
    case "snapshot": {
      const previous = store.states.value[msg.sessionId];
      const next = hydrate(msg.snapshot, previous);
      setStateFor(msg.sessionId, { ...next, seq: Math.max(msg.seq ?? 0, next.seq) });
      if (msg.snapshot.epoch) epochs.set(msg.sessionId, msg.snapshot.epoch);
      if (msg.snapshot.meta) {
        mergeMeta(msg.snapshot.meta);
        store.mode.value = msg.snapshot.meta.mode ?? store.mode.value;
      }
      return;
    }
    case "event": {
      onEvent(msg.sessionId, msg.event, msg.seq);
      return;
    }
    case "sessions": {
      store.sessions.value = msg.sessions;
      return;
    }
    case "settings": {
      store.settings.value = msg.settings;
      return;
    }
    case "usage": {
      store.usage.value = { range: msg.range, records: msg.records, totals: msg.totals };
      return;
    }
    default:
      return;
  }
}

function mergeMeta(meta: SessionMeta): void {
  const list = store.sessions.value;
  const index = list.findIndex((s) => s.id === meta.id);
  store.sessions.value =
    index === -1 ? [meta, ...list] : list.map((s) => (s.id === meta.id ? meta : s));
}

function onEvent(sessionId: string, event: SessionEvent, seq: number): void {
  if (event.type === "auth.expired") {
    pushToast(t("errors.unauthorized"), { kind: "danger" });
    logout();
    return;
  }
  if (event.type === "peer.update") {
    store.peers.value = event.peers.map((peer) => ({
      name: peer.name,
      status: peer.status,
      age: peer.age,
      activity: { zh: peer.activity, en: peer.activity },
    }));
    return;
  }
  const current = store.states.value[sessionId];
  if (!current) return;
  const next = applyEvent(current, event);
  setStateFor(sessionId, { ...next, seq: Math.max(seq ?? 0, next.seq ?? 0) });

  switch (event.type) {
    case "session.meta":
      mergeMeta(event.meta);
      break;
    case "turn.aborted": {
      // reducer 只收口流式状态；给用户留一条可见的结束原因（本地化在 app 层做）。
      const latest = store.states.value[sessionId];
      if (latest) {
        const withBanner = applyEvent(latest, {
          type: "banner",
          blockId: `banner-${event.blockId}`,
          at: event.at,
          level: "warn",
          text: t("transcript.aborted"),
        });
        setStateFor(sessionId, { ...withBanner, seq: latest.seq });
      }
      void refreshSessions();
      void refreshUsage("session");
      break;
    }
    case "stats":
      void refreshSessions();
      void refreshUsage("session");
      break;
    case "session.status":
      if (event.status === "dead") {
        // worker 退出：Hub 已解绑该连接，重新 attach 会拉起 --resume。
        attachedId = null;
        if (store.activeId.value === sessionId) {
          setTimeout(() => {
            if (hub && store.activeId.value === sessionId) {
              void selectSession(sessionId, { reattach: true });
            }
          }, 400);
        }
      }
      break;
    default:
      break;
  }
}

/* ------------------------------ 命令 ------------------------------ */

async function request<T>(command: ClientCommand, timeoutMs?: number): Promise<T | null> {
  if (!hub) return null;
  try {
    return await hub.request<T>(command, timeoutMs);
  } catch (error) {
    const code = (error as { code?: HubErrorCode }).code;
    const key = code ? (ERROR_KEYS[code] ?? "errors.internal") : "errors.internal";
    pushToast(t(key), {
      sub: error instanceof Error ? error.message : String(error),
      kind: "danger",
    });
    return null;
  }
}

export async function refreshSessions(): Promise<void> {
  const data = await request<{ sessions: SessionMeta[] }>({ type: "session.list" });
  if (!data) return;
  // session.list 的 title/provider/tier/mode 是占位值（见 docs/hub-probe-findings.md P2），
  // 真源是 attach 后的 snapshot.meta：已 attach 过的会话以本地 state.meta 校正，别被列表覆盖。
  store.sessions.value = data.sessions.map((fresh) => {
    const known = store.states.value[fresh.id]?.meta;
    if (!known) return fresh;
    return {
      ...fresh,
      title: known.title || fresh.title,
      tier: known.tier,
      provider: known.provider || fresh.provider,
      model: known.model || fresh.model,
      mode: known.mode ?? fresh.mode,
      cwd: known.cwd || fresh.cwd,
    };
  });
}

export async function refreshSettings(): Promise<void> {
  const data = await request<{ settings: SettingsView }>({ type: "settings.get" });
  if (data) store.settings.value = data.settings;
}

/** 切换会话：先 detach 旧绑定，再 attach 新会话（v0.0.2 单连接单会话）。 */
export async function selectSession(
  id: string,
  opts: { reattach?: boolean } = {},
): Promise<boolean> {
  if (!hub) return false;
  if (attachedId === id && !opts.reattach) {
    store.activeId.value = id;
    localStorage.setItem(ACTIVE_KEY, id);
    return true;
  }
  if (attachedId && attachedId !== id) {
    await hub.request({ type: "session.detach", sessionId: attachedId }, 5_000).catch(() => null);
    attachedId = null;
  }
  const previous = store.states.value[id];
  const attach = await request<{ role: string }>(
    {
      type: "session.attach",
      sessionId: id,
      lastSeq: opts.reattach && previous ? previous.seq : undefined,
      epoch: opts.reattach ? epochs.get(id) : undefined,
    },
    45_000,
  );
  if (!attach) return false;
  attachedId = id;
  store.activeId.value = id;
  localStorage.setItem(ACTIVE_KEY, id);
  return true;
}

export async function createSession(opts: { silent?: boolean } = {}): Promise<boolean> {
  if (!hub) return false;
  const time = new Date().toLocaleTimeString(lang.value === "zh" ? "zh-CN" : "en-GB", {
    hour12: false,
  });
  const title = t("session.newTitle", { time });
  // 必须带 title：Hub 只在 rename/首轮时落盘，否则 session.attach 会 not_found。
  const result = await request<{ sessionId: string }>({ type: "session.create", title });
  if (!result) return false;
  await refreshSessions();
  const ok = await selectSession(result.sessionId);
  if (ok && !opts.silent) pushToast(t("toast.sessionCreated"), { sub: result.sessionId });
  return ok;
}

export function sendMessage(
  text: string,
  refs?: { icon: string; label: string }[],
  attachments?: ImageAttachmentInput[],
): void {
  const sessionId = store.activeId.value;
  const state = sessionId ? store.states.value[sessionId] : null;
  if (!sessionId || !state || !hub) return;
  const clientId = crypto.randomUUID();
  const previews = attachments?.length
    ? attachments.map((a) => ({
        mime: a.mime as string,
        dataUrl: `data:${a.mime};base64,${a.dataBase64}`,
      }))
    : undefined;
  setStateFor(
    sessionId,
    appendOptimisticUser(state, {
      id: `local-${clientId}`,
      clientId,
      text,
      at: Date.now(),
      attachments: previews,
    }),
  );
  void hub
    .request({
      type: "turn.send",
      sessionId,
      text,
      clientId,
      refs,
      attachments: attachments?.length ? attachments : undefined,
    })
    .catch((error: unknown) => {
      const latest = store.states.value[sessionId];
      if (latest) setStateFor(sessionId, removeUserByClientId(latest, clientId));
      const code = (error as { code?: HubErrorCode }).code;
      pushToast(t(code ? (ERROR_KEYS[code] ?? "errors.internal") : "errors.internal"), {
        sub: error instanceof Error ? error.message : String(error),
        kind: "danger",
      });
    });
}

export async function answerQuestion(
  blockId: string,
  answer: string | { key?: string; keys?: string[]; custom?: string },
): Promise<void> {
  const sessionId = store.activeId.value;
  if (!sessionId) return;
  const payload = typeof answer === "string" ? { key: answer } : answer;
  await request({
    type: "question.answer",
    sessionId,
    blockId,
    key: payload.key,
    keys: payload.keys,
    custom: payload.custom,
  });
}

export async function resolveApproval(
  blockId: string,
  decision: "allow" | "deny" | "allow-session",
): Promise<void> {
  const sessionId = store.activeId.value;
  if (!sessionId) return;
  await request({ type: "approval.resolve", sessionId, blockId, decision });
}

/** `command.run` 的回执形状（命令面板据此渲染结果块） */
export interface CommandOutcomeView {
  ok: boolean;
  blocks?: ViewBlock[];
  changes?: CommandChanges;
  error?: { code: string; message: string } | null;
}

export async function runCommand(
  name: string,
  args: string[] = [],
): Promise<CommandOutcomeView | null> {
  const sessionId = store.activeId.value;
  if (!sessionId) return null;
  return await request<CommandOutcomeView>({ type: "command.run", sessionId, name, args });
}

export async function setTier(
  tier: "deep_reasoning" | "balanced" | "fast" | "default",
): Promise<void> {
  await runCommand("tier", [tier]);
}

export async function setMode(mode: PermissionMode): Promise<void> {
  store.mode.value = mode;
  await request({ type: "mode.set", mode });
}

export async function renameSession(id: string, title: string): Promise<void> {
  await request({ type: "session.rename", sessionId: id, title });
}

export async function closeSession(id: string = store.activeId.value ?? ""): Promise<void> {
  if (!id || !hub) return;
  const ok = await request({ type: "session.close", sessionId: id });
  if (!ok) return;
  if (attachedId === id) attachedId = null;
  if (store.activeId.value === id) {
    store.activeId.value = null;
    localStorage.removeItem(ACTIVE_KEY);
  }
  epochs.delete(id);
  await refreshSessions();
  // 会话列表是磁盘摘要，可能包含刚被别的进程删掉的文件 → 逐个尝试，失败就新建。
  for (const candidate of store.sessions.value.filter((s) => s.id !== id)) {
    if (await selectSession(candidate.id)) return;
    await refreshSessions();
  }
  await createSession({ silent: true });
}

/** v0.0.2 Hub 不支持 settings.patch：只读展示，不假装成功。 */
export async function patchSettings(_patch: SettingsPatch): Promise<void> {
  pushToast(t("toast.readonly"), { kind: "warn" });
}

export async function refreshUsage(range: "session" | "day" | "month"): Promise<void> {
  const sessionId = store.activeId.value ?? undefined;
  const data = await request<{
    range: "session" | "day" | "month";
    records: UsageRecord[];
    totals: Usage;
  }>({
    type: "usage.summary",
    range,
    sessionId: range === "session" ? sessionId : undefined,
  });
  if (data) store.usage.value = { range: data.range, records: data.records, totals: data.totals };
}

/** 拉历史（分页）：v0.0.2 attach 总给完整快照，此动作供「更早历史/续拉」场景与联调验证。 */
export async function fetchTranscript(
  fromSeq = 1,
  limit = 200,
): Promise<{ events: { seq: number; event: SessionEvent }[]; nextSeq?: number } | null> {
  const sessionId = store.activeId.value;
  if (!sessionId) return null;
  const data = await request<{
    events: { seq: number; event: SessionEvent }[];
    nextSeq?: number;
  }>({ type: "transcript.fetch", sessionId, fromSeq, limit });
  if (data) pushToast(t("toast.historyLoaded"), { sub: `+${data.events.length}` });
  return data;
}

export function abortTurn(): void {
  const sessionId = store.activeId.value;
  if (!sessionId || !hub) return;
  hub.emit({ type: "turn.abort", sessionId });
  pushToast(t("toast.turnAborted"), { kind: "warn" });
}

export function changeLang(next: Lang): void {
  setLang(next);
}

export function currentState(): SessionState | null {
  const id = store.activeId.value;
  return id ? (store.states.value[id] ?? null) : null;
}

export function logout(): void {
  hub?.disconnect();
  hub = null;
  attachedId = null;
  epochs.clear();
  store.user.value = null;
  store.token.value = null;
  store.endpoint.value = null;
  store.sessions.value = [];
  store.states.value = {};
  store.activeId.value = null;
  store.settings.value = null;
  store.usage.value = null;
  store.capabilities.value = [];
  store.boot.value = "offline";
  store.bootError.value = null;
  store.connection.value = "idle";
  localStorage.removeItem(ACTIVE_KEY);
  pushToast(t("toast.signedOut"));
}

/** 调试/联调用的只读摘要 */
export function hubSummary(): string {
  const endpoint = store.endpoint.value;
  return endpoint ? `${endpointLabel(endpoint)} · core ${store.versions.value.core ?? "?"}` : "—";
}
