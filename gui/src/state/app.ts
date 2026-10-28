/**
 * state/app.ts — 控制器：唯一允许“改 store / 发命令”的地方。
 *
 * 流程：auth(HTTP) → hub(WS) → message routing → store → Preact 重渲染。
 * 组件只读 store 并调用这里的动作，不自己拼协议。
 */

import { type I18nKey, type Lang, lang, setLang, t } from "@/i18n";
import { httpBase } from "@/lib/endpoints.ts";
import type {
  ClientCommand,
  HubErrorCode,
  ServerMessage,
  SessionEvent,
  SessionMeta,
  SessionState,
  SettingsPatch,
  SettingsView,
  Usage,
  UsageRecord,
  User,
} from "@/protocol";
import {
  appendOptimisticUser,
  applyEvent,
  hydrate,
  removeUserByClientId,
} from "@/state/session.ts";
import { pushToast, setStateFor, store } from "@/state/store.ts";
import { HubClient } from "@/transport/hub.ts";

const TOKEN_KEY = "neo.token";
const USER_KEY = "neo.user";

let hub: HubClient | null = null;

const ERROR_KEYS: Record<HubErrorCode, I18nKey> = {
  unauthorized: "errors.unauthorized",
  forbidden: "errors.forbidden",
  not_found: "errors.not_found",
  conflict: "errors.conflict",
  rate_limited: "errors.rate_limited",
  timeout: "errors.timeout",
  approval_expired: "errors.approval_expired",
  session_gone: "errors.session_gone",
  protocol: "errors.protocol",
  internal: "errors.internal",
};

/* ------------------------------ 登录 ------------------------------ */

export async function login(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${httpBase()}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return false;
  const grant = (await res.json()) as { token: string; user: User };
  store.token.value = grant.token;
  store.user.value = grant.user;
  sessionStorage.setItem(TOKEN_KEY, grant.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(grant.user));
  connect();
  return true;
}

export async function logout(): Promise<void> {
  const token = store.token.value;
  if (token) {
    await fetch(`${httpBase()}/api/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  hub?.disconnect();
  hub = null;
  store.token.value = null;
  store.user.value = null;
  store.sessions.value = [];
  store.states.value = {};
  store.activeId.value = null;
  store.settings.value = null;
  store.usage.value = null;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  pushToast(t("toast.signedOut"));
}

/** 刷新页面后凭 sessionStorage 恢复（token 不进 localStorage） */
export function restoreSession(): boolean {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const rawUser = sessionStorage.getItem(USER_KEY);
  if (!token || !rawUser) return false;
  try {
    store.token.value = token;
    store.user.value = JSON.parse(rawUser) as User;
    connect();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ 连接 ------------------------------ */

function connect(): void {
  hub?.disconnect();
  hub = new HubClient({
    getToken: () => store.token.value,
    getLang: () => lang.value,
    onStatus: (status) => {
      store.connection.value = status;
    },
    onReady: (isReconnect) => {
      void onReady(isReconnect);
    },
    onMessage: (msg) => {
      onMessage(msg);
    },
    onProtocolError: (message) => pushToast(t("errors.protocol"), { sub: message, kind: "danger" }),
  });
  hub.connect();
}

async function onReady(isReconnect: boolean): Promise<void> {
  store.reconnecting.value = false;
  await refreshSessions();
  await refreshSettings();
  const id = store.activeId.value ?? store.sessions.value[0]?.id ?? null;
  if (id) await selectSession(id, { reattach: isReconnect });
  await refreshUsage("session");
  store.connection.value = "live";
  if (isReconnect) pushToast(t("toast.reconnected"));
}

function onMessage(msg: ServerMessage): void {
  switch (msg.kind) {
    case "snapshot": {
      const previous = store.states.value[msg.sessionId];
      setStateFor(msg.sessionId, hydrate(msg.snapshot, previous));
      mergeMeta(msg.snapshot.meta);
      return;
    }
    case "event": {
      onEvent(msg.sessionId, msg.event);
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

function onEvent(sessionId: string, event: SessionEvent): void {
  if (event.type === "auth.expired") {
    pushToast(t("errors.unauthorized"), { kind: "danger" });
    void logout();
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
  setStateFor(sessionId, applyEvent(current, event));
  if (event.type === "session.meta") mergeMeta(event.meta);
  if (event.type === "stats") {
    void refreshSessions();
    void refreshUsage("session");
  }
}

/* ------------------------------ 命令 ------------------------------ */

async function request<T>(command: ClientCommand): Promise<T | null> {
  if (!hub) return null;
  try {
    return await hub.request<T>(command);
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
  if (data) store.sessions.value = data.sessions;
}

export async function refreshSettings(): Promise<void> {
  const data = await request<{ settings: SettingsView }>({ type: "settings.get" });
  if (data) store.settings.value = data.settings;
}

export async function selectSession(id: string, opts: { reattach?: boolean } = {}): Promise<void> {
  store.activeId.value = id;
  const existing = store.states.value[id];
  await request({
    type: "session.attach",
    sessionId: id,
    lastSeq: opts.reattach && existing ? existing.seq : undefined,
  });
}

export async function createSession(): Promise<void> {
  const result = await request<{ sessionId: string }>({ type: "session.create" });
  if (!result) return;
  await refreshSessions();
  await selectSession(result.sessionId);
  pushToast(t("toast.sessionCreated"), { sub: result.sessionId });
}

export function sendMessage(text: string, refs?: { icon: string; label: string }[]): void {
  const sessionId = store.activeId.value;
  const state = sessionId ? store.states.value[sessionId] : null;
  if (!sessionId || !state || !hub) return;
  const clientId = crypto.randomUUID();
  setStateFor(
    sessionId,
    appendOptimisticUser(state, { id: `local-${clientId}`, clientId, text, at: Date.now() }),
  );
  void hub
    .request({ type: "turn.send", sessionId, text, clientId, refs })
    .catch((error: unknown) => {
      const latest = store.states.value[sessionId];
      if (latest) setStateFor(sessionId, removeUserByClientId(latest, clientId));
      pushToast(t("errors.internal"), {
        sub: error instanceof Error ? error.message : String(error),
        kind: "danger",
      });
    });
}

export async function answerQuestion(blockId: string, key: string): Promise<void> {
  const sessionId = store.activeId.value;
  if (!sessionId) return;
  await request({ type: "question.answer", sessionId, blockId, key });
}

export async function resolveApproval(
  blockId: string,
  decision: "allow" | "deny" | "allow-session",
): Promise<void> {
  const sessionId = store.activeId.value;
  if (!sessionId) return;
  await request({ type: "approval.resolve", sessionId, blockId, decision });
}

export async function runCommand(name: string, args: string[] = []): Promise<void> {
  const sessionId = store.activeId.value;
  if (!sessionId) return;
  await request({ type: "command.run", sessionId, name, args });
}

export async function setTier(
  tier: "deep_reasoning" | "balanced" | "fast" | "default",
): Promise<void> {
  await runCommand("tier", [tier]);
}

export function setMode(mode: (typeof store.mode)["value"]): void {
  store.mode.value = mode;
}

export async function renameSession(id: string, title: string): Promise<void> {
  await request({ type: "session.rename", sessionId: id, title });
}

export async function closeSession(id: string): Promise<void> {
  await request({ type: "session.close", sessionId: id });
  await refreshSessions();
  if (store.activeId.value === id) {
    const next = store.sessions.value[0];
    if (next) await selectSession(next.id);
  }
}

export async function patchSettings(patch: SettingsPatch): Promise<void> {
  const data = await request<{ settings: SettingsView }>({ type: "settings.patch", patch });
  if (data) store.settings.value = data.settings;
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
